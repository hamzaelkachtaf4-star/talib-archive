// Phase 12 final audit (spec §12.1), against a production build served by the server (service worker active).
//   E2E_PASSWORD=... CHROME_BIN=... node deploy/e2e/final-audit.cjs collector/node_modules/puppeteer http://localhost:3001 <out-dir>
// Covers: responsive screenshots + horizontal-overflow check (360/390/768/1280 x ar/fr x light/dark), legacy route redirects,
// IndexedDB upgrade from v2 keeping data, and the offline shell/Today/Review/Library/Timetable. Prints a JSON report.
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const OUT = process.argv[4] || "docs/screens/final";
const session = require("./_auth.cjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIDTHS = [360, 390, 768, 1280];
const LANGS = ["ar", "fr"];
const THEMES = ["light", "dark"];
const PAGES = [
  ["portal", "/portal", false],
  ["today", "/law/today", true],
  ["path", "/law/path", true],
  ["review", "/law/exam/cards", true],
  ["library", "/law/library", true],
  ["chat", "/law/library/chat", true],
  ["community", "/law/community", true],
  ["hub", "/law/community/hub", true],
  ["friends", "/law/community/friends", true],
  ["profile", "/law/profile", true],
  ["settings", "/law/settings", true],
  ["timetable", "/law/timetable", true],
];

const report = { overflow: [], consoleErrors: [], redirects: {}, idb: {}, offline: {}, shots: 0 };

async function newPage(browser, { width, lang, theme, auth }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: width < 700 ? 800 : 900, deviceScaleFactor: 1, isMobile: width < 700, hasTouch: width < 700 });
  if (auth) await session.attach(page);
  await page.evaluateOnNewDocument((l, t) => { try { localStorage.setItem("qanouni_lang", l); localStorage.setItem("qanouni_theme", t); } catch {} }, lang, theme);
  page.on("pageerror", (e) => report.consoleErrors.push(String(e.message).slice(0, 160)));
  return page;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await session.init(BASE);
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined });

  // ---- 1. screenshots + overflow ----
  for (const lang of LANGS) for (const theme of THEMES) for (const width of WIDTHS) {
    for (const [name, url, auth] of PAGES) {
      const page = await newPage(browser, { width, lang, theme, auth });
      try {
        await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 30000 });
        await sleep(600);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, dir: document.documentElement.dir, lang: document.documentElement.lang,
          wide: [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== "fixed" && !e.closest("[data-allow-scroll]"); }).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`) }));
        if (m.sw > m.iw + 1) report.overflow.push({ page: name, width, lang, theme, scrollWidth: m.sw, wide: m.wide });
        if ((lang === "ar") !== (m.dir === "rtl") && name !== "portal") report.overflow.push({ page: name, width, lang, theme, dirMismatch: m.dir });
        if (width === 390 || width === 1280) { await page.screenshot({ path: path.join(OUT, `${name}-${width}-${lang}-${theme}.jpg`), type: "jpeg", quality: 55 }); report.shots++; }
      } catch (e) {
        report.overflow.push({ page: name, width, lang, theme, error: String(e.message).slice(0, 120) });
      }
      await page.close();
    }
  }

  // ---- 2. legacy redirects ----
  const old = { "/law/review": "/law/exam", "/law/subjects": "/law/path", "/law/method": "/law/path", "/law/schedule": "/law/timetable", "/law/squad": "/law/community/squads", "/law/hub": "/law/community/hub", "/law/corpus": "/law/library/corpus" };
  const rp = await newPage(browser, { width: 390, lang: "ar", theme: "light", auth: true });
  for (const [from, to] of Object.entries(old)) {
    await rp.goto(BASE + from, { waitUntil: "networkidle2" });
    const p = new URL(rp.url()).pathname;
    report.redirects[from] = p === to ? "ok" : `FAIL -> ${p}`;
  }
  await rp.close();

  // ---- 3. IndexedDB upgrade v2 -> current keeps data ----
  const ip = await newPage(browser, { width: 390, lang: "ar", theme: "light", auth: true });
  await ip.goto(BASE + "/law/today", { waitUntil: "networkidle2" });
  await ip.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase("lawos"); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await ip.evaluate(() => new Promise((res, rej) => {
    const req = indexedDB.open("lawos", 2); // the previous schema: no ttQueue / legalTexts stores
    req.onupgradeneeded = () => { const db = req.result; for (const [n, k] of [["cards", "id"], ["reviewQueue", "clientReviewId"], ["meta", "key"], ["captures", "clientCaptureId"], ["batches", "clientBatchId"]]) db.createObjectStore(n, { keyPath: k }); };
    req.onsuccess = () => { const db = req.result; const tx = db.transaction(["meta", "captures"], "readwrite"); tx.objectStore("meta").put({ key: "e2e-sentinel", value: "kept" }); tx.objectStore("captures").put({ clientCaptureId: "e2e-capture", note: "x" }); tx.oncomplete = () => { db.close(); res(); }; };
    req.onerror = () => rej(req.error);
  }));
  await ip.reload({ waitUntil: "networkidle2" });
  await sleep(1500);
  report.idb = await ip.evaluate(() => new Promise((res) => {
    const req = indexedDB.open("lawos");
    req.onsuccess = () => { const db = req.result; const stores = [...db.objectStoreNames]; const tx = db.transaction(["meta"], "readonly"); const g = tx.objectStore("meta").get("e2e-sentinel"); g.onsuccess = () => { res({ version: db.version, stores, sentinel: g.result?.value || null }); db.close(); }; };
  }));
  await ip.close();

  // ---- 4. offline regression ----
  const op = await newPage(browser, { width: 390, lang: "ar", theme: "light", auth: true });
  await op.goto(BASE + "/law/today", { waitUntil: "networkidle2" });
  await op.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 30000 }).catch(() => {});
  await sleep(5000);
  for (const p of ["/law/today", "/law/exam/cards", "/law/library", "/law/timetable", "/law/path"]) await op.goto(BASE + p, { waitUntil: "networkidle2" });
  await op.setOfflineMode(true);
  for (const p of ["/law/today", "/law/exam/cards", "/law/library", "/law/timetable", "/law/path"]) {
    try {
      await op.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(1500);
      const t = await op.evaluate(() => document.body.innerText.length);
      report.offline[p] = t > 40 ? "renders" : "EMPTY";
    } catch (e) { report.offline[p] = `FAIL ${String(e.message).slice(0, 60)}`; }
  }
  await op.setOfflineMode(false);
  await op.close();

  await browser.close();
  report.consoleErrors = [...new Set(report.consoleErrors)].slice(0, 10);
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
