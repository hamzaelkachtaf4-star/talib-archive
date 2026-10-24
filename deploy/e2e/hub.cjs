// Qanouni Collab Phase B in a real browser: A publishes a squad note (creator-only control, confirmation),
// B (another squad) finds it in the Faculty Hub, endorses it and forks it (attribution shown), and A's opt-in
// public profile lists the note.
//   QANOUNI_DEV_CODES=true server; CHROME_BIN=... node deploy/e2e/hub.cjs collector/node_modules/puppeteer http://localhost:3001
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs");
const SHOTS = process.env.SHOT_DIR || ".";
const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };

async function api(method, p, token, body) {
  const res = await fetch(`${BASE}/api/law${p}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function signUp(name, email) {
  const plain = (p, body) => fetch(`${BASE}/api/law/auth/${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const r = await plain("register", { fullName: name, email, password: "Student-pass-123" });
  const s = await plain("register/verify", { email, code: r.devCode });
  await api("POST", "/auth/consent", s.token, CONSENT);
  return s;
}
async function pageAs(browser, s) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((x) => {
    localStorage.setItem("anythingllm_authToken", x.token);
    localStorage.setItem("anythingllm_user", JSON.stringify({ id: x.user.id, username: x.user.username, role: x.user.role }));
    localStorage.setItem("lawos_user", JSON.stringify(x.user));
  }, s);
  page.on("dialog", (d) => d.accept());
  return page;
}
// Waits for the target first: the first visit can reload once when the new service worker takes over.
async function clickText(page, text, sel = "button, a") {
  await page.waitForFunction((t, s) => [...document.querySelectorAll(s)].some((b) => b.innerText.includes(t)), { timeout: 15000 }, text, sel);
  await page.evaluate((t, s) => [...document.querySelectorAll(s)].find((b) => b.innerText.includes(t)).click(), text, sel);
}

(async () => {
  await session.init(BASE);
  const results = {};
  const tag = Date.now();
  const a = await signUp(`ناشرة ${tag % 1000}`, `hub-a-${tag}@example.com`);
  const b = await signUp(`قارئ ${tag % 1000}`, `hub-b-${tag}@example.com`);
  await api("POST", "/squads/create", a.token, { name: "فرقة أ" });
  await api("POST", "/squads/create", b.token, { name: "فرقة ب" });
  const ws = (await api("POST", "/squads/workspaces", a.token, { moduleName: `المسؤولية المدنية ${tag % 1000}`, professorName: "د. تجريبي" })).body.workspace;
  const n = (await api("POST", `/squads/workspaces/${ws.id}/notes`, a.token, {
    sessionNumber: 1,
    title: `الخطأ التقصيري ${tag}`,
    content: "# المبحث الأول: مفهوم الخطأ\nإخلال بالتزام سابق.\n# المبحث الثاني: صور الخطأ\nالعمد والإهمال.",
  })).body.note;
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined });
  try {
    // A publishes through the creator-only control.
    const pa = await pageAs(browser, a);
    await pa.goto(`${BASE}/law/squad/notes/${n.id}`, { waitUntil: "networkidle0" });
    await pa.waitForFunction(() => document.body.innerText.includes("من يرى هذه المحاضرة"), { timeout: 15000 });
    await pa.select("select.law-input", "public");
    await pa.waitForFunction(() => document.body.innerText.includes("عرضها كما تظهر في منصة الكلية"), { timeout: 10000 });
    results.published = true;
    // A turns the public profile on.
    await pa.goto(`${BASE}/law/profile`, { waitUntil: "networkidle0" });
    await pa.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.innerText.includes("ملف عام في منصة الكلية")).querySelector("input").click());
    await new Promise((r) => setTimeout(r, 800));

    // B finds it in the Hub, endorses it, forks it.
    const pb = await pageAs(browser, b);
    await pb.goto(`${BASE}/law/hub`, { waitUntil: "networkidle0" });
    await pb.focus('input[dir="auto"]');
    await pb.keyboard.type(String(tag));
    await pb.waitForFunction((t) => document.querySelectorAll(`a[href^="/law/hub/notes/"]`).length === 1 && document.body.innerText.includes(t), { timeout: 10000 }, String(tag));
    results.foundInHub = true;
    await pb.screenshot({ path: path.join(SHOTS, "h-hub.png"), fullPage: true });
    await pb.click(`a[href="/law/hub/notes/${n.id}"]`);
    await pb.waitForFunction(() => document.body.innerText.includes("نسخ إلى فرقتي"), { timeout: 10000 });
    await clickText(pb, "توثيق");
    await pb.waitForFunction(() => document.body.innerText.includes("وثّقتها"), { timeout: 10000 });
    results.endorsed = true;
    await pb.screenshot({ path: path.join(SHOTS, "h-hub-note.png"), fullPage: true });
    await clickText(pb, "نسخ إلى فرقتي");
    await pb.waitForFunction(() => location.pathname.startsWith("/law/squad/notes/") && document.body.innerText.includes("مقتبسة ومطورة عن تلخيص الطالب"), { timeout: 15000 });
    results.forkAttribution = await pb.evaluate((name) => document.body.innerText.includes(name), a.user.fullName);
    await pb.screenshot({ path: path.join(SHOTS, "h-fork.png"), fullPage: true });

    // A's public profile, seen by B.
    await pb.goto(`${BASE}/law/u/${a.user.id}`, { waitUntil: "networkidle0" });
    results.publicProfile = await pb.evaluate((t) => document.body.innerText.includes(t), `الخطأ التقصيري ${tag}`);
    await pb.screenshot({ path: path.join(SHOTS, "h-profile.png"), fullPage: true });

    // Clean up.
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
