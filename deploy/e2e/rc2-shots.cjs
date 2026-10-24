// RC2 before/after screenshots + CSP/console check against a production build served by the server.
//   E2E_EMAIL=.. E2E_PASSWORD=.. CHROME_BIN=".../Brave Browser" node deploy/e2e/rc2-shots.cjs collector/node_modules/puppeteer http://localhost:3099 docs/audit/screens/before
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3099";
const OUT = process.argv[4] || "docs/audit/screens/after";
const session = require("./_auth.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONFIGS = [["ar", "light", 390], ["ar", "dark", 390], ["ar", "light", 1280], ["ar", "dark", 1280], ["fr", "light", 390], ["fr", "dark", 1280]];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const s = await session.init(BASE);
  const auth = { Authorization: `Bearer ${s.token}` };
  const mods = await (await fetch(`${BASE}/api/law/path/semesters/S3/modules`, { headers: auth })).json().catch(() => ({}));
  const modId = mods.modules?.[0]?.id;
  const pages = [
    ["roadmap", "/law/path"],
    ...(modId ? [["module", `/law/path/m/${modId}`]] : []),
    ["review", "/law/exam/cards"],
    ["profile", "/law/profile"],
    ["hub", "/law/community/hub"],
    ["chat", "/law/library/chat"],
    ["today", "/law/today"],
    ["consent-reset", "/law/settings"],
  ];
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.CHROME_PROFILE || undefined });
  const report = { csp: [], errors: [], shots: 0 };
  for (const [lang, theme, width] of CONFIGS) {
    for (const [name, url] of pages) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 700, hasTouch: width < 700 });
      await session.attach(page);
      await fetch(`${BASE}/api/law/me/preferences`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ theme, locale: lang }) });
      await page.evaluateOnNewDocument((l, t) => {
        try { localStorage.setItem("qanouni_lang", l); localStorage.setItem("qanouni_theme", t); } catch {}
        document.addEventListener("securitypolicyviolation", (e) => console.error("CSPVIOLATION " + e.violatedDirective + " " + e.blockedURI));
      }, lang, theme);
      page.on("pageerror", (e) => report.errors.push(`${name}: ${String(e.message).slice(0, 140)}`));
      page.on("console", (m) => { const t = m.text(); if (t.startsWith("CSPVIOLATION") || /Content Security Policy/i.test(t)) report.csp.push(`${name}: ${t.slice(0, 160)}`); });
      try {
        await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 30000 });
        await sleep(600);
        await page.screenshot({ path: path.join(OUT, `${name}-${lang}-${theme}-${width}.png`) });
        report.shots++;
      } catch (e) { report.errors.push(`${name}: ${e.message.slice(0, 100)}`); }
      await page.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
})();
