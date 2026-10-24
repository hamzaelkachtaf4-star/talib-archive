// RC2 4.2/4.4: axe-core (WCAG 2 A/AA, contrast included) + overflow + direction check over
// {ar-RTL, fr-LTR} x {light, dark} x {360, 1280} on key routes. Exit 1 on any serious/critical violation.
//   AXE_PATH=.../axe.min.js E2E_EMAIL=.. E2E_PASSWORD=.. CHROME_BIN=.. node deploy/e2e/rc2-a11y.cjs collector/node_modules/puppeteer http://localhost:3099 [out.json]
// Without AXE_PATH (or frontend/node_modules/axe-core) it prints SKIP and exits 0: the gate must never pretend it ran.
const fs = require("fs");
const path = require("path");
const BASE = process.argv[3] || "http://localhost:3099";
const OUTFILE = process.argv[4];
const axePath = process.env.AXE_PATH || path.resolve(__dirname, "../../frontend/node_modules/axe-core/axe.min.js");
if (!process.argv[2] || !fs.existsSync(axePath)) { console.log("SKIP rc2-a11y: no puppeteer path or axe-core (set AXE_PATH)"); process.exit(0); }
const puppeteer = require(path.resolve(process.argv[2]));
const axeSource = fs.readFileSync(axePath, "utf8");
const session = require("./_auth.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MATRIX = [["ar", "rtl"], ["fr", "ltr"]].flatMap(([lang, dir]) => ["light", "dark"].flatMap((theme) => [360, 1280].map((width) => ({ lang, dir, theme, width }))));

(async () => {
  const s = await session.init(BASE);
  const auth = { Authorization: `Bearer ${s.token}` };
  const mods = await (await fetch(`${BASE}/api/law/path/semesters/S3/modules`, { headers: auth })).json().catch(() => ({}));
  const routes = [["roadmap", "/law/path"], ...(mods.modules?.[0] ? [["module", `/law/path/m/${mods.modules[0].id}`]] : []), ["lesson-review", "/law/exam/cards"], ["legal-chat", "/law/library/chat"], ["hub", "/law/community/hub"], ["profile", "/law/profile"], ["today", "/law/today"]];
  const only = process.env.A11Y_ONLY ? process.env.A11Y_ONLY.split(",") : null;
  if (only) routes.splice(0, routes.length, ...routes.filter(([n]) => only.includes(n)));
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.CHROME_PROFILE || undefined });
  const report = { runs: 0, violations: [], overflow: [], dirMismatch: [] };
  for (const cfg of MATRIX) {
    await fetch(`${BASE}/api/law/me/preferences`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ theme: cfg.theme, locale: cfg.lang }) });
    for (const [name, url] of routes) {
      const page = await browser.newPage();
      await page.setViewport({ width: cfg.width, height: cfg.width < 700 ? 800 : 900, isMobile: cfg.width < 700, hasTouch: cfg.width < 700 });
      await session.attach(page);
      await page.evaluateOnNewDocument((l, t) => { try { localStorage.setItem("qanouni_lang", l); localStorage.setItem("qanouni_theme", t); } catch {} }, cfg.lang, cfg.theme);
      try {
        await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 30000 });
        await sleep(500);
        const dir = await page.evaluate(() => document.documentElement.dir);
        if (dir !== cfg.dir) report.dirMismatch.push(`${name} ${cfg.lang}: ${dir}`);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) report.overflow.push(`${name} ${cfg.lang}/${cfg.theme}/${cfg.width}`);
        await page.evaluate(axeSource);
        const res = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag22aa"] } }));
        for (const v of res.violations)
          report.violations.push({ route: name, cfg: `${cfg.lang}/${cfg.theme}/${cfg.width}`, id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ").slice(0, 90), msg: v.nodes[0]?.any?.[0]?.message?.slice(0, 110) });
        report.runs++;
      } catch (e) { report.violations.push({ route: name, cfg: JSON.stringify(cfg), id: "navigation", impact: "critical", msg: e.message.slice(0, 100) }); }
      await page.close();
    }
  }
  await browser.close();
  const bad = report.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  const byRule = {};
  for (const v of report.violations) { const k = `${v.id} (${v.impact})`; byRule[k] = (byRule[k] || 0) + 1; }
  report.summary = { runs: report.runs, violationsByRule: byRule, seriousOrCritical: bad.length, overflow: report.overflow.length, dirMismatch: report.dirMismatch.length };
  if (OUTFILE) fs.writeFileSync(OUTFILE, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.summary, null, 1));
  if (bad.length || report.overflow.length || report.dirMismatch.length) { console.log(JSON.stringify(bad.slice(0, 12), null, 1), report.overflow.slice(0, 8), report.dirMismatch.slice(0, 8)); process.exit(1); }
})();
