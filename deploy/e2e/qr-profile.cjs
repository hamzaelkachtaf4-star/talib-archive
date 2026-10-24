// Qanouni QR quick login, Profile and Schedule in a real browser:
//  - a signed-out "desktop" page opens the QR panel; a signed-in "phone" page opens the QR's link
//    (what the in-app scanner does after decoding it) and approves; the desktop lands on Today, signed in;
//  - the QR link is single use;
//  - Profile shows the level badge and friend code; Schedule adds a slot by hand.
//   CHROME_BIN=... node deploy/e2e/qr-profile.cjs collector/node_modules/puppeteer http://localhost:3001
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs");
const SHOTS = process.env.SHOT_DIR || ".";
const clickText = (page, text, sel = "button") =>
  page.evaluate((t, s) => [...document.querySelectorAll(s)].find((b) => b.innerText.includes(t)).click(), text, sel);

(async () => {
  await session.init(BASE);
  const results = {};
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined });
  try {
    const desktopCtx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const desktop = await desktopCtx.newPage();
    await desktop.setViewport({ width: 1280, height: 860 });
    let link = null;
    desktop.on("response", async (r) => {
      if (r.url().endsWith("/api/law/auth/qr/generate")) link = (await r.json()).link;
    });
    await desktop.goto(`${BASE}/law/login`, { waitUntil: "networkidle0" });
    await clickText(desktop, "رمز QR");
    await desktop.waitForSelector('img[src^="data:image/svg+xml"]', { timeout: 10000 });
    results.qrShown = !!link && link.startsWith(`${BASE}/law/qr/`);
    await desktop.screenshot({ path: path.join(SHOTS, "q-qr-desktop.png") });

    const phone = await browser.newPage();
    await session.attach(phone);
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await phone.goto(link, { waitUntil: "networkidle0" });
    await phone.waitForFunction(() => document.body.innerText.includes("موافقة"), { timeout: 10000 });
    results.phoneShowsDevice = await phone.evaluate(() => /Chrome|Brave|macOS|Linux/.test(document.body.innerText));
    await phone.screenshot({ path: path.join(SHOTS, "q-qr-phone.png") });
    await clickText(phone, "موافقة");
    await phone.waitForFunction(() => document.body.innerText.includes("تم تسجيل الدخول على الجهاز الآخر"), { timeout: 10000 });

    await desktop.waitForFunction(() => location.pathname === "/law/today", { timeout: 15000 });
    results.desktopSignedIn = !!(await desktop.evaluate(() => localStorage.getItem("anythingllm_authToken")));
    await phone.goto(link, { waitUntil: "networkidle0" });
    await phone.waitForFunction(() => document.body.innerText.includes("منتهي الصلاحية أو مستعمل"), { timeout: 10000 });
    results.singleUse = true;

    await phone.goto(`${BASE}/law/profile`, { waitUntil: "networkidle0" });
    await phone.waitForFunction(() => /QAN-[A-Z0-9]+-\d{4}/.test(document.body.innerText), { timeout: 10000 });
    results.profile = await phone.evaluate(() => !!document.querySelector('svg[role="img"]') && document.body.innerText.includes("XP"));
    await phone.screenshot({ path: path.join(SHOTS, "q-profile.png"), fullPage: true });

    await phone.goto(`${BASE}/law/schedule`, { waitUntil: "networkidle0" });
    // Count on Saturday itself: the page opens on today's day, which changes with the date the test runs.
    await clickText(phone, "السبت");
    const before = await phone.evaluate(() => document.querySelectorAll('[aria-label="حذف"]').length);
    await clickText(phone, "إضافة حصة");
    await phone.evaluate(() => {
      const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text.includes("اختر المادة")));
      if (sel.options.length > 1) {
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        set.call(sel, sel.options[1].value);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await clickText(phone, "حفظ");
    await phone.waitForFunction((n) => document.querySelectorAll('[aria-label="حذف"]').length === n + 1, { timeout: 10000 }, before);
    results.scheduleAdd = true;
    await phone.screenshot({ path: path.join(SHOTS, "q-schedule.png"), fullPage: true });
    // Clean up the slot we added.
    phone.on("dialog", (d) => d.accept());
    const del = await phone.$$('[aria-label="حذف"]');
    await del[del.length - 1].click();
    await phone.waitForFunction((n) => document.querySelectorAll('[aria-label="حذف"]').length === n, { timeout: 10000 }, before);
    results.scheduleDelete = true;

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
