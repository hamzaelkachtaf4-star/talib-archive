// Phase 4 acceptance in a real browser: a subject in lockdown opens in Exam Mode (PROF atom with a
// jump-to-audio button, MINE hidden), Jurist is one tap away, and Exam Mode still renders offline from
// the offline pack.
//   CHROME_BIN=... node deploy/e2e/subject-lenses.cjs collector/node_modules/puppeteer http://localhost:3001
const path = require("path");
const crypto = require("crypto");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body, raw) {
  const res = await fetch(`${BASE}/api/law${p}`, {
    method,
    headers: { "Content-Type": raw ? "application/octet-stream" : "application/json" },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  return res.json();
}

(async () => {
  await session.init(BASE);
  const results = {};
  const tag = `e2e-${Date.now()}`;
  const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();
  const { subject } = await api("POST", "/subjects", { name: `مادة العدسات ${tag}`, examDate: inDays(5) });
  const audio = crypto.randomBytes(2048);
  const init = await api("POST", "/uploads/init", { clientCaptureId: `${tag}-audio`, sha256: crypto.createHash("sha256").update(audio).digest("hex"), bytes: audio.length, mime: "audio/webm" });
  await api("PUT", `/uploads/${init.uploadId}/chunks/0`, null, audio);
  const { asset } = await api("POST", `/uploads/${init.uploadId}/complete`);
  await api("POST", "/atoms", { subjectId: subject.id, provenance: "PROF", body: `فكرة الأستاذ ${tag}`, sourceAssetId: asset.id, sourceTimestampSec: 754 });
  await api("POST", "/atoms", { subjectId: subject.id, provenance: "MINE", body: `ملاحظة شخصية ${tag}` });

  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.PROFILE_DIR || undefined });
  const page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/subjects/${subject.id}`, { waitUntil: "networkidle0" });
    await page.waitForFunction((t) => document.body.innerText.includes(`فكرة الأستاذ ${t}`), { timeout: 15000 }, tag);
    results.lockdownBanner = await page.evaluate(() => document.body.innerText.includes("تُفتح في نسخة الامتحان"));
    results.examHidesMine = await page.evaluate((t) => !document.body.innerText.includes(`ملاحظة شخصية ${t}`), tag);
    results.jumpButton = await page.evaluate(() => document.body.innerText.includes("12:34"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("نسخة الباحث")).click());
    await page.waitForFunction((t) => document.body.innerText.includes(`ملاحظة شخصية ${t}`), { timeout: 15000 }, tag);
    results.juristShowsMine = true;

    await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 });
    await sleep(3000); // offline pack (with Exam atoms) stored
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((t) => document.body.innerText.includes(`فكرة الأستاذ ${t}`), { timeout: 20000 }, tag);
    results.examOffline = await page.evaluate(() => document.body.innerText.includes("بدون اتصال: نسخة الامتحان المحفوظة"));
    await page.screenshot({ path: path.join(process.env.SHOT_DIR || ".", "p4-subject.png") });
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
