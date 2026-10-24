// Phase 1 acceptance (spec §11): reviews done offline sync later with no duplicates.
// Seeds a subject + cards through the API, reviews every card in airplane mode in a real browser,
// reconnects, waits for the IndexedDB queue to drain, then checks the server holds exactly one log per
// rating (by comparing summed reps) and that a forced re-sync changes nothing.
//
//   CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
//   node deploy/e2e/review-offline.cjs collector/node_modules/puppeteer http://localhost:3001 [cards=6]
// Needs a production build served by the server and Node >= 24. Assumes no app password (local test).
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const N = Number(process.argv[4] || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body) {
  const res = await fetch(`${BASE}/api/law${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const idbCount = (page, store) =>
  page.evaluate(
    (s) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("lawos");
        req.onsuccess = () => {
          const r = req.result.transaction(s).objectStore(s).count();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      }),
    store
  );

(async () => {
  await session.init(BASE);
  const results = {};
  const tag = `e2e-${Date.now()}`;
  // Lift today's new-card cap for the run so N cards are all reviewable; restored in finally.
  const original = (await api("GET", "/settings")).settings.newCardsPerDay;
  await api("PATCH", "/settings", { newCardsPerDay: 200 });
  const { subject } = await api("POST", "/subjects", { name: `مادة اختبار ${tag}` });
  for (let i = 0; i < N; i++)
    await api("POST", "/cards", { subjectId: subject.id, origin: "definition", front: `${tag} سؤال ${i}`, back: `جواب ${i}` });

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.CHROME_BIN || undefined,
    userDataDir: process.env.PROFILE_DIR || undefined,
  });
  const page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/exam/cards`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 });
    await sleep(2500); // pack download + SW cache hand-off
    // Review only the test subject (its chip appears once the offline pack is stored).
    await page.waitForFunction((name) => [...document.querySelectorAll("button")].some((b) => b.innerText.includes(name)), { timeout: 15000 }, subject.name);
    await page.evaluate((name) => [...document.querySelectorAll("button")].find((b) => b.innerText.includes(name)).click(), subject.name);
    await page.waitForFunction(() => document.body.innerText.includes("ابدأ المراجعة"), { timeout: 10000 });

    await page.setOfflineMode(true);
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("ابدأ المراجعة")).click());
    let ratings = 0;
    for (let guard = 0; guard < N * 4; guard++) {
      const finished = await page.evaluate(() => document.body.innerText.includes("أحسنت"));
      if (finished) break;
      await page.evaluate(() => document.querySelector('[aria-label="اضغط لإظهار الجواب"]')?.click());
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.startsWith("متوسط") && !b.disabled));
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.startsWith("متوسط")).click());
      ratings++;
      await sleep(120);
    }
    results.ratingsOffline = ratings;
    results.queuedOffline = await idbCount(page, "reviewQueue");
    if (results.queuedOffline !== ratings) throw new Error(`queue ${results.queuedOffline} != ratings ${ratings}`);

    const queuedLogs = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("lawos");
          req.onsuccess = () => {
            const r = req.result.transaction("reviewQueue").objectStore("reviewQueue").getAll();
            r.onsuccess = () => resolve(r.result);
          };
        })
    );
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("رجوع")).click());
    await page.setOfflineMode(false);
    await page.waitForFunction(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("lawos");
          req.onsuccess = () => {
            const r = req.result.transaction("reviewQueue").objectStore("reviewQueue").count();
            r.onsuccess = () => resolve(r.result === 0);
          };
        }),
      { timeout: 20000, polling: 500 }
    );
    results.queueAfterSync = 0;

    const after = await api("GET", `/cards?subjectId=${subject.id}`);
    results.serverReps = after.cards.reduce((s, c) => s + c.reps, 0);
    if (results.serverReps !== ratings) throw new Error(`server reps ${results.serverReps} != ratings ${ratings}`);

    // Replay the exact same logs (as if the ack had been lost): all must come back as duplicates.
    const replay = await api("POST", "/reviews/batch", { logs: queuedLogs });
    results.replayDuplicates = replay.duplicates.length;
    if (replay.accepted.length !== 0 || replay.duplicates.length !== ratings) throw new Error("replay was not idempotent");
    const again = await api("GET", `/cards?subjectId=${subject.id}`);
    results.serverRepsAfterReplay = again.cards.reduce((s, c) => s + c.reps, 0);
    if (results.serverRepsAfterReplay !== ratings) throw new Error("replay changed state");

    console.log(JSON.stringify(results, null, 2));
    console.log("PASS");
  } catch (e) {
    console.error("FAIL:", e.message, JSON.stringify(results));
    process.exitCode = 1;
  } finally {
    await api("PATCH", "/settings", { newCardsPerDay: original });
    await browser.close();
  }
})();
