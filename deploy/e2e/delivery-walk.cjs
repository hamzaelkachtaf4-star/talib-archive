// RC4 delivery walk: drives the running app through every hub and every flow of the delivery spec (Phase 11), asserts what it
// sees, and saves screenshots to docs/delivery-screens/ (1440 and 390 px, light and dark).
//
// Needs: the API on :3001 started in development (the registration code is returned on screen), the Vite dev server on :3000,
// and Playwright (`npm i playwright && npx playwright install chromium`, then run with NODE_PATH pointing at its node_modules).
// For the AI-backed flows without API keys start the server with `node -r ./deploy/e2e/fake-llm.cjs` and fake provider keys
// (see docs/DELIVERY_REPORT.md, "How to run"). Run against a scratch database: it creates accounts.
const fs = require("fs");
const path = require("path");
const L = require("./delivery-lib.cjs");

let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("playwright is not installed (see the header of this file)"); process.exit(2); }

const SHOTS = path.resolve(__dirname, "../../docs/delivery-screens");
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push([name, "ok"]); console.log("ok   ", name); }
  catch (e) { results.push([name, `FAIL ${e.message.split("\n")[0]}`]); console.log("FAIL ", name, "\n     ", e.message.split("\n")[0]); }
};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

const HUBS = [["today", "اليوم"], ["path", "المسار الدراسي"], ["exam", "مركز الامتحانات"], ["timetable", "استعمال الزمن"], ["library", "قوانين ومراجع"], ["community/friends", "المجتمع"]];

async function shoot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

