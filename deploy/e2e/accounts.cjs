// Qanouni accounts in a real browser (docs/plans/qanouni.md):
//  - a student registers on /law/register: weak passwords are blocked by the live checklist, the emailed
//    6-digit code (shown on screen by a test server started with QANOUNI_DEV_CODES=true and no SMTP) is
//    typed into the code boxes, and the student lands on Today;
//  - the student's Settings show no AI provider, model, budget or server details; sign-out is in Settings (a confirm sheet);
//  - signing out removes the token; offline data stays unless the student ticks "remove offline data" (then it is wiped);
//  - a different account signing in on the same device never sees the previous account's offline data
//    or subjects;
//  - the admin sees user management.
//   CHROME_BIN=... node deploy/e2e/accounts.cjs collector/node_modules/puppeteer http://localhost:3001
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in

async function fill(page, values) {
  for (const [label, value] of values) {
    const handle = await page.evaluateHandle((l) => {
      const lab = [...document.querySelectorAll("label")].find((x) => x.innerText.trim().startsWith(l));
      return lab && (lab.querySelector("input") || lab.parentElement.querySelector("input"));
    }, label);
    if (!handle.asElement()) throw new Error(`no field ${label}`);
    await handle.asElement().click({ clickCount: 3 });
    await handle.asElement().type(value);
  }
}

const idbCount = (page, store) =>
  page.evaluate(
    (s) =>
      new Promise((resolve) => {
        const req = indexedDB.open("lawos");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(s)) return resolve(0);
          const c = db.transaction(s).objectStore(s).count();
          c.onsuccess = () => resolve(c.result);
        };
      }),
    store
  );

const PASSWORD = "Student-pass-123";

async function register(page, name, email, results) {
  await page.goto(`${BASE}/law/register`, { waitUntil: "networkidle0" });
  await fill(page, [["الاسم الكامل", name], ["البريد الإلكتروني", email], ["كلمة المرور", "student-pass-123"], ["تأكيد كلمة المرور", "student-pass-123"]]);
  if (results) {
    // The live checklist shows the missing uppercase letter, and the form refuses to submit.
    results.checklistShowsWeak = await page.evaluate(() => document.body.innerText.includes("متوسطة") || document.body.innerText.includes("ضعيفة"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("إنشاء الحساب")).click());
    await page.waitForFunction(() => document.body.innerText.includes("لا تستوفي الشروط"), { timeout: 5000 });
    results.weakPasswordBlocked = true;
  }
  await fill(page, [["كلمة المرور", PASSWORD], ["تأكيد كلمة المرور", PASSWORD]]);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("إنشاء الحساب")).click());
  await page.waitForFunction(() => document.querySelectorAll('input[inputmode="numeric"]').length === 6, { timeout: 15000 });
  const code = await page.evaluate(() => {
    const m = document.body.innerText.match(/الرمز هو\s*(\d{6})/);
    return m && m[1];
  });
  if (!code) throw new Error("no dev code on screen: start the test server with QANOUNI_DEV_CODES=true and no SMTP");
  // Paste the whole code into the first box (paste support), which submits on the sixth digit.
  await page.focus('input[inputmode="numeric"]');
  await page.evaluate((c) => {
    const dt = new DataTransfer();
    dt.setData("text", c);
    document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, code);
  await page.waitForFunction(() => location.pathname === "/law/today", { timeout: 15000 });
}

(async () => {
  await session.init(BASE);
  const results = {};
  const tag = Date.now();
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/today`, { waitUntil: "networkidle0" });
    results.redirectedToLogin = page.url().includes("/law/login");

    await register(page, "طالبة الاختبار", `s1-${tag}@example.com`, results);
    results.registered = true;
    // A subject of S1, and something in the offline store.
    await page.evaluate(async (t) => {
      await fetch("/api/law/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("anythingllm_authToken")}` },
        body: JSON.stringify({ name: `مادة خاصة ${t}` }),
      });
    }, tag);

    await page.goto(`${BASE}/law/settings`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("المظهر"), { timeout: 15000 });
    // Only the Settings page itself: the legal notice modal names the AI providers on purpose (privacy disclosure).
    const text = await page.evaluate(() => document.querySelector("main").innerText);
    results.studentSettingsClean = !/Gemini|DeepSeek|الذكاء الاصطناعي|ميزانية|حالة الخادم|المستخدمون/i.test(text);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR || ".", "q-student-settings.png") });
    await page.goto(`${BASE}/law/profile`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("تسجيل الخروج"), { timeout: 15000 });

    await page.evaluate(async () => {
      const req = indexedDB.open("lawos");
      await new Promise((r) => (req.onsuccess = r));
      const tx = req.result.transaction("cards", "readwrite");
      tx.objectStore("cards").put({ id: "e2e-private-card", front: "x" });
      await new Promise((r) => (tx.oncomplete = r));
    });
    results.offlineDataStored = (await idbCount(page, "cards")) > 0;

    // Sign out → token and offline data gone.
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}/law/settings`, { waitUntil: "networkidle0" });
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("تسجيل الخروج")).click());
    await page.waitForSelector('[role="dialog"] input[type="checkbox"]');
    await page.click('[role="dialog"] input[type="checkbox"]'); // remove offline data
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.innerText.includes("تسجيل الخروج")).click());
    await page.waitForFunction(() => location.pathname === "/law/login", { timeout: 15000 });
    results.signOutWipes = (await idbCount(page, "cards")) === 0 && !(await page.evaluate(() => localStorage.getItem("anythingllm_authToken")));

    // Device keeps S1's offline data (e.g. token expired), then S2 signs in: wiped, and no S1 subjects.
    await register(page, "طالب ثان", `s2-pre-${tag}@example.com`); // throwaway, to have a session to seed data under
    await page.evaluate(async () => {
      localStorage.setItem("lawos_user", JSON.stringify({ id: -1 }));
      const req = indexedDB.open("lawos");
      await new Promise((r) => (req.onsuccess = r));
      const tx = req.result.transaction("cards", "readwrite");
      tx.objectStore("cards").put({ id: "previous-account-card", front: "x" });
      await new Promise((r) => (tx.oncomplete = r));
      localStorage.removeItem("anythingllm_authToken");
    });
    await register(page, "طالب ثالث", `s3-${tag}@example.com`);
    results.switchWipes = (await idbCount(page, "cards")) === 0;
    await page.goto(`${BASE}/law/subjects`, { waitUntil: "networkidle0" });
    results.noForeignSubjects = !(await page.evaluate((t) => document.body.innerText.includes(`مادة خاصة ${t}`), tag));

    // Admin view.
    await page.evaluate(() => localStorage.clear());
    await session.attach(page);
    await page.goto(`${BASE}/law/settings`, { waitUntil: "networkidle0" });
    await page.waitForFunction((t) => document.body.innerText.includes(`s1-${t}@example.com`), { timeout: 15000 }, tag);
    results.adminSeesUsers = true;
    await page.screenshot({ path: path.join(process.env.SHOT_DIR || ".", "q-admin-settings.png"), fullPage: true });

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
