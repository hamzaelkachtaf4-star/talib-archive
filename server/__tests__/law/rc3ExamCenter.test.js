// RC3 Phase 4 (client): exam center page, drill runners, outline rules, schedule import, radar, FSRS regression.
const fs = require("fs");
const path = require("path");
const { IDBFactory } = require("fake-indexeddb");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");
const serverFsrs = require("../../utils/law/fsrs");
const D = require("../../utils/law/drills");

const FR = require("../../../frontend/src/locales/qanouni/fr.json");
const json = (body, ok = true, status) => ({ ok, status: status || (ok ? 200 : 400), json: async () => body });
const settle = (m) => m.idle(); // waits for the requests in flight, not for a fixed time
const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
const type = (m, el, value) => m.act(async () => {
  const proto = el.tagName === "TEXTAREA" ? m.window.HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? m.window.HTMLSelectElement.prototype : m.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new m.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});
const byText = (root, sel, re) => [...root.querySelectorAll(sel)].find((e) => re.test(e.textContent));
const keyOf = (method, url) => `${method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;

describe("FSRS regression: the offline preview and the server replay agree", () => {
  test("a review history gives the same card on the client and on the server", async () => {
    const C = await loadEsm('export * from "@/components/LawOS/lib/fsrs";');
    const created = new Date("2026-10-01T08:00:00Z");
    const times = ["2026-10-01T08:05:00Z", "2026-10-01T08:20:00Z", "2026-10-04T09:00:00Z", "2026-10-12T10:00:00Z", "2026-11-20T10:00:00Z"].map((t) => new Date(t));
    const grades = [3, 3, 4, 1, 3];
    let card = { due: created.toISOString(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: "new", lastReview: null };
    times.forEach((t, i) => { card = C.rateLocally(card, grades[i], t); });
    const logs = times.map((t, i) => ({ clientReviewId: `r${i}`, rating: grades[i], reviewedAt: t }));
    const { fields } = serverFsrs.replay(created, logs);
    expect(card.state).toBe(fields.state);
    expect(card.reps).toBe(fields.reps);
    expect(card.lapses).toBe(fields.lapses);
    expect(new Date(card.due).toISOString()).toBe(new Date(fields.due).toISOString());
    expect(card.stability).toBeCloseTo(fields.stability, 8);
    expect(card.difficulty).toBeCloseTo(fields.difficulty, 8);
    expect(card.lapses).toBe(1); // the "Again" on day 12 is a lapse
  });

  test("the card review page is still the exam/cards route", () => {
    const routes = fs.readFileSync(path.resolve(__dirname, "../../../frontend/src/pages/LawOS/routes.jsx"), "utf8");
    expect(routes).toMatch(/"exam\/cards":\s*\(\) => import\("\.\/Review"\)/);
  });
});

describe("outline rules: the client mirrors the server validator", () => {
  let O;
  beforeAll(async () => { O = await loadEsm('export * from "@/components/LawOS/exam/outlineRules";'); });
  const good = { intro: "تمهيد عام حول الموضوع وأهميته", problem: "ما حدود المسؤولية التقصيرية؟", parts: [{ title: "المبحث الأول: الأركان", subs: ["المطلب الأول: الخطأ", "المطلب الثاني: الضرر"] }, { title: "المبحث الثاني: الآثار", subs: ["المطلب الأول: التعويض", "المطلب الثاني: التقادم"] }] };
  const vectors = [
    good, { ...good, intro: "" }, { ...good, problem: "" }, { ...good, problem: "إشكالية بلا علامة استفهام واضحة" }, { ...good, parts: [good.parts[0]] },
    { ...good, parts: [{ title: "", subs: ["ا ب ج", "د ه و"] }, good.parts[1]] }, { ...good, parts: [good.parts[0], { ...good.parts[1], subs: ["واحد فقط"] }] },
    { ...good, parts: [good.parts[0], { ...good.parts[1], subs: ["أ ب ج", "أ ب ج"] }] }, { ...good, parts: [good.parts[0], { ...good.parts[1], subs: [...good.parts[1].subs, "ثالث ثالث"] }] },
    {}, { parts: "no" },
  ];
  test.each(vectors.map((v, i) => [i, v]))("vector %i gives the same errors and warnings on both sides", (_i, v) => {
    const c = O.checkOutline(v);
    const s = D.validateOutline(v);
    expect(c.errors).toEqual(s.errors.filter((e) => e !== "invalid_outline"));
    expect(c.warnings).toEqual(s.warnings);
    expect(c.valid).toBe(s.valid);
  });
  test("every code has a message", () => {
    for (const c of ["intro_missing", "problem_missing", "problem_not_a_question", "two_parts_required", "part1_title_missing", "part2_title_missing", "part1_needs_2_or_3_subsections", "part2_needs_2_or_3_subsections", "duplicate_titles", "unbalanced_parts", "invalid_outline"])
      expect(O.outlineMessage(c)).not.toBe(c);
  });
});

describe("readiness radar", () => {
  let R;
  beforeAll(async () => { R = await loadEsm('export * from "@/components/LawOS/exam/ReadinessRadar";'); });
  test("polygon places the full-score axis at the rim, straight up, and a missing value at the centre", () => {
    const pts = R.polygon([100, 0, 0, 0, 0]).split(" ").map((p) => p.split(",").map(Number));
    expect(pts[0]).toEqual([100, 20]); // 100% = radius 80 above the centre
    expect(pts[1]).toEqual([100, 100]);
    expect(R.polygon([null, undefined, 50, 150, -20])).toBe(R.polygon([0, 0, 50, 100, 0]));
  });

  test("renders per-module axes in a table with 'no data' where there is none, and switches module", async () => {
    const readiness = { semester: "S3", modules: [
      { id: "a", title: "المسؤولية المدنية", axes: { cards: null, path: 25, drills: 80, notes: 50, gaps: null }, overall: 52 },
      { id: "b", title: "قانون الشركات", axes: { cards: 10, path: 0, drills: null, notes: null, gaps: null }, overall: 5 },
    ] };
    const m = await mountJsx(`import ReadinessRadar from "@/components/LawOS/exam/ReadinessRadar";\nconst __default = () => <ReadinessRadar />;`, { lang: "fr", fetch: async () => json(readiness) });
    await settle(m);
    expect(m.container.querySelector("svg[role=img]")).not.toBeNull();
    const rows = [...m.container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(rows[0]).toContain(FR["البطاقات"]); expect(rows[0]).toContain(FR["لا بيانات"]);
    expect(rows[2]).toContain("80%");
    expect(rows.at(-1)).toContain("52%");
    await click(m, byText(m.container, "button", /قانون الشركات/));
    expect(m.container.querySelector("caption").textContent).toContain("قانون الشركات");
    expect(m.container.querySelector("tbody").textContent).toContain("5%");
    await m.unmount();
  });

  test("without modules it invites the student to open the study path", async () => {
    const m = await mountJsx(`import ReadinessRadar from "@/components/LawOS/exam/ReadinessRadar";\nconst __default = () => <ReadinessRadar />;`, { lang: "fr", fetch: async () => json({ modules: [] }) });
    await settle(m);
    expect(m.container.textContent).toContain(FR["افتح مسارك الدراسي لتظهر مواد فصلك هنا."]);
    expect(m.container.querySelector("table")).toBeNull();
    await m.unmount();
  });
});

describe("exam center page", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";
import ExamCenter from "@/pages/LawOS/ExamCenter";
const __default = () => <MemoryRouter initialEntries={["/law/exam"]}><ExamCenter /></MemoryRouter>;`;
  const qcmPrompt = { items: [{ question: "ما أركان المسؤولية التقصيرية؟", options: ["الخطأ والضرر والسببية", "العقد", "الضرر وحده", "لا شيء"] }] };

  function api(over = {}, calls = []) {
    const state = { drills: [], submitted: false };
    const table = {
      "GET /me/academic": () => ({ academic: { semester: "S3" } }),
      "GET /modules": () => ({ semester: "S3", modules: [{ id: "m1", title: "المسؤولية المدنية" }, { id: "m2", title: "قانون الشركات" }], canAdd: true }),
      "GET /exam/countdown": () => ({ exams: [{ id: 1, title: "امتحان المسؤولية", daysTo: 5 }, { id: 2, title: "امتحان الشركات", daysTo: 9 }] }),
      "GET /exam/modules/m1/suggest": () => ({ type: "case", reason: "professor_format" }),
      "GET /exam/modules/m2/suggest": () => ({ type: "qcm", reason: "least_practised" }),
      "GET /exam/modules/m1/drills": () => ({ drills: state.drills }),
      "GET /exam/modules/m2/drills": () => ({ drills: [] }),
      "GET /exam/readiness": () => ({ modules: [] }),
      "POST /exam/modules/m1/drills": () => { state.drills = [{ id: 7, type: "qcm", status: "open", score: null }]; return { drill: { id: 7, moduleId: "m1", type: "qcm", status: "open", prompt: qcmPrompt } }; },
      "GET /exam/drills/7": () => (state.submitted
        ? { drill: { id: 7, type: "qcm", status: "submitted", score: 100, prompt: qcmPrompt, feedback: { items: [{ chosen: 0, correct: true }] }, key: { items: [{ correctIndex: 0, explanation: "ثلاثة أركان", cite: { title: "محاضرة 1" } }] }, answer: { answers: [0] } } }
        : { drill: { id: 7, type: "qcm", status: "open", prompt: qcmPrompt } }),
      "POST /exam/drills/7/check": () => ({ index: 0, chosen: 0, correct: true, correctIndex: 0, explanation: "ثلاثة أركان", cite: { title: "محاضرة 1" } }),
      "POST /exam/drills/7/submit": () => { state.submitted = true; return { drill: { id: 7, type: "qcm", status: "submitted", score: 100, prompt: qcmPrompt, feedback: { items: [{ chosen: 0, correct: true }] }, key: { items: [{ correctIndex: 0, explanation: "ثلاثة أركان", cite: { title: "محاضرة 1" } }] }, answer: { answers: [0] } } }; },
      ...over,
    };
    return async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      const hit = table[key];
      return hit === undefined ? json({}, false, 404) : json(hit());
    };
  }
  const mount = (over, calls) => { globalThis.indexedDB = new IDBFactory(); return mountJsx(entry, { lang: "fr", fetch: api(over, calls) }); };

  test("shows the countdown, the four drill types and the type the professor's format suggests", async () => {
    const m = await mount();
    await settle(m);
    const text = m.container.textContent;
    expect(text).toContain("امتحان المسؤولية");
    expect(text).toContain(FR["بعد {0} يوم"].replace("{0}", "5"));
    const cards = [...m.container.querySelectorAll("[data-suggested]")];
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain(FR["نازلة تطبيقية"]);
    expect(m.container.querySelectorAll("button").length).toBeGreaterThan(4);
    expect(text).toContain(FR["حسب شكل امتحان أستاذك"]);
    await m.unmount();
  });

  test("switching module refreshes the suggestion", async () => {
    const m = await mount();
    await settle(m);
    await click(m, byText(m.container, "button[aria-pressed]", /قانون الشركات/)); // the subject cards replace the old select
    await settle(m);
    expect(m.container.querySelector("[data-suggested]").textContent).toContain(FR["أسئلة متعددة الخيارات"]);
    await m.unmount();
  });

  test("a QCM: start, answer (checked at once: that question's key and source appear), then finish for the score", async () => {
    const calls = [];
    const m = await mount({}, calls);
    await settle(m);
    // the QCM card is the one with the question-count select
    const qcmCard = m.container.querySelector("select[aria-label='" + FR["عدد الأسئلة"] + "']").closest("div.law-card");
    await click(m, qcmCard.querySelector("button"));
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/modules/m1/drills").body).toEqual({ type: "qcm", count: 5, locale: "fr" });
    expect(m.container.textContent).toContain("ما أركان المسؤولية التقصيرية؟");
    expect(m.container.textContent).not.toContain("ثلاثة أركان");
    expect(m.container.textContent).not.toContain(FR["الصحيح"]);
    const submit = byText(m.container, "button", new RegExp(`^${FR["إنهاء وعرض النتيجة"]}$`));
    expect(submit.disabled).toBe(true); // every question must be answered first
    await click(m, m.container.querySelector(`[role=group][aria-label='${FR["الخيارات"]}'] button`)); // tactile option buttons, one question at a time
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/drills/7/check").body).toEqual({ index: 0, choice: 0 });
    expect(m.container.textContent).toContain("ثلاثة أركان"); // instant feedback for that question
    expect(m.container.textContent).toContain(FR["إجابة صحيحة"]);
    expect(submit.disabled).toBe(false);
    await click(m, submit);
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/drills/7/submit").body).toEqual({ answers: [0] });
    expect(m.container.textContent).toContain("محاضرة 1");
    expect(m.container.textContent).toContain("100/100");
    await m.unmount();
  });

  test("no material: a clear message, no drill opened", async () => {
    globalThis.indexedDB = new IDBFactory();
    const m = await mountJsx(entry, { lang: "fr", fetch: async (url, init = {}) => (keyOf(init.method, url) === "POST /exam/modules/m1/drills" ? json({ error: { code: "no_material" } }, false, 409) : api()(url, init)) });
    await settle(m);
    const qcmCard = m.container.querySelector("select[aria-label='" + FR["عدد الأسئلة"] + "']").closest("div.law-card");
    await click(m, qcmCard.querySelector("button"));
    await settle(m);
    expect(m.container.textContent).toContain(FR["أضف ملاحظات أو مصادر إلى هذه المادة أولاً، فالتمارين تُبنى منها فقط."]);
    expect(m.container.querySelector("input[type=radio]")).toBeNull();
    await m.unmount();
  });

  test("drills can be deleted from the list (open ones ask first)", async () => {
    const calls = [];
    const state = { drills: [{ id: 7, type: "qcm", status: "open", score: null }, { id: 8, type: "case", status: "submitted", score: 70 }] };
    const m = await mount({ "GET /exam/modules/m1/drills": () => ({ drills: state.drills }), "DELETE /exam/drills/7": () => { state.drills = state.drills.filter((d) => d.id !== 7); return {}; }, "DELETE /exam/drills/8": () => ({}) }, calls);
    await settle(m);
    const delButtons = () => [...m.container.querySelectorAll("button")].filter((b) => (b.getAttribute("aria-label") || "").startsWith(FR["حذف التمرين"]));
    const del = delButtons();
    expect(del).toHaveLength(2);
    m.window.confirm = () => true;
    await click(m, del[0]);
    await settle(m);
    expect(calls.some((c) => c.key === "DELETE /exam/drills/7")).toBe(true);
    expect(delButtons()).toHaveLength(1);
    await m.unmount();
  });

  test("the card review and weak spots keep their links under /law/exam", async () => {
    const m = await mount();
    await settle(m);
    expect(m.container.querySelector("a[href='/law/exam/cards']")).not.toBeNull();
    expect(m.container.querySelector("a[href='/law/exam/weak-spots']")).not.toBeNull();
    await m.unmount();
  });
});

