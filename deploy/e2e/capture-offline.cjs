// Phase 2 acceptance (spec §11):
//  1. 14 photos captured in airplane mode upload automatically later, with matching hashes;
//  2. killing the app mid-upload loses nothing (page closed during a throttled 12 MB upload).
// Server-side hashes are read straight from the SQLite DB given as argv[4].
//
//   CHROME_BIN=... node deploy/e2e/capture-offline.cjs collector/node_modules/puppeteer http://localhost:3001 server/storage/anythingllm.db
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const DB_FILE = path.resolve(process.argv[4] || "server/storage/anythingllm.db");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serverHashes() {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  const rows = db.prepare('SELECT sha256 FROM "LawAsset"').all();
  db.close();
  return new Set(rows.map((r) => r.sha256));
}

const idb = (page, fn, arg) =>
  page.evaluate(
    (fnSrc, a) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("lawos");
        req.onsuccess = () => {
          const db = req.result;
          // eslint-disable-next-line no-new-func
          Promise.resolve(new Function("db", "arg", fnSrc)(db, a)).then(
            (v) => {
              db.close();
              resolve(v);
            },
            reject
          );
        };
        req.onerror = () => reject(req.error);
      }),
    fn,
    arg
  );

const COUNT = `return Promise.all(["captures","batches"].map((s) => new Promise((res) => {
  if (!db.objectStoreNames.contains(s)) return res(0);
  const r = db.transaction(s).objectStore(s).count(); r.onsuccess = () => res(r.result); })))`;
const HASHES = `return new Promise((res) => { const r = db.transaction("captures").objectStore("captures").getAll();
  r.onsuccess = () => res(r.result.map((c) => c.sha256)); })`;

async function waitDrained(page, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const [c, b] = await idb(page, COUNT);
    if (c === 0 && b === 0) return true;
    await sleep(1000);
  }
  return false;
}

(async () => {
  await session.init(BASE);
  const results = {};
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.CHROME_BIN || undefined,
    userDataDir: process.env.PROFILE_DIR || undefined,
  });
  let page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/capture`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 });
    await sleep(2500);

    // 1. Airplane mode: 14 distinct pages through the gallery input (same resize path as the camera).
    await page.setOfflineMode(true);
    await page.evaluate(async () => {
      const dt = new DataTransfer();
      for (let i = 0; i < 14; i++) {
        const c = document.createElement("canvas");
        c.width = 1200;
        c.height = 1600;
        const g = c.getContext("2d");
        g.fillStyle = `hsl(${i * 25}, 60%, 85%)`;
        g.fillRect(0, 0, 1200, 1600);
        g.fillStyle = "#000";
        g.font = "120px sans-serif";
        g.fillText(`page ${i} ${Math.random()}`, 80, 400);
        const blob = await new Promise((r) => c.toBlob(r, "image/png"));
        dt.items.add(new File([blob], `p${i}.png`, { type: "image/png" }));
      }
      const input = document.querySelector('input[type=file][accept="image/*"]');
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /حفظ\s*14\s*صفحة/.test(b.innerText)), { timeout: 30000 });
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /حفظ\s*14\s*صفحة/.test(b.innerText)).click());
    await page.waitForFunction(() => document.body.innerText.includes("بانتظار الرفع"), { timeout: 15000 });
    const queued = await idb(page, HASHES);
    results.queuedOffline = queued.length;
    if (queued.length !== 14) throw new Error(`expected 14 queued captures, got ${queued.length}`);
    await sleep(2000);
    results.stillQueuedOffline = (await idb(page, COUNT))[0];

    await page.setOfflineMode(false); // fires "online" → the engine runs in the service worker
    if (!(await waitDrained(page, 60000))) throw new Error("queue did not drain after reconnecting");
    const onServer = serverHashes();
    results.photoHashesMatched = queued.filter((h) => onServer.has(h)).length;
    if (results.photoHashesMatched !== 14) throw new Error("hash mismatch after upload");

    // 2. Kill mid-upload: 12 MB import over a slow link, page closed after the first chunk.
    await page.setOfflineMode(true);
    await page.evaluate(async () => {
      const bytes = new Uint8Array(12 * 1024 * 1024);
      for (let i = 0; i < bytes.length; i += 65536) crypto.getRandomValues(bytes.subarray(i, i + 65536));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "lecture.webm", { type: "audio/webm" }));
      const tab = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "استيراد");
      tab.click();
      await new Promise((r) => setTimeout(r, 300));
      const input = document.querySelector('input[type=file][accept*="audio"]');
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => document.body.innerText.includes("بانتظار الرفع"), { timeout: 30000 });
    const [bigHash] = await idb(page, HASHES);
    const cdp = await page.target().createCDPSession();
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 50, downloadThroughput: 4e6, uploadThroughput: 1.5e6 });
    await page.setOfflineMode(false);
    await page.waitForFunction(() => /جزء\s*\d+\/\d+/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
    await page.close(); // "kill the app"
    results.closedMidUpload = true;

    page = await browser.newPage(); // reopen

    await session.attach(page);
    await page.goto(`${BASE}/law/capture`, { waitUntil: "networkidle0" });
    if (!(await waitDrained(page, 90000))) throw new Error("big upload did not finish after reopening");
    results.bigFileOnServer = serverHashes().has(bigHash);
    if (!results.bigFileOnServer) throw new Error("big file missing on server");

    console.log(JSON.stringify(results, null, 2));
    console.log("PASS");
  } catch (e) {
    console.error("FAIL:", e.message, JSON.stringify(results));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
