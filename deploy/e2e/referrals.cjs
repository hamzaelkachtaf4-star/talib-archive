// Qanouni Collab Phase C in a real browser: the invite card on Profile, the invite link on the sign-up screen,
// and the synthesis panel (sources private to their author, button enabled at two sources). The AI call itself
// is covered by server/__tests__/law/qanouniReferrals.integration.test.js with a fake provider.
//   QANOUNI_DEV_CODES=true server; CHROME_BIN=... node deploy/e2e/referrals.cjs collector/node_modules/puppeteer http://localhost:3001
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs");
const SHOTS = process.env.SHOT_DIR || ".";
const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };

async function api(method, p, token, body) {
  const res = await fetch(`${BASE}/api/law${p}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function signUp(name, email, referralCode) {
  const plain = (p, body) => fetch(`${BASE}/api/law/auth/${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const r = await plain("register", { fullName: name, email, password: "Student-pass-123", ...(referralCode ? { referralCode } : {}) });
  const s = await plain("register/verify", { email, code: r.devCode });
  await api("POST", "/auth/consent", s.token, CONSENT);
  return s;
}
async function pageAs(browser, s) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (s)
    await page.evaluateOnNewDocument((x) => {
      localStorage.setItem("anythingllm_authToken", x.token);
      localStorage.setItem("anythingllm_user", JSON.stringify({ id: x.user.id, username: x.user.username, role: x.user.role }));
      localStorage.setItem("lawos_user", JSON.stringify(x.user));
    }, s);
  return page;
}

(async () => {
  await session.init(BASE);
  const results = {};
  const tag = Date.now();
  const a = await signUp("سفيرة الاختبار", `ref-a-${tag}@example.com`);
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined });
  try {
    const pa = await pageAs(browser, a);
    await pa.goto(`${BASE}/law/profile`, { waitUntil: "networkidle0" });
    // A fresh browser installs the service worker, which reloads the page once: wait for that before typing.
    await pa.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
    await pa.goto(`${BASE}/law/profile`, { waitUntil: "networkidle0" });
    await pa.waitForFunction(() => /INV-[A-HJ-NP-Z2-9]{6}/.test(document.body.innerText), { timeout: 15000 });
    const code = await pa.evaluate(() => document.body.innerText.match(/INV-[A-HJ-NP-Z2-9]{6}/)[0]);
    results.inviteCard = true;
    await pa.screenshot({ path: path.join(SHOTS, "r-profile.png"), fullPage: true });

    const guest = await pageAs(browser, null);
    await guest.goto(`${BASE}/law/register?ref=${code}`, { waitUntil: "networkidle0" });
    results.welcomeNotice = await guest.evaluate(() => document.body.innerText.includes("دعاك زميل إلى طالب"));
    const b = await signUp("مدعو الاختبار", `ref-b-${tag}@example.com`, code);
    const mine = (await api("GET", "/referrals", a.token)).body;
    results.referralPending = mine.referrals.some((r) => r.name === "مدعو الاختبار" && r.status === "pending");

    // Synthesis panel: one source each, private to its author.
    const sq = (await api("POST", "/squads/create", a.token, { name: "فرقة" })).body.squad;
    await api("POST", "/squads/join", b.token, { code: sq.inviteCode });
    const ws = (await api("POST", "/squads/workspaces", a.token, { moduleName: "المسؤولية المدنية", professorName: "د. تجريبي" })).body.workspace;
    await api("POST", `/squads/workspaces/${ws.id}/sessions/1/sources`, b.token, { kind: "board_ocr", label: "سبورة", content: "نص سري لعضو آخر" });
    // The guest tab opened after this one: bring it back, background tabs get no animation frames for waits.
    await pa.bringToFront();
    await pa.goto(`${BASE}/law/squad/w/${ws.id}`, { waitUntil: "networkidle0" });
    await pa.waitForFunction(() => document.body.innerText.includes("التجميع الذكي لمصادر المحاضرة"), { timeout: 15000 });
    const btn = () => pa.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => x.innerText.includes("صياغة مسودة")));
    results.disabledWithOneSource = await (await btn()).evaluate((x) => x.disabled);
    results.othersContentHidden = await pa.evaluate(() => document.body.innerText.includes("سبورة") && !document.body.innerText.includes("نص سري لعضو آخر"));
    await pa.type("textarea[placeholder]", "ملاحظاتي عن الخطأ");
    await pa.type('input[placeholder="وصف قصير"]', "ملاحظاتي");
    await pa.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.includes("إضافة مصدري")).click());
    await pa.waitForFunction(() => document.body.innerText.includes("ملاحظاتي ·") || document.querySelectorAll("li").length >= 2, { timeout: 10000 });
    await pa.waitForFunction(() => ![...document.querySelectorAll("button")].find((x) => x.innerText.includes("صياغة مسودة")).disabled, { timeout: 10000 });
    results.enabledWithTwoSources = true;
    await pa.screenshot({ path: path.join(SHOTS, "r-synthesis.png"), fullPage: true });

    for (const s of [a, b]) await api("POST", "/squads/leave", s.token);
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