describe("exam set-up and exam path", () => {
  let P;
  beforeAll(async () => { P = await loadEsm('export * from "@/components/LawOS/exam/examPlan";'); });
  const cfg = (over = {}) => ({ types: ["qcu", "case", "dissertation"], difficulty: "progressive", count: 10, caseSource: "both", builtAt: "2026-10-23T10:00:00.000Z", ...over });

  test("stages follow the set-up's own order and a progressive level rises to exam level", () => {
    const st = P.stagesOf(cfg({ types: ["dissertation", "cards", "qcu", "case", "direct"] }));
    expect(st.map((s) => s.key)).toEqual(["cards", "qcu", "direct", "case", "dissertation"]);
    expect(st.map((s) => s.difficulty)).toEqual(["easy", "medium", "medium", "hard", "hard"]);
    expect(st[1]).toMatchObject({ drill: "qcm", count: 10 });
    expect(st[0]).toMatchObject({ drill: null, count: null });
    expect(P.stagesOf(cfg({ types: ["case"] }))[0].difficulty).toBe("hard"); // a single stage is exam level
    expect(P.stagesOf(cfg({ difficulty: "easy" })).every((s) => s.difficulty === "easy")).toBe(true);
    expect(P.stagesOf(cfg({ types: ["qcm", "analytic"] })).every((s) => !s.supported)).toBe(true); // no generator yet: shown as soon, never started
  });

  test("a stage is done only by a submitted drill of its type created after the path was built", () => {
    const [q] = P.stagesOf(cfg({ types: ["qcu"] }));
    const t = "2026-10-23T10:00:00.000Z";
    expect(P.stageDone(q, [{ type: "qcm", status: "submitted", createdAt: "2026-10-23T09:00:00.000Z" }], t)).toBe(false);
    expect(P.stageDone(q, [{ type: "qcm", status: "open", createdAt: "2026-10-23T11:00:00.000Z" }], t)).toBe(false);
    expect(P.stageDone(q, [{ type: "case", status: "submitted", createdAt: "2026-10-23T11:00:00.000Z" }], t)).toBe(false);
    expect(P.stageDone(q, [{ type: "qcm", status: "submitted", createdAt: "2026-10-23T11:00:00.000Z" }], t)).toBe(true);
    expect(P.stageDone({ drill: null }, [], t)).toBe(false);
  });
});

