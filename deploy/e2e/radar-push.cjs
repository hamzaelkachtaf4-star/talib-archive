// Phase 6 in a real browser:
//  - a scraped source (inserted directly in the DB, so no real site is contacted) shows in the Inbox as a
//    new item and can be dismissed; nothing enters the corpus;
//  - the Radar tab shows the §3.7 seed (Moudawana reform as a watch item without content);
//  - a recap push delivered to the real service worker (CDP) is displayed as a notification.
//   CHROME_BIN=... node deploy/e2e/radar-push.cjs collector/node_modules/puppeteer http://localhost:3001 server/storage/anythingllm.db
const path = require("path");
const crypto = require("crypto");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const DB_FILE = path.resolve(process.argv[4] || "server/storage/anythingllm.db");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function insertSource(title) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(DB_FILE);
  const id = `e2e${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO "LawSourceDocument" (id, origin, url, title, "parseStatus", "parseNotes", "retrievedAt", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, "adala", `https://example.invalid/${id}.pdf`, title, "new", "e2e", now, now, now
  );
  db.close();
  return id;
}

(async () => {
  await session.init(BASE);
  const results = {};
  const title = `وثيقة رصد تجريبية ${Date.now()}`;
  insertSource(title);
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.PROFILE_DIR || undefined });
  await browser.defaultBrowserContext().overridePermissions(BASE, ["notifications"]);
  const page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/capture?tab=inbox`, { waitUntil: "networkidle0" });
    await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, title);
    results.newSourceInInbox = true;
    await page.evaluate((t) => {
      const card = [...document.querySelectorAll(".law-card")].find((c) => c.innerText.includes(t));
      [...card.querySelectorAll("button")].find((b) => b.innerText.includes("تجاهل")).click();
    }, title);
    await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout: 15000 }, title);
    results.dismissed = true;

    await page.goto(`${BASE}/law/corpus?tab=radar`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("مراجعة مدونة الأسرة"), { timeout: 15000 });
    results.moudawanaWatch = await page.evaluate(() => document.body.innerText.includes("لا يوجد نص مشروع بعد"));
    await page.screenshot({ path: path.join(process.env.SHOT_DIR || ".", "p6-radar.png") });

    // Push → the LAW-OS service worker shows the notification.
    await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 });
    const cdp = await page.target().createCDPSession();
    await cdp.send("ServiceWorker.enable");
    const reg = await new Promise((resolve) => {
      cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
        const r = registrations.find((x) => x.scopeURL === `${BASE}/` && !x.isDeleted);
        if (r) resolve(r);
      });
    });
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: BASE,
      registrationId: reg.registrationId,
      data: JSON.stringify({ title: "ملخص الأسبوع", body: "اختبار", url: "/law/recap", tag: "recap" }),
    });
    let shown = [];
    for (let i = 0; i < 20 && !shown.length; i++) {
      await sleep(500);
      shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: "recap" })).map((n) => n.title));
    }
    results.pushShown = shown.includes("ملخص الأسبوع");
    if (!Object.values(results).every(Boolean)) throw new Error("assertion failed");
    console.log(JSON.stringify(results, null, 2));
    console.log("PASS");
  } catch (e) {
    console.error("FAIL:", e.message, JSON.stringify(results));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
