// Phase 5 acceptance in a real browser, with a local fake DeepSeek (OpenAI-compatible) server:
// - no model answer before submission (the stepper is all there is);
// - a critique citing an invented article shows it as unverifiable (red panel + banner) and the
//   number is removed from the displayed text;
// - a model answer appears only when explicitly requested after the critique.
// Start the LAW-OS server with DEEPSEEK_API_KEY=x DEEPSEEK_MODEL_REASONING=fake
// DEEPSEEK_BASE_URL=http://127.0.0.1:$FAKE_PORT, then:
//   FAKE_PORT=3098 CHROME_BIN=... node deploy/e2e/case-critique.cjs collector/node_modules/puppeteer http://localhost:3001
const http = require("http");
const path = require("path");
const puppeteer = require(path.resolve(process.argv[2]));
const BASE = process.argv[3] || "http://localhost:3001";
const session = require("./_auth.cjs"); // Qanouni: every run signs in
const FAKE_PORT = Number(process.env.FAKE_PORT || 3098);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INVENTED = "DOC:98765";
function reply(system) {
  if (system.includes("حلا لحالة عملية"))
    return {
      phases: [{ phase: 1, correct: ["عرض الوقائع واضح"], missing: [`لم يستحضر [${INVENTED}]`], wrong: [], rules: [{ canonicalId: INVENTED }] }],
      rubric: { facts: 3, qualification: 2, rule: 1, application: 1, conclusion: 1 },
      overall: `تحليل مقبول، راجع الفصل 98765 من ق.ل.ع.`,
      suggestedCards: [{ front: "سؤال تجريبي", back: "جواب تجريبي", canonicalIds: [INVENTED] }],
    };
  if (system.includes("حلا مرجعيا")) return { phases: [{ phase: 1, text: "حل مرجعي تجريبي.", citations: [] }] };
  return {};
}

const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = JSON.parse(body || "{}");
    const system = (json.messages || []).find((m) => m.role === "system")?.content || "";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ model: "fake", choices: [{ message: { content: JSON.stringify(reply(system)) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
  });
});

async function api(method, p, body) {
  const res = await fetch(`${BASE}/api/law${p}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

(async () => {
  await session.init(BASE);
  await new Promise((r) => fake.listen(FAKE_PORT, "127.0.0.1", r));
  const results = {};
  const settings = (await api("GET", "/settings")).settings;
  await api("PATCH", "/settings", { aiBudgetDeepseekUsd: 5 });
  const { exercise } = await api("POST", "/cases", { title: `حالة e2e ${Date.now()}`, factsAr: "وقائع تجريبية للاختبار الآلي: ضرر وخطأ وعلاقة سببية." });
  const { attempt } = await api("POST", `/cases/${exercise.id}/attempts`, {});

  const browser = await puppeteer.launch({ headless: "new", executablePath: process.env.CHROME_BIN || undefined, userDataDir: process.env.PROFILE_DIR || undefined });
  const page = await browser.newPage();
  await session.attach(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${BASE}/law/method/attempt/${attempt.id}`, { waitUntil: "networkidle0" });
    await page.waitForSelector("textarea");
    results.noModelAnswerBeforeSubmit = await page.evaluate(() => !document.body.innerText.includes("حل مرجعي"));
    await page.type("textarea", "الوقائع المنتجة: شخص ألحق ضررا بغيره بخطئه، وتوجد علاقة سببية.");
    await sleep(2000); // autosave
    const click = (t) => page.evaluate((x) => [...document.querySelectorAll("button")].find((b) => b.innerText.includes(x)).click(), t);
    await click("تسليم للتصحيح");
    await click("تأكيد التسليم");
    await page.waitForFunction(() => document.body.innerText.includes("مراجع غير موجودة"), { timeout: 60000 });
    const text = await page.evaluate(() => document.body.innerText);
    results.banner = text.includes("مراجع غير قابلة للتحقق");
    results.panelListsInvented = text.includes("DOC:98765");
    // The red panel lists the invented reference; the critique prose itself must not contain it.
    const prose = text.split("\n").filter((l) => l.includes("تحليل مقبول") || l.includes("لم يستحضر"));
    results.removedFromText = prose.length === 2 && prose.every((l) => !l.includes("98765"));
    await page.screenshot({ path: path.join(process.env.SHOT_DIR || ".", "p5-critique.png") });
    await click("إظهار حل مرجعي");
    await page.waitForFunction(() => document.body.innerText.includes("حل مرجعي تجريبي"), { timeout: 30000 });
    results.modelAnswerOnRequest = true;
    if (!Object.values(results).every(Boolean)) throw new Error("assertion failed");
    console.log(JSON.stringify(results, null, 2));
    console.log("PASS");
  } catch (e) {
    console.error("FAIL:", e.message, JSON.stringify(results));
    process.exitCode = 1;
  } finally {
    await browser.close();
    await api("PATCH", "/settings", { aiBudgetDeepseekUsd: settings.aiBudgetDeepseekUsd });
    fake.close();
  }
})();