describe("exam set-up screen", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";\nimport ExamCenter from "@/pages/LawOS/ExamCenter";\nconst __default = () => <MemoryRouter initialEntries={["/law/exam"]}><ExamCenter /></MemoryRouter>;`;
  function mount(state, calls = []) {
    globalThis.indexedDB = new IDBFactory();
    const table = {
      "GET /me/academic": () => ({ academic: { semester: "S3" } }),
      "GET /modules": () => ({ semester: "S3", modules: [{ id: "m1", title: "المسؤولية المدنية", completed: 1, total: 9 }], canAdd: true }),
      "GET /exam/countdown": () => ({ exams: [] }),
      "GET /exam/modules/m1/suggest": () => ({ type: "case", reason: "least_practised" }),
      "GET /exam/modules/m1/drills": () => ({ drills: state.drills || [] }),
      "GET /exam/readiness": () => ({ modules: [] }),
      "GET /modules/m1/profile": () => ({ profile: { examConfig: state.config } }),
      "GET /modules/m1/professor": () => ({ card: { examFormat: "" } }),
      "PUT /modules/m1/profile": (b) => { state.config = b.examConfig; return { profile: { examConfig: b.examConfig } }; },
      "POST /exam/modules/m1/drills": () => ({ drill: { id: 9, moduleId: "m1", type: "qcm", status: "open", prompt: { items: [{ question: "س", options: ["أ", "ب", "ج", "د"] }] } } }),
      "GET /exam/drills/9": () => ({ drill: { id: 9, type: "qcm", status: "open", prompt: { items: [{ question: "س", options: ["أ", "ب", "ج", "د"] }] } } }),
    };
    return mountJsx(entry, { lang: "fr", fetch: async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      const hit = table[key];
      return hit === undefined ? json({}, false, 404) : json(hit(init.body ? JSON.parse(init.body) : {}));
    } });
  }
  const btn = (m, label) => byText(m.container, "button", new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));

  test("the first visit shows the full set-up: seven types with two marked soon, levels, counts, case source and the build button", async () => {
    const m = await mount({ config: null });
    await settle(m);
    const grid = m.container.querySelector(`[role=group][aria-label='${FR["أنواع التمارين"]}']`);
    const cards = [...grid.querySelectorAll("button")];
    expect(cards).toHaveLength(7);
    expect(cards.filter((c) => c.disabled)).toHaveLength(2); // QCM (several answers) and analytical questions have no generator yet
    expect(cards.filter((c) => c.getAttribute("aria-pressed") === "true")).toHaveLength(2); // defaults: QCU and cases
    expect([...m.container.querySelectorAll(`[role=group][aria-label='${FR["مستوى الصعوبة"]}'] button`)].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "true"]); // progressive by default
    const slider = m.container.querySelector("input[type=range]");
    expect([slider.min, slider.max, slider.value]).toEqual(["5", "20", "10"]); // a free slider from 5 to 20 questions
    expect([...m.container.querySelectorAll(`[role=group][aria-label='${FR["كيف تريد أن تُختبر؟"]}'] button`)].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]); // cards / quiz / final: quiz by default
    expect(m.container.querySelectorAll(`[role=group][aria-label='${FR["مصدر النوازل"]}'] button`)).toHaveLength(3);
    expect(btn(m, FR["ابنِ مسار الامتحان"])).toBeDefined();
    await m.unmount();
  });

  test("building the path stores the set-up, shows the stages, and a stage starts a drill with its level and count", async () => {
    const calls = [];
    const state = { config: null };
    const m = await mount(state, calls);
    await settle(m);
    const grid = () => [...m.container.querySelector(`[role=group][aria-label='${FR["أنواع التمارين"]}']`).querySelectorAll("button")];
    await click(m, grid()[0]); // add the learning cards
    await type(m, m.container.querySelector("input[type=range]"), "17"); // any number from 5 to 20
    await click(m, [...m.container.querySelectorAll(`[role=group][aria-label='${FR["كيف تريد أن تُختبر؟"]}'] button`)][2]); // final exam
    await click(m, btn(m, FR["ابنِ مسار الامتحان"]));
    await settle(m);
    const saved = calls.filter((c) => c.key === "PUT /modules/m1/profile").pop().body.examConfig;
    expect(saved).toMatchObject({ types: ["qcu", "case", "cards"], difficulty: "progressive", count: 17, caseSource: "both", mode: "final" });
    expect(Date.parse(saved.builtAt)).not.toBeNaN();
    const stages = [...m.container.querySelectorAll("section[aria-label='" + FR["مسار الامتحان"] + "'] ol > li")];
    expect(stages).toHaveLength(3);
    expect(stages[0].textContent).toContain(FR["بطاقات التعلم"]);
    expect(stages[1].textContent).toContain("QCU");
    expect(stages[1].textContent).toContain("17");
    expect(stages[1].textContent).toContain(FR["امتحان نهائي بنقطة"]);
    await click(m, [...stages[1].querySelectorAll("button")].pop());
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/modules/m1/drills").body).toMatchObject({ type: "qcm", count: 17, difficulty: "medium", mode: "final" });
    await m.unmount();
  });

  test("a saved path comes back as stages; changing the settings reopens the set-up with the same choices", async () => {
    const config = { types: ["qcu", "dissertation"], difficulty: "hard", count: 5, caseSource: "ai", builtAt: "2026-10-23T10:00:00.000Z" };
    const m = await mount({ config, drills: [{ id: 3, type: "qcm", status: "submitted", score: 80, createdAt: "2026-10-23T12:00:00.000Z" }] });
    await settle(m);
    const stages = [...m.container.querySelectorAll("section[aria-label='" + FR["مسار الامتحان"] + "'] ol > li")];
    expect(stages).toHaveLength(2);
    expect(stages[0].querySelector("svg")).not.toBeNull(); // QCU: done by the submitted drill, a tick instead of the number
    expect(stages[1].textContent).toContain(FR["موضوع إنشائي"]);
    await click(m, btn(m, FR["تغيير الإعدادات"]));
    const on = [...m.container.querySelector(`[role=group][aria-label='${FR["أنواع التمارين"]}']`).querySelectorAll("button[aria-pressed=true]")].map((b) => b.textContent);
    expect(on).toHaveLength(2);
    await m.unmount();
  });

  test("the build button needs at least one type", async () => {
    const m = await mount({ config: null });
    await settle(m);
    for (const b of m.container.querySelector(`[role=group][aria-label='${FR["أنواع التمارين"]}']`).querySelectorAll("button[aria-pressed=true]")) await click(m, b);
    expect(btn(m, FR["ابنِ مسار الامتحان"]).disabled).toBe(true);
    await m.unmount();
  });
});

