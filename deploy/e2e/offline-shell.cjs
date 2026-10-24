// Phase 0 acceptance (spec §11): "the shell loads in airplane mode".
// Loads the app once online, then reloads, switches tabs and cold-opens deep links with the network off.
//
//   CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
//   node deploy/e2e/offline-shell.cjs collector/node_modules/puppeteer http://localhost:3001 [screenshot-dir]
//
// Needs a production build served by the server (SW is disabled in Vite dev) and Node >= 24.
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const OUT = process.argv[4];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page, results = {};
(async () => {
  await session.init(BASE);
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.PROFILE_DIR || undefined });
  page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  results.landedOn = new URL(page.url()).pathname;
  results.sessionRemembered = !!(await page.evaluate(() => localStorage.getItem("lawos_last_auth_ok")));

  // Wait for the SW to control the page and finish the cache hand-off.
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 30000 });
  await sleep(4000);
  results.caches = await page.evaluate(async () => {
    const out = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("صندوق الوارد"), { timeout: 15000 });
  results.offlineReload = "ok";
  results.dir = await page.evaluate(() => document.documentElement.dir + "/" + document.documentElement.lang);
  results.offlineBadge = await page.evaluate(() => document.body.innerText.includes("بدون اتصال"));
  if (OUT) await page.screenshot({ path: `${OUT}/offline-today.png` });

  // Client-side tab navigation offline.
  for (const [label, marker] of [["المراجعة", "تكرار متباعد"], ["المنهجية", "لا توجد تمارين بعد"], ["المواد", "نسخة الامتحان ونسخة الباحث"], ["التقاط", "التقاط"], ["الجدول", "يظهر الجدول عند عودة الاتصال"], ["الملف الشخصي", "يظهر تقدّمك عند عودة الاتصال"]]) {
    await page.evaluate((l) => [...document.querySelectorAll("nav a")].find((a) => a.innerText.includes(l)).click(), label);
    await page.waitForFunction((m) => document.body.innerText.includes(m), { timeout: 10000 }, marker);
    results[`tab:${label}`] = "ok";
  }

  // Hard navigation to a deep link offline (cold start of an installed PWA on another tab).
  await page.goto(`${BASE}/law/method`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("لا توجد تمارين بعد"), { timeout: 15000 });
  results.offlineDeepLink = "ok";
  if (OUT) await page.screenshot({ path: `${OUT}/offline-method.png` });

  // Settings page offline should degrade gracefully.
  await page.goto(`${BASE}/law/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("الخادم غير متاح"), { timeout: 15000 });
  results.offlineSettings = "ok";

  console.log(JSON.stringify(results, null, 2));
  console.log("PASS");
  await browser.close();
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  console.error(JSON.stringify(results, null, 2));
  try { console.error("url:", page.url()); console.error("text:", (await page.evaluate(() => document.body.innerText)).slice(0, 400)); } catch (x) { console.error("no page", x.message); }
  process.exit(1);
});
