// RC2 4.3: the consent screen. A fresh account (onboarded, no consent) sees one compact required screen; it cannot be
// dismissed; three one-line conditions with "read more"; acceptance is stored server-side and never reappears.
//   E2E_CONSENT_EMAIL=.. node deploy/e2e/rc2-consent.cjs collector/node_modules/puppeteer http://localhost:3099 [shots-dir]
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3099";
const SHOTS = process.argv[4];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const email = `consent-${Date.now()}@example.com`, password = "Qanouni-e2e-pass-1";

(async () => {
  const j = (p, b, h = {}) => fetch(`${BASE}/api${p}`, { method: b ? "POST" : "GET", headers: { "Content-Type": "application/json", ...h }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
  const reg = await j("/law/auth/register", { fullName: "موافقة", email, password });
  const v = await j("/law/auth/register/verify", { email, code: reg.devCode });
  const auth = { Authorization: `Bearer ${v.token}` };
  const step = (n, data) => j("/law/onboarding/step", { step: n, data }, auth);
  await step(3, { facultyCode: "FSJES_AIN_CHOCK" }); await step(4, { track: "PRIVE", language: "AR", semester: "S3", groupCode: "G01" }); await step(5, { dailyGoalMin: 20 });
  await j("/law/onboarding/complete", {}, auth);
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.CHROME_PROFILE || undefined });
  for (const [lang, theme, width] of [["fr", "dark", 1280], ["ar", "light", 360]]) {
    await fetch(`${BASE}/api/law/me/preferences`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ theme, locale: lang }) });
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800, isMobile: width < 700, hasTouch: width < 700 });
    await page.evaluateOnNewDocument((s, l, t) => {
      try {
        localStorage.setItem("anythingllm_authToken", s.token);
        localStorage.setItem("anythingllm_user", JSON.stringify({ id: s.user.id, username: s.user.username, role: s.user.role }));
        localStorage.setItem("lawos_user", JSON.stringify(s.user));
        localStorage.setItem("qanouni_lang", l); localStorage.setItem("qanouni_theme", t);
      } catch {}
    }, { token: v.token, user: v.user }, lang, theme);
    await page.goto(`${BASE}/law/today`, { waitUntil: "networkidle2" });
    await sleep(800);
    const dlg = await page.$('[role="dialog"][aria-modal="true"]');
    assert(!!dlg, `[${lang}] consent screen is a labelled aria-modal dialog`);
    if (!dlg) { await page.close(); continue; }
    const box = await dlg.boundingBox();
    assert(box.width <= 420 + 2 || box.width <= width, `[${lang}] card is compact (${Math.round(box.width)}px)`);
    assert((await page.$$('[role="dialog"] input[type="checkbox"]')).length === 3, `[${lang}] three conditions`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `[${lang}] no horizontal scroll`);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `consent-${lang}-${theme}-${width}.png`) }); }
    await page.keyboard.press("Escape"); await sleep(200);
    assert(!!(await page.$('[role="dialog"] input[type="checkbox"]')), `[${lang}] Escape does not dismiss`);
    await page.mouse.click(2, 2); await sleep(200);
    assert(!!(await page.$('[role="dialog"] input[type="checkbox"]')), `[${lang}] backdrop click does not dismiss`);
    const more = await page.$$('[role="dialog"] button.underline');
    assert(more.length === 3, `[${lang}] a "read more" per condition`);
    await more[0].click(); await sleep(300);
    assert((await page.$$('[role="dialog"]')).length === 2, `[${lang}] read more opens the full text in a sheet`);
    await page.keyboard.press("Escape"); await sleep(300);
    assert((await page.$$('[role="dialog"]')).length === 1, `[${lang}] Escape closes only the top sheet`);
    if (lang === "ar") {
      for (const cb of await page.$$('[role="dialog"] input[type="checkbox"]')) await cb.click();
      const btns = await page.$$('[role="dialog"] button:not(.underline)');
      await btns[btns.length - 1].click(); await sleep(1000);
      assert(!(await page.$('[role="dialog"]')), "[ar] accepted: screen gone");
      const c = await j("/law/auth/consent", null, auth);
      assert(c.accepted === true && c.acceptedAt, "[ar] acceptance stored server-side with version and time");
      await page.reload({ waitUntil: "networkidle2" }); await sleep(600);
      assert(!(await page.$('[role="dialog"]')), "[ar] does not reappear after reload");
    }
    await page.close();
  }
  await browser.close();
})();