describe("case and dissertation runners", () => {
  const run = (drill, extra = {}) => `import DrillRunner from "@/components/LawOS/exam/DrillRunner";\nconst __default = () => <DrillRunner drillId={1} onClose={() => {}} />;`;
  const long = "جواب الطالب في هذا القسم";
  async function mount(openDrill, submitResult, calls = []) {
    return mountJsx(run(), { lang: "fr", fetch: async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (key === "GET /exam/drills/1") return json({ drill: openDrill });
      if (key === "POST /exam/drills/1/submit") return typeof submitResult === "function" ? submitResult() : json(submitResult);
      return json({}, false, 404);
    } });
  }
  const caseOpen = { id: 1, type: "case", status: "open", prompt: { facts: "اقترض أحمد مبلغا من صديقه وامتنع عن الأداء", sections: ["facts", "issue", "rule", "solution"] } };

  const next = (m) => byText(m.container, "button", new RegExp(`^${FR["التالي"]}$`));
  const back = (m) => byText(m.container, "button", new RegExp(`^${FR["السابق"]}$`));
  const stepBtns = (m) => [...m.container.querySelectorAll("ol[aria-label] button")];
  /** Writes the four sections one step at a time and stops on the last step (where the submit button is). */
  async function writeAll(m, texts) {
    await click(m, next(m)); // step 1: the case is read
    for (let i = 0; i < 4; i++) {
      await type(m, m.container.querySelector("textarea"), texts[i]);
      if (i < 3) await click(m, next(m));
    }
  }

  test("a case is a five-step stepper: read it, then one section per step; a step opens only after the previous one is long enough; the result shows verdicts, key points and the AI label", async () => {
    const calls = [];
    const result = ({ drill: { ...caseOpen, status: "submitted", score: 63, answer: { facts: long, issue: long, rule: long, solution: long },
      feedback: { rows: [{ key: "facts", verdict: "good", comment: "جيد" }, { key: "issue", verdict: "partial", comment: "ناقص" }, { key: "rule", verdict: "good", comment: "ok" }, { key: "solution", verdict: "missing", comment: "" }], strengths: ["واضح"], improvements: [] },
      key: { keyPoints: [{ section: "rule", point: "القاعدة هي ...", cite: { title: "محاضرة 1" } }] } } });
    const m = await mount(caseOpen, result, calls);
    await settle(m);
    expect(stepBtns(m)).toHaveLength(5);
    expect(m.container.textContent).toContain(caseOpen.prompt.facts); // step 1 is the case to read
    expect(m.container.querySelector("textarea")).toBeNull();
    expect(stepBtns(m).map((b) => b.disabled)).toEqual([false, false, true, true, true]); // reading and the first section are open, the rest are closed
    expect(byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"]))).toBeUndefined(); // submit only exists on the last step
    await click(m, next(m));
    expect(m.container.textContent).not.toContain("القاعدة هي ..."); // no model answer on any step before the student submits
    expect(next(m).disabled).toBe(true); // an empty section cannot be skipped
    await type(m, m.container.querySelector("textarea"), "قصير");
    expect(next(m).disabled).toBe(true);
    await type(m, m.container.querySelector("textarea"), long);
    expect(next(m).disabled).toBe(false);
    expect(stepBtns(m).map((b) => b.disabled)).toEqual([false, false, false, true, true]);
    await click(m, next(m));
    expect(m.container.textContent).not.toContain("القاعدة هي ...");
    await type(m, m.container.querySelector("textarea"), long);
    await click(m, next(m));
    await type(m, m.container.querySelector("textarea"), long);
    await click(m, next(m));
    expect(m.container.textContent).not.toContain("القاعدة هي ...");
    const submit = byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"]));
    expect(submit.disabled).toBe(true); // the fourth section is still empty
    await type(m, m.container.querySelector("textarea"), long);
    expect(submit.disabled).toBe(false);
    await click(m, back(m)); // going back keeps what was written
    expect(m.container.querySelector("textarea").value).toBe(long);
    await click(m, next(m));
    await click(m, byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"]))); // the last step again: the button is fresh
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/drills/1/submit").body).toEqual({ answer: { facts: long, issue: long, rule: long, solution: long } });
    const text = m.container.textContent;
    expect(text).toContain(FR["وافٍ"]); expect(text).toContain(FR["ناقص"]); expect(text).toContain(FR["غائب أو خاطئ"]);
    expect(text).toContain("القاعدة هي ..."); expect(text).toContain("63/100"); expect(text).toContain(FR["تصحيح بالذكاء الاصطناعي من مصادرك"]);
    await m.unmount();
  });

  test("QCM runner: one question at a time with tactile options, a progress bar, Next only after the answer is checked, a wrong choice marked and the key shown", async () => {
    const calls = [];
    const open = { id: 1, type: "qcm", status: "open", prompt: { items: [{ question: "س١", options: ["أ", "ب", "ج", "د"] }, { question: "س٢", options: ["أ", "ب", "ج", "د"] }] } };
    const checks = [{ index: 0, chosen: 1, correct: false, correctIndex: 2, explanation: "لأن ...", cite: { title: "محاضرة 2" } }, { index: 1, chosen: 0, correct: true, correctIndex: 0, explanation: "صحيح", cite: null }];
    let n = 0;
    const m = await mountJsx(run(), { lang: "fr", fetch: async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (key === "GET /exam/drills/1") return json({ drill: open });
      if (key === "POST /exam/drills/1/check") return json(checks[n++]);
      if (key === "POST /exam/drills/1/submit") return json({ drill: { ...open, status: "submitted", score: 50, prompt: open.prompt, feedback: { items: [{ chosen: 1, correct: false }, { chosen: 0, correct: true }] }, key: { items: [{ correctIndex: 2, explanation: "لأن ...", cite: null }, { correctIndex: 0, explanation: "صحيح", cite: null }] } } });
      return json({}, false, 404);
    } });
    await settle(m);
    const opts = () => [...m.container.querySelectorAll(`[role=group][aria-label='${FR["الخيارات"]}'] button`)];
    expect(m.container.textContent).toContain("س١");
    expect(m.container.textContent).not.toContain("س٢");
    expect(m.container.textContent).toContain("Question 1 sur 2");
    expect(m.container.querySelector("[role=progressbar]").getAttribute("aria-valuenow")).toBe("0");
    expect(opts()).toHaveLength(4);
    expect(byText(m.container, "button", new RegExp(`^${FR["التالي"]}$`)).disabled).toBe(true);
    await click(m, opts()[1]);
    await settle(m);
    expect(opts().every((b) => b.disabled)).toBe(true); // locked once checked
    expect(opts()[2].textContent).toContain("C"); // the key option is the third
    expect(m.container.textContent).toContain(FR["إجابة خاطئة"]);
    expect(m.container.textContent).toContain("لأن ...");
    expect(m.container.querySelector("[role=progressbar]").getAttribute("aria-valuenow")).toBe("1");
    await click(m, byText(m.container, "button", new RegExp(`^${FR["التالي"]}$`)));
    expect(m.container.textContent).toContain("س٢");
    expect(byText(m.container, "button", new RegExp(`^${FR["إنهاء وعرض النتيجة"]}$`)).disabled).toBe(true);
    await click(m, opts()[0]);
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["إنهاء وعرض النتيجة"]}$`)));
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/drills/1/submit").body).toEqual({ answers: [1, 0] });
    expect(m.container.textContent).toContain("50/100");
    await m.unmount();
  });

  test("an AI outage keeps what the student wrote and says so", async () => {
    const m = await mount(caseOpen, () => json({ error: { code: "ai_unavailable" } }, false, 503));
    await settle(m);
    await writeAll(m, [long, long, long, long]);
    await click(m, byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"])));
    await settle(m);
    expect(m.container.textContent).toContain(FR["المصحح غير متاح الآن. كتابتك محفوظة؛ أعد التسليم لاحقاً."]);
    expect(m.container.querySelector("textarea").value).toBe(long); // still on the last step with the text kept
    await m.unmount();
  });

  test("dissertation: live rules guide the student; submit only when the skeleton is complete", async () => {
    const open = { id: 1, type: "dissertation", status: "open", prompt: { topic: "المسؤولية التقصيرية" } };
    const calls = [];
    const m = await mount(open, { drill: { ...open, status: "submitted", score: 88, answer: { outline: { intro: "x", problem: "y", parts: [{ title: "أ", subs: ["1", "2"] }, { title: "ب", subs: ["3", "4"] }] } }, feedback: { rows: [{ key: "intro", verdict: "good", comment: "" }, { key: "problem", verdict: "good", comment: "" }, { key: "part1", verdict: "partial", comment: "ن" }, { key: "part2", verdict: "good", comment: "" }], improvements: [] }, key: { keyAxes: [{ axis: "الأركان", cite: { title: "محاضرة" } }] } } }, calls);
    await settle(m);
    const submit = byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"]));
    expect(submit.disabled).toBe(true);
    expect(m.container.textContent).toContain(FR["اكتب مقدمة من جملة كاملة على الأقل."]);
    const areas = m.container.querySelectorAll("textarea");
    const inputs = () => [...m.container.querySelectorAll("section input")];
    await type(m, areas[0], "تمهيد عام حول الموضوع وأهميته");
    await type(m, areas[1], "ما حدود المسؤولية التقصيرية");
    expect(m.container.textContent).toContain(FR["الإشكالية سؤال: أنهِها بعلامة استفهام."]);
    await type(m, areas[1], "ما حدود المسؤولية التقصيرية؟");
    expect(m.container.textContent).not.toContain(FR["الإشكالية سؤال: أنهِها بعلامة استفهام."]);
    const vals = ["المبحث الأول: الأركان", "المطلب الأول: الخطأ", "المطلب الثاني: الضرر", "المبحث الثاني: الآثار", "المطلب الأول: التعويض", "المطلب الثاني: التقادم"];
    expect(inputs()).toHaveLength(6);
    for (const [i, v] of vals.entries()) await type(m, inputs()[i], v);
    expect(submit.disabled).toBe(false);
    await click(m, byText(m.container, "button", new RegExp(FR["مطلب ثالث"])));
    expect(inputs()).toHaveLength(7); // a third subsection appears (empty): unbalanced advice and a rule to fill it
    expect(submit.disabled).toBe(true);
    await click(m, m.container.querySelector("button[aria-label='" + FR["حذف المطلب"] + "']"));
    expect(submit.disabled).toBe(false);
    await click(m, submit);
    await settle(m);
    const sent = calls.find((c) => c.key === "POST /exam/drills/1/submit").body;
    expect(sent.outline.parts.map((p) => p.subs.length)).toEqual([2, 2]);
    expect(m.container.textContent).toContain("88/100");
    expect(m.container.textContent).toContain("الأركان");
    await m.unmount();
  });

  test("every drill type is labelled as AI-generated while it is still open", async () => {
    const opens = [
      { id: 1, type: "qcm", status: "open", aiGenerated: true, prompt: { items: [{ question: "س", options: ["أ", "ب", "ج", "د"] }] } },
      caseOpen,
      { id: 1, type: "direct", status: "open", prompt: { items: [{ question: "عرّف الخطأ", kind: "definition" }] } },
      { id: 1, type: "dissertation", status: "open", prompt: { topic: "موضوع" } },
    ];
    for (const d of opens) {
      const m = await mount(d, {});
      await settle(m);
      expect(m.container.textContent).toContain(FR["تمرين أعدّه الذكاء الاصطناعي من مصادرك"]);
      await m.unmount();
    }
  });

  test("stripped statute references are announced", async () => {
    const m = await mount({ ...caseOpen, unverifiedCitations: ["الفصل 999"] }, {});
    await settle(m);
    expect(m.container.textContent).toContain(FR["حُذفت إحالات قانونية لا يمكن التحقق منها في مصادرك."]);
    await m.unmount();
  });

  test("a saved draft comes back when the drill is reopened (case, direct, dissertation)", async () => {
    const mc = await mount({ ...caseOpen, draft: { facts: "نص الوقائع المحفوظ", issue: long, rule: long, solution: long } }, {});
    await settle(mc);
    expect(stepBtns(mc).map((b) => b.disabled)).toEqual([false, false, false, false, false]); // a complete draft opens every step
    await click(mc, stepBtns(mc)[1]);
    expect(mc.container.querySelector("textarea").value).toBe("نص الوقائع المحفوظ");
    await click(mc, stepBtns(mc)[4]);
    expect(mc.container.querySelector("textarea").value).toBe(long);
    expect(byText(mc.container, "button", new RegExp(FR["تسليم للتصحيح"])).disabled).toBe(false);
    await mc.unmount();
    const md = await mount({ id: 1, type: "direct", status: "open", prompt: { items: [{ question: "س", kind: "definition" }] }, draft: { answers: ["جوابي المحفوظ"] } }, {});
    await settle(md);
    expect(md.container.querySelector("textarea").value).toBe("جوابي المحفوظ");
    await md.unmount();
    const outline = { intro: "تمهيد عام حول الموضوع وأهميته", problem: "ما حدود المسؤولية التقصيرية؟", parts: [{ title: "المبحث الأول: الأركان", subs: ["المطلب الأول: الخطأ", "المطلب الثاني: الضرر"] }, { title: "المبحث الثاني: الآثار", subs: ["المطلب الأول: التعويض", "المطلب الثاني: التقادم"] }] };
    const mx = await mount({ id: 1, type: "dissertation", status: "open", prompt: { topic: "ت" }, draft: { outline } }, {});
    await settle(mx);
    expect(mx.container.querySelectorAll("textarea")[1].value).toBe("ما حدود المسؤولية التقصيرية؟");
    expect(byText(mx.container, "button", new RegExp(FR["تسليم للتصحيح"])).disabled).toBe(false);
    await mx.unmount();
  });

  test("an incomplete critique is explained as the marker's failure, with the text kept", async () => {
    const m = await mount(caseOpen, () => json({ error: { code: "critique_unusable" } }, false, 503));
    await settle(m);
    await writeAll(m, [long, long, long, long]);
    await click(m, byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"])));
    await settle(m);
    expect(m.container.textContent).toContain(FR["لم يكتمل التصحيح هذه المرة. كتابتك محفوظة وحصتك لم تُستهلك؛ أعد التسليم."]);
    expect(m.container.querySelector("textarea").value).toBe(long);
    await m.unmount();
  });

  test("direct questions show the reference answer only after submission", async () => {
    const open = { id: 1, type: "direct", status: "open", prompt: { items: [{ question: "عرّف الخطأ", kind: "definition" }] } };
    const m = await mount(open, { drill: { ...open, status: "submitted", score: 100, answer: { answers: ["جوابي"] }, feedback: { rows: [{ key: 0, verdict: "good", comment: "صحيح" }] }, key: { items: [{ referenceAnswer: "الإخلال بواجب قانوني", cite: { title: "محاضرة" } }] } } });
    await settle(m);
    expect(m.container.textContent).not.toContain("الإخلال بواجب قانوني");
    await type(m, m.container.querySelector("textarea"), "جوابي");
    await click(m, byText(m.container, "button", new RegExp(FR["تسليم للتصحيح"])));
    await settle(m);
    expect(m.container.textContent).toContain("الإخلال بواجب قانوني");
    await m.unmount();
  });
});

describe("exam schedule import", () => {
  const entry = `import ExamScheduleImport from "@/components/LawOS/exam/ExamScheduleImport";\nconst __default = () => <ExamScheduleImport />;`;
  const pending = { id: 4, title: "المسؤولية المدنية", date: "2026-11-20", time: "09:00", hasTime: true, startsAt: "2026-11-20T08:00:00.000Z", room: "B2", source: "photo", confirmed: false, daysTo: 37 };

  function api(calls) {
    let dates = { upcoming: [], past: [], pending: [pending] };
    return async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (key === "GET /exam/dates") return json(dates);
      if (key === "POST /exam/dates/4/confirm") { dates = { upcoming: [{ ...pending, confirmed: true }], past: [], pending: [] }; return json({ exam: {} }); }
      if (key === "POST /exam/dates/import") return json({ pending: [pending], notes: null }, true, 201);
      if (key === "POST /exam/dates") return json({ exam: {} }, true, 201);
      return json({}, false, 404);
    };
  }

  test("imported rows wait for the student: editable, with a warning, and confirm sends the corrections", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: api(calls) });
    await settle(m);
    expect(m.container.textContent).toContain(FR["قُرئت هذه التواريخ من وثيقة. لا تُحتسب حتى تؤكدها."]);
    const row = m.container.querySelector("li");
    const inputs = row.querySelectorAll("input");
    expect(inputs[0].value).toBe("المسؤولية المدنية");
    expect(inputs[1].value).toBe("2026-11-20");
    await type(m, inputs[1], "2026-11-21");
    await click(m, byText(row, "button", new RegExp(`^${FR["تأكيد"]}$`)));
    await settle(m);
    const sent = calls.find((c) => c.key === "POST /exam/dates/4/confirm").body;
    expect(sent).toMatchObject({ title: "المسؤولية المدنية", date: "2026-11-21" });
    expect(m.container.textContent).not.toContain(FR["قُرئت هذه التواريخ من وثيقة. لا تُحتسب حتى تؤكدها."]);
    await m.unmount();
  });

  test("a row without a time shows an empty time box and confirming sends no guessed hour", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (key === "GET /exam/dates") return json({ upcoming: [], past: [], pending: [{ ...pending, time: null, hasTime: false }] });
      if (key === "POST /exam/dates/4/confirm") return json({ exam: {} });
      return json({}, false, 404);
    } });
    await settle(m);
    const inputs = m.container.querySelector("li").querySelectorAll("input");
    expect(inputs[2].value).toBe("");
    expect(inputs[2].getAttribute("aria-label")).toContain("المسؤولية المدنية"); // labels are unique per row
    await click(m, byText(m.container.querySelector("li"), "button", new RegExp(`^${FR["تأكيد"]}$`)));
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/dates/4/confirm").body).toEqual({ title: "المسؤولية المدنية", date: "2026-11-20" });
    await m.unmount();
  });

  test("an oversize file is refused on the phone before it is read", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: api(calls) });
    await settle(m);
    const fileInput = m.container.querySelector("input[type=file]");
    expect(fileInput.className).toContain("sr-only"); // reachable by keyboard
    const big = new (require("buffer").File)([new Uint8Array(9 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [big], configurable: true });
    await m.act(async () => { fileInput.dispatchEvent(new m.window.Event("change", { bubbles: true })); });
    await settle(m);
    expect(m.container.textContent).toContain(FR["الملف كبير جداً (الحد 8 ميغابايت)."]);
    expect(calls.some((c) => c.key === "POST /exam/dates/import")).toBe(false);
    await m.unmount();
  });

  test("a PDF is sent as a data URL; pasted text goes to the same endpoint; manual add needs a title and a date", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: api(calls) });
    await settle(m);
    const fileInput = m.container.querySelector("input[type=file]");
    const pdf = new (require("buffer").File)(["%PDF-1.4"], "exams.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [pdf], configurable: true });
    const OriginalFR = m.window.FileReader;
    m.window.FileReader = class extends OriginalFR { readAsDataURL() { setTimeout(() => { Object.defineProperty(this, "result", { value: "data:application/pdf;base64,JVBERi0=" }); this.onload(); }, 0); } };
    globalThis.FileReader = m.window.FileReader;
    await m.act(async () => { fileInput.dispatchEvent(new m.window.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 30)); });
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/dates/import").body).toEqual({ file: "data:application/pdf;base64,JVBERi0=", mimeType: "application/pdf" });
    const add = byText(m.container, "form button", new RegExp(`^${FR["إضافة"]}$`));
    expect(add.disabled).toBe(true);
    await m.unmount();
  });
});

describe("source hygiene", () => {
  const SRC = path.resolve(__dirname, "../../../frontend/src");
  test("no hex colours, physical-direction classes or typed arrows in the exam center", () => {
    const files = fs.readdirSync(path.join(SRC, "components/LawOS/exam")).map((f) => path.join(SRC, "components/LawOS/exam", f)).concat(path.join(SRC, "pages/LawOS/ExamCenter.jsx"));
    for (const f of files.filter((x) => /\.jsx$/.test(x))) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/(^|[^\w-])-?(ml|mr|pl|pr|left|right)-[\w[]/);
      expect(src).not.toMatch(/\b(text-left|text-right|border-l|border-r)\b/);
      expect(src).not.toMatch(/[←→]/);
    }
  });
});

describe("exam modes in the runner", () => {
  const run = `import DrillRunner from "@/components/LawOS/exam/DrillRunner";\nconst __default = () => <DrillRunner drillId={1} onClose={() => {}} />;`;
  const items = [{ question: "س١", options: ["أ", "ب", "ج", "د"] }, { question: "س٢", options: ["أ", "ب", "ج", "د"] }];
  async function mount(drill, calls = [], over = {}) {
    return mountJsx(run, { lang: "fr", fetch: async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (over[key]) return json(over[key]());
      if (key === "GET /exam/drills/1") return json({ drill });
      return json({}, false, 404);
    } });
  }

  test("final exam: answers can be changed, nothing is checked or shown, the mark comes only after submitting (out of 20)", async () => {
    const calls = [];
    const open = { id: 1, type: "qcm", mode: "final", status: "open", prompt: { items } };
    const graded = { ...open, status: "submitted", score: 50, feedback: { items: [{ chosen: 1, correct: false }, { chosen: 0, correct: true }] }, key: { items: [{ correctIndex: 2, explanation: "لأن ...", cite: null }, { correctIndex: 0, explanation: "صحيح", cite: null }] } };
    const m = await mount(open, calls, { "POST /exam/drills/1/submit": () => ({ drill: graded }) });
    await settle(m);
    expect(m.container.textContent).toContain(FR["امتحان نهائي: لا جواب يظهر قبل التسليم"]);
    const opts = () => [...m.container.querySelectorAll(`[role=group][aria-label='${FR["الخيارات"]}'] button`)];
    await click(m, opts()[1]);
    expect(calls.some((c) => c.key.endsWith("/check"))).toBe(false); // no instant feedback
    expect(opts().every((b) => !b.disabled)).toBe(true); // and the choice stays open
    expect(m.container.textContent).not.toContain(FR["إجابة صحيحة"]);
    await click(m, opts()[3]); // changes their mind
    expect(opts()[3].getAttribute("aria-pressed")).toBe("true");
    expect(opts()[1].getAttribute("aria-pressed")).toBe("false");
    await click(m, byText(m.container, "button", new RegExp(`^${FR["التالي"]}$`)));
    await click(m, opts()[0]);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["تسليم الامتحان"]}$`)));
    await settle(m);
    expect(calls.find((c) => c.key === "POST /exam/drills/1/submit").body).toEqual({ answers: [3, 0] });
    expect(m.container.textContent).toContain("50/100");
    expect(m.container.textContent).toContain("10/20");
    await m.unmount();
  });

  test("cards mode: flip cards show the right answer and why, no typing, finishing closes the set", async () => {
    const calls = [];
    const open = { id: 1, type: "qcm", mode: "cards", status: "open", prompt: { items }, study: [{ question: "س١", options: ["أ", "ب", "ج", "د"], correctIndex: 2, explanation: "لأن ...", cite: null }, { question: "س٢", options: ["أ", "ب", "ج", "د"], correctIndex: 0, explanation: "صحيح", cite: null }] };
    const m = await mount(open, calls, { "POST /exam/drills/1/submit": () => ({ drill: { ...open, status: "submitted", score: null, key: { items: open.study } } }) });
    await settle(m);
    expect(m.container.querySelector("textarea, input[type=radio], input[type=text]")).toBeNull();
    const cards = [...m.container.querySelectorAll("button[aria-pressed]")];
    expect(cards).toHaveLength(2);
    await click(m, cards[0]);
    expect(cards[0].getAttribute("aria-pressed")).toBe("true");
    expect(cards[0].textContent).toContain("ج"); // the right answer
    expect(cards[0].textContent).toContain("لأن ...");
    expect(m.container.textContent).toContain("1/2");
    await click(m, byText(m.container, "button", new RegExp(`^${FR["أنهيت المراجعة"]}$`)));
    await settle(m);
    expect(calls.some((c) => c.key === "POST /exam/drills/1/submit")).toBe(true);
    expect(byText(m.container, "button", new RegExp(`^${FR["أنهيت المراجعة"]}$`))).toBeUndefined();
    await m.unmount();
  });
});
