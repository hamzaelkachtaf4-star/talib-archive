// Qanouni Collab in a real browser:
//  - a new student meets the legal notice: Escape does not close it, the button stays disabled until all three
//    boxes are ticked, acceptance survives a reload;
//  - the student creates a squad, a second student joins with the code (API), the first adds a module workspace
//    and writes a master note with a corpus pin; the second edits one section (API); the note shows two
//    contributors and per-section author badges.
//   QANOUNI_DEV_CODES=true server; CHROME_BIN=... node deploy/e2e/collab.cjs collector/node_modules/puppeteer http://localhost:3001
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs");
const SHOTS = process.env.SHOT_DIR || ".";
const PASSWORD = "Student-pass-123";

async function api(method, p, token, body) {
  const res = await fetch(`${BASE}/api/law${p}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Sign-up through the API (code shown because the test server has QANOUNI_DEV_CODES=true). */
async function signUp(name, email) {
  const plain = (p, body) => fetch(`${BASE}/api/law/auth/${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const r = await plain("register", { fullName: name, email, password: PASSWORD });
  if (!r.devCode) throw new Error(`no dev code: ${JSON.stringify(r)}`);
  return plain("register/verify", { email, code: r.devCode });
}

(async () => {
  await session.init(BASE);
  const results = {};
  const tag = Date.now();
  const a = await signUp("طالبة الفرقة", `collab-a-${tag}@example.com`);
  const b = await signUp("Badr Collab", `collab-b-${tag}@example.com`);
  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((s) => {
      localStorage.setItem("anythingllm_authToken", s.token);
      localStorage.setItem("anythingllm_user", JSON.stringify({ id: s.user.id, username: s.user.username, role: s.user.role }));
      localStorage.setItem("lawos_user", JSON.stringify(s.user));
    }, a);
    await page.goto(`${BASE}/law/today`, { waitUntil: "networkidle0" });
    await page.waitForSelector('[aria-labelledby="law-consent-title"]', { timeout: 15000 });
    await page.keyboard.press("Escape");
    results.modalUndismissible = !!(await page.$('[aria-labelledby="law-consent-title"]'));
    const btn = () => page.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => x.innerText.includes("أوافق وأتابع")));
    results.buttonDisabledUntilChecked = await (await btn()).evaluate((x) => x.disabled);
    await page.screenshot({ path: path.join(SHOTS, "c-consent.png") });
    const boxes = await page.$$('[aria-labelledby="law-consent-title"] input[type="checkbox"]');
    for (const x of boxes) await x.click();
    await (await btn()).click();
    await page.waitForFunction(() => !document.querySelector('[aria-labelledby="law-consent-title"]'), { timeout: 10000 });
    await page.reload({ waitUntil: "networkidle0" });
    results.acceptedSurvivesReload = !(await page.$('[aria-labelledby="law-consent-title"]'));

    // Create the squad in the UI.
    await page.goto(`${BASE}/law/squad`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const input = [...document.querySelectorAll("label")].find((l) => l.innerText.startsWith("اسم الفرقة")).parentElement.querySelector("input");
      input.focus();
    });
    await page.keyboard.type("فرقة الاختبار");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.includes("إنشاء الفرقة")).click());
    await page.waitForFunction(() => /\b[A-HJ-NP-Z2-9]{6}\b/.test(document.body.innerText), { timeout: 10000 });
    const code = await page.evaluate(() => document.body.innerText.match(/\b([A-HJ-NP-Z2-9]{6})\b/)[1]);
    await api("POST", "/auth/consent", b.token, { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" });
    results.secondJoined = (await api("POST", "/squads/join", b.token, { code })).status === 200;

    // Workspace + master note (API for speed), then B edits one section.
    const ws = (await api("POST", "/squads/workspaces", a.token, { moduleName: "المسؤولية المدنية", professorName: "د. أستاذ تجريبي" })).body.workspace;
    const content = "# المبحث الأول: الخطأ\nيقوم الخطأ على الإخلال بالتزام [^pin-1].\n## المطلب الأول: العنصر المادي\nفعل أو امتناع.\n# المبحث الثاني: الضرر\nضرر محقق.";
    const n = (await api("POST", `/squads/workspaces/${ws.id}/notes`, a.token, {
      sessionNumber: 1,
      title: "المحاضرة الأولى",
      content,
      sourcePins: [{ id: "pin-1", type: "ref", ref: "DOC:77" }, { id: "pin-2", type: "document", ref: "Polycopié p. 4", label: "المطبوع" }],
    })).body.note;
    await api("PATCH", `/squads/notes/${n.id}`, b.token, { version: n.version, content: content.replace("ضرر محقق.", "ضرر محقق ومباشر.") });

    await page.goto(`${BASE}/law/squad/notes/${n.id}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("المبحث الثاني"), { timeout: 10000 });
    results.twoContributors = await page.evaluate(() => /Badr Collab/.test(document.body.innerText) && /%/.test(document.body.innerText));
    results.sectionBadges = (await page.$$("section .rounded-full[title]")).length >= 3;
    results.pinRendered = !!(await page.$('button.law-pin[data-pin="pin-1"]'));
    await page.click('button.law-pin[data-pin="pin-1"]');
    await page.screenshot({ path: path.join(SHOTS, "c-master-note.png"), fullPage: true });
    await page.goto(`${BASE}/law/squad`, { waitUntil: "networkidle0" });
    results.squadShowsTwo = await page.evaluate(() => document.body.innerText.includes("2/6"));
    await page.screenshot({ path: path.join(SHOTS, "c-squad.png"), fullPage: true });

    // Clean up: both leave (the squad is deleted with its notes).
    await api("POST", "/squads/leave", b.token);
    await api("POST", "/squads/leave", a.token);

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