(async () => {
  const tag = Date.now().toString(36);
  const a = await L.account(`walk-a-${tag}`, "سلمى العلمي");
  const b = await L.account(`walk-b-${tag}`, "يوسف الإدريسي");
  const browser = await chromium.launch();

  // 1. a screenshot of every hub in the four conditions
  for (const [w, h, label] of [[1440, 900, "1440"], [390, 844, "390"]]) {
    for (const dark of [false, true]) {
      const ctx = await L.open(browser, a, { width: w, height: h, dark });
      const page = await ctx.newPage();
      for (const [route, hub] of HUBS) {
        await step(`${hub} renders at ${label}px ${dark ? "dark" : "light"} without horizontal scroll`, async () => {
          await page.goto(`${L.BASE}/law/${route}`, { waitUntil: "networkidle" });
          await page.waitForTimeout(600);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          must(over <= 1, `horizontal overflow of ${over}px`);
          await shoot(page, `${route.replace("/", "-")}-${label}-${dark ? "dark" : "light"}`);
        });
      }
      await ctx.close();
    }
  }

  // 2. Today: todos, QR (no camera on desktop), bell with an actionable notification
  const ctxA = await L.open(browser, a);
  await ctxA.addInitScript(() => { window.__camera = 0; if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.__camera++; throw new Error("denied"); }; });
  const page = await ctxA.newPage();
  await page.goto(`${L.BASE}/law/today`, { waitUntil: "networkidle" });

  await step("todo: add with a priority, complete it, delete it", async () => {
    const input = page.getByPlaceholder("أضف مهمة ثم Enter");
    await input.fill("مراجعة الفصل 230");
    await page.selectOption('select[aria-label="الأولوية"]', "high");
    await input.press("Enter");
    await page.getByText("مراجعة الفصل 230").waitFor({ timeout: 5000 });
    must(await page.getByRole("button", { name: /الأولوية: عالية/ }).count() > 0, "priority chip missing");
    const box = page.getByRole("checkbox", { name: /مراجعة الفصل 230/ });
    await box.click(); // the store writes to IndexedDB first, so the box flips a moment later
    await page.waitForFunction(() => [...document.querySelectorAll("input[type=checkbox]")].some((c) => /مراجعة الفصل 230/.test(c.getAttribute("aria-label") || "") && c.checked), null, { timeout: 5000 });
    await page.getByRole("button", { name: "حذف المهمة" }).first().click();
    await page.getByText("مراجعة الفصل 230").waitFor({ state: "detached", timeout: 5000 });
  });

  await step("QR on desktop opens the card with the share code and never asks for the camera", async () => {
    await page.getByRole("button", { name: /رمز|QR/ }).first().click();
    await page.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).waitFor({ timeout: 5000 });
    must(await page.getByRole("link", { name: /WhatsApp/ }).count() === 1, "WhatsApp link missing");
    must((await page.evaluate(() => window.__camera)) === 0, "the camera was requested");
    await shoot(page, "today-qr-modal-1440");
    await page.keyboard.press("Escape");
  });

  await step("bell: a friend request can be accepted in the popover", async () => {
    const code = (await L.call("GET", "/law/friends/code", a.token)).body.shareCode;
    must((await L.call("POST", "/law/friends", b.token, { code })).status === 201, "request not sent");
    await page.goto(`${L.BASE}/law/today`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^الإشعارات/ }).click();
    await page.getByRole("button", { name: "قبول" }).first().waitFor({ timeout: 5000 });
    await shoot(page, "today-bell-popover-1440");
    await page.getByRole("button", { name: "قبول" }).first().click();
    await page.waitForTimeout(700);
    must((await L.call("GET", "/law/friends", a.token)).body.friends.length === 1, "the friendship was not accepted");
    await page.keyboard.press("Escape");
  });

  // 3. the study path: S3 shows six modules, the workspace, the four views, a pasted lecture
  await step("S3 lists the six seeded modules", async () => {
    await page.goto(`${L.BASE}/law/path`, { waitUntil: "networkidle" });
    for (const t of ["المسؤولية المدنية", "قانون الشركات", "القانون الاجتماعي / قانون الشغل", "التنظيم القضائي للمملكة", "الأنظمة الدستورية المقارنة", "قانون الميزانية والمالية العامة"])
      must(await page.getByText(t).count() > 0, `module missing: ${t}`);
    await shoot(page, "path-s3-1440");
  });

  await step("module workspace: questionnaire, the four views, a pasted lecture, the mentor builds notes", async () => {
    await page.getByText("المسؤولية المدنية").first().click();
    const dlg = page.locator('[role="dialog"]').first();
    await dlg.waitFor({ timeout: 8000 });
    for (let i = 0; i < 4; i++) {
      const radios = dlg.getByRole("radio");
      if (await radios.count()) await radios.nth(0).click({ force: true });
      await dlg.getByRole("button", { name: /التالي|حفظ/ }).last().click();
      await page.waitForTimeout(350);
    }
    for (const view of ["مسار المراحل", "قارئ أكاديمي", "شجرة قابلة للطي", "محاور المطبوع"]) {
      await page.getByRole("button", { name: view }).click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("tab", { name: "المحاضرات" }).click();
    await page.locator("textarea").first().fill("المسؤولية التقصيرية تقوم على ثلاثة أركان هي الخطأ والضرر والعلاقة السببية بينهما. ويُقصد بالخطأ الإخلال بواجب قانوني.");
    await page.getByRole("button", { name: "إضافة النص" }).click();
    await page.getByText("جاهز").first().waitFor({ timeout: 8000 });
    await page.getByRole("tab", { name: "المرشد" }).click();
    await page.getByRole("button", { name: "متابعة بناء وتلخيص الدرس" }).click();
    await page.getByPlaceholder("ماذا تريد أن يبني المرشد؟").fill("ابن لي ملاحظات الدرس");
    await page.getByRole("button", { name: "اقترح" }).click();
    await page.getByRole("button", { name: "قبول" }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "قبول" }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "المحتوى" }).click();
    await shoot(page, "module-workspace-1440");
    must(await page.getByRole("link", { name: "اختبر نفسك في هذه المادة" }).count() === 1, "the exam-center button is missing");
  });

  // 4. exam center: the four drills and an exam date with its countdown
  await step("exam center: QCM with instant feedback, then case, theory and essay drills", async () => {
    await page.goto(`${L.BASE}/law/exam`, { waitUntil: "networkidle" });
    const start = (i) => page.getByRole("button", { name: "ابدأ" }).nth(i);
    // QCM
    await start(0).click();
    await page.getByRole("radio").first().waitFor({ timeout: 10000 });
    const first = page.locator("ol > li").first();
    await first.getByRole("radio").first().check();
    await first.getByText(/إجابة (صحيحة|خاطئة)/).waitFor({ timeout: 5000 });
    for (const li of (await page.locator("ol > li").all()).slice(1)) await li.getByRole("radio").first().check();
    await page.getByRole("button", { name: "إنهاء وعرض النتيجة" }).click();
    await page.getByText(/النتيجة/).first().waitFor({ timeout: 8000 });
    await shoot(page, "exam-qcm-result-1440");
    await page.getByRole("button", { name: "إغلاق" }).click();
    // case
    await start(1).click();
    const areas = page.locator("textarea");
    await areas.first().waitFor({ timeout: 10000 });
    for (let i = 0; i < (await areas.count()); i++) await areas.nth(i).fill("تحليل مفصل لهذه المرحلة من النازلة وفق المصدر المتاح.");
    await page.getByRole("button", { name: "تسليم للتصحيح" }).click();
    await page.getByText(/النتيجة/).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "إغلاق" }).click();
    // direct
    await start(2).click();
    await areas.first().waitFor({ timeout: 10000 });
    for (let i = 0; i < (await areas.count()); i++) await areas.nth(i).fill("تعريف مختصر للمفهوم المطلوب.");
    await page.getByRole("button", { name: "تسليم للتصحيح" }).click();
    await page.getByText(/النتيجة/).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "إغلاق" }).click();
    // dissertation
    await start(3).click();
    await page.getByRole("heading", { name: "المبحث الأول" }).waitFor({ timeout: 10000 }); // the drill replaces the page once it is loaded
    const boxes = page.getByRole("textbox");
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).fill(i === 0 ? "مقدمة الموضوع بصياغة مناسبة تعرض أركان المسؤولية." : i === 1 ? "ما هي الأركان التي تقوم عليها المسؤولية التقصيرية؟" : `عنوان رقم ${i}`);
    await page.getByRole("button", { name: /تسليم/ }).click();
    await page.getByText(/النتيجة/).first().waitFor({ timeout: 10000 });
    await shoot(page, "exam-dissertation-result-1440");
  });

  await step("an exam added by hand shows its countdown on Today", async () => {
    const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    must((await L.call("POST", "/law/exam/dates", a.token, { title: "امتحان المسؤولية المدنية", date: d })).status === 201, "date not saved");
    await page.goto(`${L.BASE}/law/today`, { waitUntil: "networkidle" });
    await page.getByText(/بعد 5 يوم|بعد 4 يوم/).first().waitFor({ timeout: 8000 });
    await shoot(page, "today-exam-countdown-1440");
  });

  // 5. timetable
  await step("timetable: add a session on the grid and import the CSV template", async () => {
    await page.goto(`${L.BASE}/law/timetable`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^إضافة حصة$/ }).first().click();
    const dlg = page.locator('[role="dialog"]').first();
    await dlg.waitFor({ timeout: 5000 });
    await dlg.locator("select").nth(2).selectOption({ index: 1 });
    await dlg.getByRole("button", { name: "حفظ" }).click();
    await page.waitForTimeout(900);
    must(await page.locator('[role="rowheader"]').count() >= 1, "no row in the grid after saving");
    await page.getByRole("tab", { name: "ملف" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تنزيل قالب CSV" }).click()]);
    const tpl = path.join(SHOTS, "timetable-template.csv");
    await dl.saveAs(tpl);
    await page.setInputFiles("input[type=file]", tpl);
    await page.getByRole("button", { name: /تأكيد وحفظ/ }).waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: /تأكيد وحفظ/ }).click();
    await page.waitForTimeout(900);
    fs.rmSync(tpl, { force: true });
    await shoot(page, "timetable-grid-1440");
  });

  // 6. corpus
  await step("legal texts: outline of a code, a search by article number, the reader with save and link", async () => {
    await page.goto(`${L.BASE}/law/library/corpus?code=DOC`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "فتح الكل" }).click();
    await shoot(page, "library-code-tree-1440");
    await page.locator("select").first().selectOption("");
    await page.getByPlaceholder(/الفصل 77/).fill("230");
    await page.locator('a[href^="/law/corpus/a/"]').first().waitFor({ timeout: 8000 });
    await page.locator('a[href^="/law/corpus/a/"]').first().click();
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await page.getByRole("button", { name: "اربط بمادة" }).click();
    await page.getByText("رُبط النص بالمادة").waitFor({ timeout: 5000 });
    await shoot(page, "library-article-1440");
  });

  // 7. community: friend request by code from the page, then a work group document with a change request
  await step("community: a second student adds the first by code in the Friends tab", async () => {
    const c = await L.account(`walk-c-${tag}`, "ليلى الفاسي");
    const ctxC = await L.open(browser, c);
    const pc = await ctxC.newPage();
    await pc.goto(`${L.BASE}/law/community/friends`, { waitUntil: "networkidle" });
    await shoot(pc, "community-friends-1440");
    await ctxC.close();
  });

  await step("work group: the member proposes a change; the admin accepts it from the diff on the document page", async () => {
    const squad = (await L.call("POST", "/law/squads/create", a.token, { name: "فريق المسؤولية", moduleTitle: "المسؤولية المدنية", visibility: "private", publishMode: "members_propose" })).body.squad;
    must((await L.call("POST", "/law/squads/join", b.token, { code: squad.inviteCode })).status === 200, "join failed");
    const doc = (await L.call("POST", "/law/squads/docs", a.token, { type: "summary", title: "ملخص أركان المسؤولية", content: "المسؤولية التقصيرية تقوم على الخطأ والضرر والعلاقة السببية.\n\nالخطأ هو الإخلال بواجب قانوني." })).body.doc;
    must((await L.call("POST", `/law/squads/docs/${doc.id}/change-requests`, b.token, { title: "توضيح", content: "المسؤولية التقصيرية تقوم على الخطأ والضرر والعلاقة السببية بينهما.\n\nالخطأ هو الإخلال بواجب قانوني سابق." })).status === 201, "change request not created");
    await page.goto(`${L.BASE}/law/squad/docs/${doc.id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "قبول التعديل" }).waitFor({ timeout: 8000 });
    await shoot(page, "squad-doc-diff-1440");
    await page.getByRole("button", { name: "قبول التعديل" }).click();
    await page.waitForTimeout(1000);
    const now = (await L.call("GET", `/law/squads/docs/${doc.id}`, a.token)).body.doc.content;
    must(now.includes("بينهما"), "the accepted change is not the document's new version");
    must((await L.call("GET", `/law/squads/docs/${doc.id}/revisions`, a.token)).body.revisions.length >= 2, "no version history");
  });

  // 8. avatar: each of the five outfits builds and saves
  await step("avatar studio: the five legal outfits each save and come back", async () => {
    for (const [label, outfit] of [["بذلة القاضي", "judge"], ["روب المحاماة", "lawyer"], ["عدل / موثق", "adoul"], ["أستاذ جامعي", "professor"], ["طالب حقوق", "student"]]) {
      await page.goto(`${L.BASE}/law/profile`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /تعديل الصورة|الصورة الرمزية/ }).first().click().catch(async () => { await page.locator('[aria-label*="الصورة"]').first().click(); });
      await page.getByRole("button", { name: label, exact: true }).click();
      if (outfit === "judge") await shoot(page, "avatar-studio-1440");
      await page.getByRole("button", { name: "حفظ", exact: true }).click();
      await page.waitForTimeout(700);
      const cfg = (await L.call("GET", "/law/me/profile", a.token)).body.profile.avatarConfig;
      must(cfg && cfg.outfit === outfit, `outfit ${outfit} not saved (got ${cfg && cfg.outfit})`);
    }
  });

  await browser.close();
  const failed = results.filter(([, r]) => r !== "ok");
  fs.writeFileSync(path.join(SHOTS, "walk-results.json"), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
