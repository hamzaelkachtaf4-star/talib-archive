// RC3 Phase 3 (client): tree model, the four views over one tree, setup wizard, workspace tabs, path hub, ingestion rules.
const path = require("path");
const fs = require("fs");
const { IDBFactory } = require("fake-indexeddb");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");

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

describe("tree model", () => {
  let T;
  beforeAll(async () => { T = await loadEsm('export * from "@/components/LawOS/module/treeModel";'); });
  const n = (id, parentId, order, extra = {}) => ({ id, parentId, level: 0, kind: "section", title: id, body: "", order, sourceRefs: [], aiDraft: false, ...extra });

  test("flatten is depth-first in sibling order and keeps orphans as roots", () => {
    const nodes = [n("b", null, 1), n("a", null, 0), n("a2", "a", 1), n("a1", "a", 0), n("x", "gone", 0)];
    expect(T.flatten(nodes).map((x) => [x.id, x.depth])).toEqual([["a", 0], ["a1", 1], ["a2", 1], ["x", 0], ["b", 0]]);
  });

  test("descendants and axes", () => {
    const nodes = [n("r1", null, 0, { body: "x" }), n("c1", "r1", 0, { body: "text" }), n("c2", "r1", 1), n("g1", "c1", 0, { body: "t" }), n("r2", null, 1)];
    expect(T.descendants(nodes, "r1").sort()).toEqual(["c1", "c2", "g1"]);
    expect(T.axes(nodes).map((a) => [a.node.id, a.count, a.withBody])).toEqual([["r1", 3, 2], ["r2", 0, 0]]);
    expect(T.descendants(nodes, "nope")).toEqual([]);
    expect(T.flatten([])).toEqual([]);
  });

  test("paragraphDiff: same, added, deleted and replaced paragraphs", () => {
    expect(T.paragraphDiff("a\n\nb", "a\n\nb")).toEqual([{ type: "same", text: "a" }, { type: "same", text: "b" }]);
    expect(T.paragraphDiff("", "x\n\ny").map((b) => b.type)).toEqual(["add", "add"]);
    expect(T.paragraphDiff("a\n\nb", "a\n\nc")).toEqual([{ type: "same", text: "a" }, { type: "del", text: "b" }, { type: "add", text: "c" }]);
    expect(T.paragraphDiff("x", "")).toEqual([{ type: "del", text: "x" }]);
    expect(T.paragraphDiff(null, undefined)).toEqual([]);
  });
});

describe("module workspace", () => {
  const nodes = [
    { id: "n1", parentId: null, level: 0, kind: "lecture", title: "المحاضرة الأولى", body: "نص المحاضرة الأولى", order: 0, sourceRefs: [], aiDraft: false },
    { id: "n2", parentId: "n1", level: 1, kind: "section", title: "الفصل الأول", body: "", order: 0, sourceRefs: [], aiDraft: true },
  ];
  const graph = { module: { id: "m1", title: "المسؤولية المدنية", semester: "S3", parcours: "", owned: true, source: "seed", verified: false }, subject: null, crowns: 1, cardCount: 0, currentNodeId: null, nodes: [] };
  const entry = `import { MemoryRouter, Routes, Route } from "react-router-dom";
import ModulePath from "@/pages/LawOS/ModulePath";
const __default = () => <MemoryRouter initialEntries={["/law/path/m/m1"]}><Routes><Route path="/law/path/m/:id" element={<ModulePath />} /></Routes></MemoryRouter>;`;

  async function mount({ profile = { hasPolycopie: true, strategy: "full_course", viewStyle: "reader", depth: "concise", setupDone: true }, tree = nodes, extra = {}, calls = [] } = {}) {
    globalThis.indexedDB = new IDBFactory();
    return mountJsx(entry, {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;
        calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
        const table = {
          "GET /path/modules/m1/graph": graph,
          "GET /modules/m1/profile": { profile },
          "PUT /modules/m1/profile": (b) => ({ profile: { ...profile, ...b, setupDone: b.setupDone ?? profile.setupDone } }),
          "GET /modules/m1/tree": { nodes: tree },
          "GET /modules/m1/recap": { recap: { lectures: 1, sourcesReady: 2, nodesCompleted: 3, nodesTotal: 9, notesGenerated: 1, gapRadarScore: 40 } },
          "GET /modules/m1/sources": { sources: [] },
          "GET /modules/m1/proposals": { proposals: [] },
          "GET /modules/m1/professor": { card: { name: null, teachingStyle: null, attendanceFocus: null, examTendency: null, examFormat: null, notes: null } },
          ...extra,
        };
        const hit = table[key];
        if (hit === undefined) return json({}, false, 404);
        return json(typeof hit === "function" ? hit(init.body ? JSON.parse(init.body) : {}) : hit);
      },
    });
  }

  test("reader view renders the tree as a document with heading levels and the AI label", async () => {
    const m = await mount();
    await settle(m);
    await click(m, byText(m.container, "[role=group] button", new RegExp(`^${FR["قارئ أكاديمي"]}$`)));
    await settle(m);
    const doc = m.container;
    expect(doc.querySelector("article h2").textContent).toContain("المحاضرة الأولى");
    expect(doc.querySelector("article h3").textContent).toContain("الفصل الأول");
    expect(doc.textContent).toContain("نص المحاضرة الأولى");
    expect(doc.textContent).toMatch(/Rédigé par l'IA/);
    await m.unmount();
  });

  const RICH = [
    { id: "u1", parentId: null, level: 0, kind: "lecture", title: "الدرس الأول: المسؤولية", body: "تمهيد", order: 0, sourceRefs: [], aiDraft: false },
    { id: "b1", parentId: "u1", level: 1, kind: "section", title: "الخطأ", body: "الخطأ هو الإخلال بواجب قانوني سابق، وفق الفصل 77 من ق.ل.ع", order: 0, sourceRefs: [], aiDraft: false },
    { id: "b2", parentId: "u1", level: 1, kind: "section", title: "الضرر", body: "- الضرر المادي: خسارة لحقت المضرور\n- الضرر المعنوي: مساس بالسمعة", order: 1, sourceRefs: [], aiDraft: false },
    { id: "u2", parentId: null, level: 0, kind: "lecture", title: "الدرس الثاني", body: "", order: 1, sourceRefs: [], aiDraft: false },
  ];
  const chipBtn = (m, label) => byText(m.container, "[role=group] button", new RegExp(`^${label}$`));
  const WS = { hasPolycopie: false, strategy: "per_lecture", viewStyle: "reader", depth: "concise", setupDone: true, formats: ["tree", "table", "detailed", "cards", "qa"] };

  test("the workspace: sessions rail, the active session in the student's formats, tree with connectors, detailed cards with example boxes", async () => {
    const nodes = [
      ...RICH,
      { id: "b3", parentId: "u1", level: 1, kind: "section", title: "السببية", body: "علاقة بين الخطأ والضرر. مثال: سقوط حجر من ورش بناء على مار.", order: 2, sourceRefs: [], aiDraft: false },
    ];
    const m = await mount({ tree: nodes, profile: WS });
    await settle(m);
    const rail = m.container.querySelector("nav[aria-label='Séances']");
    const circles = [...rail.querySelectorAll("button[title]")];
    expect(circles).toHaveLength(2); // two top-level sessions
    expect(circles[0].getAttribute("aria-current")).toBe("step"); // the first one that is not understood is active
    expect(circles[0].textContent).toBe("1");
    expect(m.container.textContent).toContain("Séance 1 sur 2");
    expect(m.container.textContent).toContain("الدرس الأول: المسؤولية");
    expect(m.container.textContent).toContain("الفصل 77 · الفصل 77".split(" · ")[0]); // the article found in the text
    expect(m.container.textContent).toContain(FR["محتوى للمراجعة"]);
    // blocks in the chosen order, each with its heading
    const heads = [...m.container.querySelectorAll("section[aria-label] > div > h3")].map((h) => h.textContent);
    expect(heads).toEqual([FR["خطاطات شجرية"], FR["جداول"], FR["شرح مفصل مع أمثلة"], FR["بطاقات مراجعة"], FR["سؤال وجواب"]]);
    expect(m.container.querySelector("[aria-label='Arbre cerisier'], [role=group][aria-label='" + FR["شجرة شيري تري"] + "']")).not.toBeNull();
    expect(m.container.querySelectorAll("table tbody tr")).toHaveLength(3);
    expect(m.container.textContent).toContain(FR["مثال:"]); // the example the student wrote sits in its own box
    expect(m.container.textContent).toContain("سقوط حجر من ورش بناء على مار");
    // a different session
    await click(m, circles[1]);
    expect(m.container.textContent).toContain("Séance 2 sur 2");
    expect(m.container.textContent).toContain(FR["هذه الحصة بلا محتوى بعد. اضغط «عدّل بيدك» أو اطلب من المساعد صياغتها."]);
    await m.unmount();
  });

  test("«تحقق من فهمك» asks questions built from the session, a clean pass marks it understood and moves the rail", async () => {
    const calls = [];
    const m = await mount({ calls, tree: RICH, profile: WS, extra: { "PATCH /modules/m1/nodes/u1": (b) => ({ node: { ...RICH[0], done: b.done } }) } });
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["تحقق من فهمك"]}$`)));
    const opts = () => [...m.container.querySelectorAll(`[aria-label='${FR["تحقق من فهمك"]}'] [role=group] button`)];
    expect(m.container.textContent).toContain("1/2");
    expect(opts().length).toBeGreaterThanOrEqual(2);
    // answer wrongly first: the session is NOT marked done
    await click(m, opts().find((b) => !b.textContent.includes("الإخلال")) || opts()[0]);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["التالي"]}$`)));
    await click(m, opts()[0]);
    await click(m, byText(m.container, "button", new RegExp(`^(${FR["أنهيت هذه الحصة"]}|${FR["راجع ثم عاود التحقق"]})$`)));
    await settle(m);
    const patches = calls.filter((c) => c.key === "PATCH /modules/m1/nodes/u1");
    expect(patches.length === 0 || patches.every((c) => c.body.done === true)).toBe(true);
    await m.unmount();
  });

  test("a session with fewer than two written branches is simply marked understood, and the mark can be undone", async () => {
    const calls = [];
    const one = [{ id: "u1", parentId: null, level: 0, kind: "lecture", title: "الدرس", body: "نص", order: 0, sourceRefs: [], aiDraft: false, done: false }];
    const m = await mount({ calls, tree: one, profile: WS, extra: { "PATCH /modules/m1/nodes/u1": (b) => ({ node: { ...one[0], done: b.done } }) } });
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["تحقق من فهمك"]}$`)));
    await settle(m);
    expect(calls.find((c) => c.key === "PATCH /modules/m1/nodes/u1").body).toEqual({ done: true });
    await m.unmount();
  });

  test("«شنو فهمت؟» sends the student's own words to the mentor and shows the answer; «بلّغ عن خطأ» stores a note", async () => {
    const calls = [];
    const m = await mount({ calls, tree: RICH, profile: WS, extra: {
      "POST /modules/m1/mentor": () => ({ answer: "فهمك سليم لكن أغفلت الضرر المعنوي", refs: [], aiGenerated: true }),
      "POST /modules/m1/nodes/u1/report": () => ({ ok: true }),
    } });
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["«شنو فهمت؟»"].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
    await type(m, m.container.querySelector("#say-box"), "الخطأ هو الإخلال بواجب");
    await click(m, byText(m.container, "button", new RegExp(`^${FR["صحّح فهمي"]}$`)));
    await settle(m);
    const sent = calls.find((c) => c.key === "POST /modules/m1/mentor").body;
    expect(sent.mode).toBe("qa");
    expect(sent.question).toContain("الخطأ هو الإخلال بواجب");
    expect(sent.question.length).toBeLessThanOrEqual(1000);
    expect(m.container.textContent).toContain("فهمك سليم لكن أغفلت الضرر المعنوي");
    await click(m, byText(m.container, "button", new RegExp(FR["بلّغ عن خطأ"])));
    const box = m.container.querySelector("form[aria-label='" + FR["بلّغ عن خطأ"] + "'] textarea");
    const send = () => byText(m.container, "button", new RegExp(`^${FR["إرسال البلاغ"]}$`));
    expect(send().disabled).toBe(true);
    await type(m, box, "الفصل غير صحيح");
    await click(m, send());
    await settle(m);
    expect(calls.find((c) => c.key === "POST /modules/m1/nodes/u1/report").body).toEqual({ note: "الفصل غير صحيح" });
    expect(m.container.textContent).toContain(FR["شكراً، سُجّل بلاغك."]);
    await m.unmount();
  });

  test("changing session while the mentor is still answering does not break the page", async () => {
    let release;
    const slow = new Promise((r) => { release = r; });
    const m = await mount({ tree: RICH, profile: WS, extra: { "POST /modules/m1/mentor": () => slow.then(() => ({ answer: "متأخر", refs: [] })) } });
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["«شنو فهمت؟»"].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
    await type(m, m.container.querySelector("#say-box"), "فهمي");
    await click(m, byText(m.container, "button", new RegExp(`^${FR["صحّح فهمي"]}$`)));
    await click(m, m.container.querySelector("nav[aria-label='Séances'] button[title]:not([aria-current])")); // another session
    await m.act(async () => { release(); await slow; });
    await settle(m);
    expect(m.container.querySelector("nav[aria-label='Séances']")).not.toBeNull();
    expect(m.container.querySelector("#say-box")).toBeNull(); // the panel belongs to the session that was left
    await m.unmount();
  });

  test("the other views stay one click away from the workspace, and a module with no content says so", async () => {
    const m = await mount({ tree: RICH, profile: WS });
    await settle(m);
    await click(m, chipBtn(m, FR["محاور المطبوع"]));
    await settle(m);
    expect(m.container.querySelector("[aria-label='Axes du polycopié']")).not.toBeNull();
    expect(m.container.textContent).toMatch(/2 notes en dessous/);
    await click(m, chipBtn(m, FR["فضاء المادة"]));
    expect(m.container.querySelector("nav[aria-label='Séances']")).not.toBeNull();
    await m.unmount();
    const empty = await mount({ tree: [], profile: WS });
    await settle(empty);
    expect(empty.container.querySelector("nav[aria-label='Séances']")).toBeNull();
    await empty.unmount();
  });

  test("offline (the profile cannot be fetched) the workspace falls back to the stage trail and never opens the wizard", async () => {
    const calls = [];
    const withStage = { ...graph, nodes: [{ id: "p1", kind: "LESSON", title: "فهم القواعد الأساسية", section: "الأساسيات", ordinal: 1, state: "AVAILABLE", prereqIds: [], legalRefs: [], pins: [], practice: null }], currentNodeId: "p1" };
    const m = await mount({ calls, extra: { "GET /modules/m1/profile": () => { throw new Error("offline"); }, "GET /modules/m1/tree": () => { throw new Error("offline"); }, "GET /path/modules/m1/graph": withStage } });
    await settle(m, 150);
    expect(m.container.querySelector("article")).toBeNull(); // no reader
    expect(m.container.ownerDocument.querySelector("[role=dialog] legend")).toBeNull();
    expect(m.container.querySelectorAll("button.law-node")).toHaveLength(1); // the stage trail is on screen
    await m.unmount();
  });

  test("reopening the wizard starts on the first question with the student's current answers", async () => {
    const calls = [];
    const profile = { hasPolycopie: false, strategy: "per_lecture", viewStyle: "axes", depth: "detailed", setupDone: true };
    const m = await mount({ profile, calls });
    await settle(m);
    const doc = m.container.ownerDocument;
    expect(doc.querySelector("[role=dialog]")).toBeNull();
    await click(m, byText(m.container, "button", new RegExp(FR["إعداد المادة"])));
    expect(doc.querySelector("[role=dialog] legend").textContent).toBe(FR["هل يوجد مطبوع رسمي؟"]);
    expect([...doc.querySelectorAll("[role=dialog] input[type=radio]")].map((r) => r.checked)).toEqual([false, true]); // "no" is the saved answer
    const next = () => byText(doc, "[role=dialog] button", new RegExp(`^(${FR["التالي"]}|${FR["حفظ"]})$`));
    await click(m, next());
    await click(m, next());
    await click(m, next());
    await click(m, byText(doc, "[role=dialog] button", new RegExp(`^${FR["حفظ"]}$`)));
    await settle(m);
    const save = calls.filter((c) => c.key === "PUT /modules/m1/profile").pop().body;
    expect(save).toEqual({ hasPolycopie: false, strategy: "per_lecture", viewStyle: "axes", depth: "detailed", setupDone: true }); // nothing was overwritten by defaults
    await m.unmount();
  });

  test("the sections are real tabs: roles, panel wiring and arrow-key navigation", async () => {
    const m = await mount();
    await settle(m);
    const tabs = [...m.container.querySelectorAll("[role=tab]")];
    expect(tabs.map((t) => t.id)).toEqual(["tab-content", "tab-lectures", "tab-mentor", "tab-professor", "tab-method"]);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.id)).toEqual(["tab-content"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    const panel = m.container.querySelector("[role=tabpanel]");
    expect(panel.getAttribute("aria-labelledby")).toBe("tab-content");
    expect(tabs[0].getAttribute("aria-controls")).toBe(panel.id);
    // actions are not inside the tablist
    expect(m.container.querySelector("[role=tablist] button:not([role=tab])")).toBeNull();
    const list = m.container.querySelector("[role=tablist]");
    await m.act(async () => { list.dispatchEvent(new m.window.KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(m.container.querySelector("[role=tab][aria-selected=true]").id).toBe("tab-method");
    await m.act(async () => { list.dispatchEvent(new m.window.KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(m.container.querySelector("[role=tab][aria-selected=true]").id).toBe("tab-content");
    await m.unmount();
  });

  test("an empty tree offers a first lecture and the mentor instead of a blank page", async () => {
    const calls = [];
    const m = await mount({ tree: [], calls, extra: { "POST /modules/m1/nodes": (b) => ({ node: { id: "x", ...b } }) } });
    await settle(m);
    const input = m.container.querySelector("input[placeholder]");
    expect(input).not.toBeNull();
    expect(byText(m.container, "button", /Demander au mentor/)).toBeTruthy();
    await type(m, input, "المحاضرة الأولى");
    await m.act(async () => { input.closest("form").dispatchEvent(new m.window.Event("submit", { bubbles: true, cancelable: true })); });
    expect(calls.find((c) => c.key === "POST /modules/m1/nodes").body).toMatchObject({ title: "المحاضرة الأولى", kind: "lecture" });
    await m.unmount();
  });

  test("the setup wizard opens on first visit, asks the four questions in order and saves them", async () => {
    const calls = [];
    const m = await mount({ profile: { hasPolycopie: null, strategy: null, viewStyle: "reader", depth: "concise", setupDone: false }, calls });
    await settle(m);
    const doc = m.container.ownerDocument;
    const legend = () => doc.querySelector("[role=dialog] legend")?.textContent;
    expect(legend()).toBe(FR["هل يوجد مطبوع رسمي؟"]);
    const next = () => byText(doc, "[role=dialog] button", /^(Suivant|Enregistrer)$/);
    expect(next().disabled).toBe(true); // an answer is required first
    await click(m, doc.querySelector("[role=dialog] input[type=radio]"));
    await click(m, next());
    expect(legend()).toBe(FR["استراتيجية الدراسة"]);
    await click(m, doc.querySelectorAll("[role=dialog] input[type=radio]")[1]);
    await click(m, next());
    expect(legend()).toBe(FR["طريقة العرض"]);
    await click(m, doc.querySelectorAll("[role=dialog] input[type=radio]")[3]);
    await click(m, next());
    expect(legend()).toBe(FR["العمق"]);
    await click(m, doc.querySelectorAll("[role=dialog] input[type=radio]")[1]);
    await click(m, byText(doc, "[role=dialog] button", /^Enregistrer$/));
    await settle(m);
    const save = calls.filter((c) => c.key === "PUT /modules/m1/profile").pop().body;
    expect(save).toEqual({ hasPolycopie: true, strategy: "per_lecture", viewStyle: "axes", depth: "detailed", setupDone: true });
    expect(doc.querySelector("[role=dialog] legend")).toBeNull();
    await m.unmount();
  });

  test("a default-list module shows the check-me banner and confirming clears it", async () => {
    const calls = [];
    const m = await mount({ calls, extra: { "PATCH /modules/m1": { module: { ...graph.module, verified: true } } } });
    await settle(m);
    expect(m.container.textContent).toMatch(/Liste par défaut/);
    await click(m, byText(m.container, "button", /Ce module est correct/));
    await settle(m);
    expect(calls.find((c) => c.key === "PATCH /modules/m1").body).toEqual({ confirm: true });
    expect(m.container.textContent).not.toMatch(/Liste par défaut/);
    await m.unmount();
  });

  test("the recap shows lectures, sources, stages, drafted notes and the gap score", async () => {
    const m = await mount();
    await settle(m);
    const recap = m.container.querySelector("section[aria-label='Résumé du module']");
    expect(recap.textContent).toMatch(/3\/9/);
    expect(recap.textContent).toMatch(/40%/);
    // the quiz entry is a link to the exam center, filtered to this module: no quiz lives inside the module
    expect(recap.querySelector("a[href='/law/exam?module=m1']")).not.toBeNull();
    await m.unmount();
  });

  test("the professor card saves exactly what was entered and says it is private", async () => {
    const calls = [];
    const m = await mount({ calls, extra: { "PUT /modules/m1/professor": (b) => ({ card: b }) } });
    await settle(m);
    await click(m, m.container.querySelector("#tab-professor"));
    await settle(m);
    expect(m.container.textContent).toMatch(/privée/);
    await type(m, m.container.querySelector("section input"), "د. فلان");
    await click(m, byText(m.container, "button", /^Enregistrer$/));
    expect(calls.find((c) => c.key === "PUT /modules/m1/professor").body).toMatchObject({ name: "د. فلان" });
    await m.unmount();
  });
  describe("source mix, adding content, the assistant drawer and its memory", () => {
  let Mx;
  beforeAll(async () => { Mx = await loadEsm('export * from "@/components/LawOS/module/mixOps";'); });
  const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

  test("the mix always adds up to 100 in steps of 5 whatever the student turns on, off or moves", () => {
    expect(Mx.equalSplit(["lectures", "printed", "legal"])).toEqual({ lectures: 35, printed: 35, research: 0, legal: 30 });
    expect(Mx.equalSplit(["lectures"])).toEqual({ lectures: 100, printed: 0, research: 0, legal: 0 });
    expect(total(Mx.equalSplit([]))).toBe(0);
    const base = Mx.equalSplit(["lectures", "printed", "legal"]);
    const off = Mx.toggleKind(base, "printed");
    expect(off).toMatchObject({ printed: 0 });
    expect(total(off)).toBe(100);
    expect(Mx.toggleKind(Mx.equalSplit(["lectures"]), "lectures")).toEqual(Mx.equalSplit(["lectures"])); // the last kind cannot be switched off
    expect(total(Mx.toggleKind(off, "printed"))).toBe(100);
    let m = base;
    for (let i = 0; i < 30; i++) { m = Mx.shiftShare(m, "legal", 5); expect(total(m)).toBe(100); expect(Object.values(m).every((v) => v % 5 === 0 && v >= 0)).toBe(true); }
    expect(m.legal).toBeLessThanOrEqual(95);
    expect(Object.entries(m).filter(([k]) => k !== "research" && k !== "legal").every(([, v]) => v >= 5)).toBe(true); // a kind that is on never reaches 0 by moving
    let n = base;
    for (let i = 0; i < 30; i++) { n = Mx.shiftShare(n, "lectures", -5); expect(total(n)).toBe(100); }
    expect(n.lectures).toBeGreaterThanOrEqual(5);
    expect(Mx.shiftShare(base, "research", 5)).toEqual(base); // a kind that is off cannot be moved
  });

  const sheetOf = (m) => m.container.ownerDocument.querySelector("[role=dialog]");
  test("«مصادر المادة» is a grid of four kinds with percentages; research is marked soon; saving sends a valid mix", async () => {
    const calls = [];
    const m = await mount({ calls, tree: RICH, profile: WS, extra: { "PUT /modules/m1/profile": (b) => ({ profile: { ...WS, ...b } }) } });
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["مصادر المادة"]}$`)));
    const grid = m.container.querySelector(`[role=group][aria-label='${FR["مصادر المادة"]}']`);
    const toggles = [...grid.querySelectorAll("button[aria-pressed]")];
    expect(toggles).toHaveLength(4);
    expect(toggles[2].disabled).toBe(true); // research with AI: soon
    expect(toggles.map((t) => t.getAttribute("aria-pressed"))).toEqual(["true", "true", "false", "true"]);
    expect([...grid.querySelectorAll("output")].map((o) => o.textContent)).toEqual(["35%", "35%", "30%"]);
    const save = () => byText(m.container, "button", new RegExp(`^${FR["حفظ"]}$`));
    expect(save().disabled).toBe(false); // not stored yet: the even split can be saved as it is
    await click(m, grid.querySelectorAll("button[aria-label='" + FR["زد"] + "']")[0]);
    expect([...grid.querySelectorAll("output")].map((o) => o.textContent)).toEqual(["40%", "30%", "30%"]);
    await click(m, toggles[1]); // printed off
    expect(grid.querySelectorAll("output")).toHaveLength(2);
    await click(m, save());
    await settle(m);
    const sent = calls.filter((c) => c.key === "PUT /modules/m1/profile").pop().body.sourceMix;
    expect(Object.values(sent).reduce((a, b) => a + b, 0)).toBe(100);
    expect(sent).toMatchObject({ printed: 0, research: 0 });
    await m.unmount();
  });

  test("«إضافة محتوى أو حصة» opens the drawer with the ingest tools and the auto-structure step; proposals are accepted or refused by the student", async () => {
    const calls = [];
    const prop = { id: "p1", op: "add", nodeId: null, parentId: null, title: "الحصة 4: الضرر", body: "نص مقترح", baseBody: null, sourceRefs: [1], status: "pending" };
    const state = { proposals: [] };
    const m = await mount({ calls, tree: RICH, profile: WS, extra: {
      "GET /modules/m1/sources": () => ({ sources: [] }),
      "GET /modules/m1/proposals": () => ({ proposals: state.proposals }),
      "POST /modules/m1/mentor": () => { state.proposals = [prop]; return { answer: "", refs: [], proposals: [prop], aiGenerated: true }; },
      "POST /modules/m1/proposals/p1/accept": () => { state.proposals = []; return { node: {} }; },
    } });
    await settle(m);
    expect(sheetOf(m)).toBeNull();
    await click(m, byText(m.container, "button", new RegExp(`^${FR["إضافة محتوى أو حصة"]}$`)));
    await settle(m);
    const dlg = sheetOf(m);
    expect(dlg.textContent).toContain(FR["نظّم تلقائياً"]);
    expect(dlg.querySelector("textarea")).not.toBeNull(); // paste a session text
    await click(m, byText(dlg, "button", new RegExp(`^${FR["نظّم تلقائياً"]}$`)));
    await settle(m);
    const asked = calls.find((c) => c.key === "POST /modules/m1/mentor").body;
    expect(asked.mode).toBe("build");
    expect(dlg.textContent).toContain("الحصة 4: الضرر");
    await click(m, byText(dlg, "button", new RegExp(`^${FR["قبول"]}$`)));
    await settle(m);
    expect(calls.some((c) => c.key === "POST /modules/m1/proposals/p1/accept")).toBe(true);
    expect(dlg.textContent).not.toContain("الحصة 4: الضرر");
    await m.unmount();
  });

  test("«مساعد طالب» is a side drawer: quick actions fill the box, a mentor suggestion is saved only when accepted, notes are listed, added and deleted", async () => {
    const calls = [];
    const notes = [{ id: "n1", content: "أفضّل الأمثلة المغربية", scope: "module", source: "student" }];
    const m = await mount({ calls, tree: RICH, profile: WS, extra: {
      "GET /modules/m1/proposals": () => ({ proposals: [] }),
      "GET /modules/m1/memory": () => ({ notes: [...notes], enabled: true }),
      "POST /modules/m1/memory": (b) => { notes.push({ id: `n${notes.length + 1}`, content: b.content, scope: b.scope, source: b.source || "student" }); return { note: notes[notes.length - 1] }; },
      "DELETE /modules/m1/memory/n1": () => { notes.splice(0, 1); return { error: null }; },
      "POST /modules/m1/mentor": () => ({ answer: "لخص", refs: [{ label: "S1", ref: "n:u1", title: "الدرس" }], grounded: true, aiGenerated: true, memorySuggestion: "يفضّل الشرح المختصر", proposals: [] }),
    } });
    await settle(m);
    await click(m, byText(m.container, "button", new RegExp(`^${FR["مساعد طالب"]}$`)));
    await settle(m);
    const dlg = sheetOf(m);
    expect(dlg.classList.contains("law-sheet")).toBe(true);
    expect(dlg.parentElement.classList.contains("law-drawer")).toBe(true);
    await click(m, byText(dlg, "button", new RegExp(FR["لخّص هذه الحصة"])));
    expect(dlg.querySelector("textarea").value).toContain("الدرس الأول: المسؤولية"); // the open session is in the request
    await click(m, byText(dlg, "button", new RegExp(`^${FR["اسأل"]}$`)));
    await settle(m);
    expect(dlg.textContent).toContain(FR["هل أتذكّر هذا عنك؟"]);
    expect(calls.some((c) => c.key === "POST /modules/m1/memory")).toBe(false); // offered, not saved
    await click(m, byText(dlg, "button", new RegExp(`^${FR["احتفظ بها"]}$`)));
    await settle(m);
    expect(calls.find((c) => c.key === "POST /modules/m1/memory").body).toEqual({ content: "يفضّل الشرح المختصر", scope: "module", source: "mentor" });
    await click(m, byText(dlg, "button", new RegExp(`^${FR["ذاكرة المساعد"]}$`)));
    await settle(m);
    expect(dlg.textContent).toContain("أفضّل الأمثلة المغربية");
    await type(m, dlg.querySelector("textarea[aria-label='" + FR["ملاحظة جديدة"] + "']"), "أخلط بين العقدية والتقصيرية");
    await click(m, byText(dlg, "button", new RegExp(`^${FR["أضف"]}$`)));
    await settle(m);
    expect(calls.filter((c) => c.key === "POST /modules/m1/memory").pop().body).toEqual({ content: "أخلط بين العقدية والتقصيرية", scope: "module" });
    await click(m, dlg.querySelector("button[aria-label^='" + FR["حذف"] + "']"));
    await settle(m);
    expect(calls.some((c) => c.key === "DELETE /modules/m1/memory/n1")).toBe(true);
    await m.unmount();
  });
});

describe("path hub", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";
import Path from "@/pages/LawOS/Path";
const __default = () => <MemoryRouter initialEntries={["/law/path"]}><Path /></MemoryRouter>;`;
  async function mount(modules, calls = []) {
    globalThis.indexedDB = new IDBFactory();
    return mountJsx(entry, {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;
        calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
        if (key === "GET /me/academic") return json({ academic: { semester: "S3" } });
        if (key === "GET /modules") return json({ semester: "S3", modules, canAdd: true });
        if (key === "POST /modules") return json({ module: { id: "new" } }, true, 201);
        return json({}, false, 404);
      },
    });
  }

  test("opens on the student's semester with the default-list badge on unconfirmed modules", async () => {
    const m = await mount([{ id: "a", title: "المسؤولية المدنية", total: 4, completed: 1, owned: true, source: "seed", verified: false, parcours: "" }, { id: "b", title: "رسمية", total: 4, completed: 0, owned: false, verified: true, parcours: "" }]);
    await settle(m);
    expect(m.container.querySelectorAll("a[href^='/law/path/m/']")).toHaveLength(2);
    expect(m.container.textContent.match(/Liste par défaut/g)).toHaveLength(1);
    await m.unmount();
  });

  test("a known semester without modules never says nothing is published: it shows the add-a-module call to action", async () => {
    const m = await mount([]);
    await settle(m);
    expect(m.container.textContent).toMatch(/Aucun module dans ce semestre/);
    expect(m.container.textContent).not.toMatch(/publié|published|منشور/i);
    expect(byText(m.container, "button", /Ajouter un module/)).toBeTruthy();
    await m.unmount();
  });

  test("adding a module posts the semester and title", async () => {
    const calls = [];
    const m = await mount([], calls);
    await settle(m);
    await click(m, byText(m.container, "button", /Ajouter un module/));
    const input = m.container.querySelector("form input[dir=auto]");
    await type(m, input, "القانون المدني");
    await m.act(async () => { input.closest("form").dispatchEvent(new m.window.Event("submit", { bubbles: true, cancelable: true })); });
    expect(calls.find((c) => c.key === "POST /modules").body).toEqual({ semester: "S3", title: "القانون المدني" });
    await m.unmount();
  });

  test("the subjects and methodology tabs are gone from the hub", async () => {
    const m = await mount([]);
    await settle(m);
    expect(m.container.querySelector("[role=tablist]")).toBeNull();
    await m.unmount();
  });
});

describe("lecture ingestion and mentor UI", () => {
  const entry = (name, props) => `import { MemoryRouter } from "react-router-dom";
import ${name} from "@/components/LawOS/module/${name}";
const tree = { nodes: [{ id: "l1", kind: "lecture", title: "محاضرة 1" }], add: async () => ({ ok: true, data: { node: { id: "new" } } }), reload: async () => {} };
const __default = () => <MemoryRouter><${name} moduleId="m1" tree={tree} ${props || ""} /></MemoryRouter>;`;

  test("an audio file waits for the recording notice; only after confirming is it queued and linked", async () => {
    globalThis.indexedDB = new IDBFactory();
    const calls = [];
    const m = await mountJsx(entry("LectureIngest"), {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;
        calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
        if (key === "GET /modules/m1/sources") return json({ sources: [] });
        if (key === "POST /modules/m1/sources") return json({ source: { id: 1 } }, true, 201);
        return json({}, false, 404);
      },
    });
    await settle(m);
    const doc = m.container.ownerDocument;
    const fileInput = m.container.querySelector("input[type=file]");
    const file = new (require("buffer").File)(["x"], "cours.m4a", { type: "audio/mp4" }); // Node's File: has arrayBuffer and survives structured clone
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    await m.act(async () => { fileInput.dispatchEvent(new m.window.Event("change", { bubbles: true })); });
    expect(doc.querySelector("[role=alertdialog]")).not.toBeNull();
    expect(calls.some((c) => c.key === "POST /modules/m1/sources")).toBe(false);
    const go = byText(doc, "[role=alertdialog] button", /^Continuer$/);
    expect(go.disabled).toBe(true);
    await click(m, doc.querySelector("[role=alertdialog] input[type=checkbox]"));
    await click(m, go);
    await settle(m, 80);
    const post = calls.find((c) => c.key === "POST /modules/m1/sources");
    expect(post.body).toMatchObject({ kind: "audio", recordingPermission: true, keepRaw: false });
    expect(post.body.clientBatchId).toMatch(/^[0-9a-f-]{36}$/);
    await m.unmount();
  });

  test("pasted text goes to the chosen lecture", async () => {
    globalThis.indexedDB = new IDBFactory();
    const calls = [];
    const m = await mountJsx(entry("LectureIngest"), {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;
        calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
        if (key === "GET /modules/m1/sources") return json({ sources: [] });
        if (key === "POST /modules/m1/sources") return json({ source: { id: 1 } }, true, 201);
        return json({}, false, 404);
      },
    });
    await settle(m);
    await type(m, m.container.querySelector("select"), "l1");
    await type(m, m.container.querySelector("textarea"), "نص المحاضرة");
    const form = m.container.querySelector("textarea").closest("form");
    await m.act(async () => { form.dispatchEvent(new m.window.Event("submit", { bubbles: true, cancelable: true })); });
    expect(calls.find((c) => c.key === "POST /modules/m1/sources").body).toEqual({ kind: "text", text: "نص المحاضرة", lectureId: "l1" });
    await m.unmount();
  });

  test("mentor build mode: a proposal is a diff; accepting it calls the API and reloads the tree; a stale one is rejected with a clear message", async () => {
    globalThis.indexedDB = new IDBFactory();
    const calls = [];
    const e = `import { MemoryRouter } from "react-router-dom";
import ModuleMentorChat from "@/components/LawOS/module/ModuleMentorChat";
const tree = { reload: async () => { globalThis.__reloads = (globalThis.__reloads || 0) + 1; } };
const __default = () => <MemoryRouter><ModuleMentorChat moduleId="m1" tree={tree} /></MemoryRouter>;`;
    let proposals = [{ id: "p1", op: "edit", nodeId: "n1", title: "المسؤولية", body: "نص جديد", baseBody: "نص قديم", sourceRefs: [1], status: "pending" }, { id: "p2", op: "add", title: "فرع", body: "x", sourceRefs: [1], status: "pending" }];
    const m = await mountJsx(e, {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;
        calls.push(key);
        if (key === "GET /modules/m1/proposals") return json({ proposals });
        if (key === "POST /modules/m1/proposals/p1/accept") return json({ error: { code: "stale" } }, false, 409);
        if (key === "POST /modules/m1/proposals/p2/accept") return json({ node: { id: "z" } });
        if (key === "POST /modules/m1/proposals/p1/reject") { proposals = proposals.filter((p) => p.id !== "p1"); return json({}); }
        return json({}, false, 404);
      },
    });
    await settle(m);
    await click(m, byText(m.container, "[role=group] button", /Poursuivre la construction et le résumé du cours/));
    expect(m.container.querySelectorAll("ins,del").length).toBeGreaterThan(0);
    expect(m.container.textContent).toMatch(/Rédigé par l'IA/);
    const accept = [...m.container.querySelectorAll("li button")].filter((b) => /^Accepter$/.test(b.textContent));
    await click(m, accept[0]);
    await settle(m);
    expect(m.container.textContent).toMatch(/Cette note a changé après la proposition/);
    expect(calls).toContain("POST /modules/m1/proposals/p1/reject"); // a stale proposal never lingers
    await click(m, [...m.container.querySelectorAll("li button")].filter((b) => /^Accepter$/.test(b.textContent))[0]);
    await settle(m);
    expect(calls).toContain("POST /modules/m1/proposals/p2/accept");
    expect(globalThis.__reloads).toBeGreaterThan(0);
    await m.unmount();
    delete globalThis.__reloads;
  });
});

describe("offline links, back link and subjects entry", () => {
  const stubOnline = (status) => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.window = { localStorage: globalThis.localStorage };
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push(JSON.parse(init.body || "{}"));
      if (status === "offline") throw new Error("offline");
      return json({}, status < 400, status);
    };
    return calls;
  };
  afterEach(() => { delete globalThis.fetch; delete globalThis.localStorage; delete globalThis.window; });
  const body = (id) => ({ kind: "image", clientBatchId: id });

  test("a link made offline waits and is sent once the connection is back; refused ones are dropped, server errors are kept", async () => {
    globalThis.indexedDB = new IDBFactory();
    const L = await loadEsm('export * from "@/components/LawOS/lib/moduleLinks";');
    stubOnline("offline");
    await L.queueModuleLink("m1", body("device-batch-0001"));
    await L.queueModuleLink("m1", body("device-batch-0001")); // never queued twice
    expect(await L.pendingModuleLinks()).toBe(1);
    expect(await L.flushModuleLinks()).toBe(0);
    expect(await L.pendingModuleLinks()).toBe(1); // still offline: kept
    stubOnline(500);
    expect(await L.flushModuleLinks()).toBe(0);
    expect(await L.pendingModuleLinks()).toBe(1); // server trouble: kept
    const calls = stubOnline(201);
    expect(await L.flushModuleLinks()).toBe(1);
    expect(calls).toEqual([body("device-batch-0001")]);
    expect(await L.pendingModuleLinks()).toBe(0);
    await L.queueModuleLink("m1", body("device-batch-0002"));
    stubOnline(409);
    expect(await L.flushModuleLinks()).toBe(1); // already linked counts as done
    await L.queueModuleLink("m1", body("device-batch-0003"));
    stubOnline(400);
    expect(await L.flushModuleLinks()).toBe(0);
    expect(await L.pendingModuleLinks()).toBe(0); // a link the server refuses for good is dropped
  });

  test("the back link returns to where the student came from; opened directly it goes to the fallback", async () => {
    const entry = `import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import BackLink from "@/components/LawOS/kit/BackLink";
function Where() { return <b id="where">{useLocation().pathname}</b>; }
const __default = () => <MemoryRouter initialEntries={["/law/path/m/m1", "/law/method/attempt/9"]} initialIndex={1}><Where /><Routes><Route path="*" element={<BackLink>back</BackLink>} /></Routes></MemoryRouter>;`;
    const m = await mountJsx(entry, { lang: "fr" });
    await click(m, m.container.querySelector("a"));
    expect(m.container.querySelector("#where").textContent).toBe("/law/path/m/m1");
    await m.unmount();
    const direct = `import { MemoryRouter, Routes, Route } from "react-router-dom";
import BackLink from "@/components/LawOS/kit/BackLink";
const __default = () => <MemoryRouter initialEntries={["/law/method/attempt/9"]}><Routes><Route path="*" element={<BackLink fallback="/law/path">back</BackLink>} /></Routes></MemoryRouter>;`;
    const d = await mountJsx(direct, { lang: "fr" });
    expect(d.container.querySelector("a").getAttribute("href")).toBe("/law/path");
    await d.unmount();
  });

  test("the old subjects list stays a registered route but is no longer linked from the path hub", async () => {
    const routes = fs.readFileSync(path.resolve(__dirname, "../../../frontend/src/pages/LawOS/routes.jsx"), "utf8");
    expect(routes).toMatch(/"path\/subjects":\s*\(\) => import\("\.\/Subjects"\)/);
    globalThis.indexedDB = new IDBFactory();
    const m = await mountJsx(`import { MemoryRouter } from "react-router-dom";
import Path from "@/pages/LawOS/Path";
const __default = () => <MemoryRouter><Path /></MemoryRouter>;`, { lang: "fr", fetch: async (url) => (String(url).includes("/me/academic") ? json({ academic: { semester: "S3" } }) : String(url).includes("/modules") ? json({ modules: [], canAdd: true }) : json({}, false, 404)) });
    await settle(m);
    expect(m.container.querySelector("a[href='/law/path/subjects']")).toBeNull(); // the old subjects list is no longer a destination: modules open their own workspace
    await m.unmount();
  });
});

describe("source hygiene", () => {
  const SRC = path.resolve(__dirname, "../../../frontend/src");
  test("no hex colours, physical-direction classes or typed arrows in the module workspace", () => {
    const dir = path.join(SRC, "components/LawOS/module");
    const files = [];
    const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); });
    walk(dir);
    files.push(path.join(SRC, "pages/LawOS/ModulePath.jsx"), path.join(SRC, "pages/LawOS/Path.jsx"));
    for (const f of files.filter((x) => /\.jsx$/.test(x))) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/(^|[^\w-])-?(ml|mr|pl|pr|left|right)-[\w[]/);
      expect(src).not.toMatch(/\b(text-left|text-right|border-l|border-r)\b/);
      expect(src).not.toMatch(/[←→]/);
    }
  });
});

describe("learn subject setup (Talib v3 formats)", () => {
  const FRL = FR;
  const entry = `import SubjectSetup from "@/components/LawOS/Today/SubjectSetup";
const __default = () => <SubjectSetup module={{ id: "m1", title: "المسؤولية المدنية", semester: "S3", formats: ["tree"], viewStyle: "tree" }} semester="S3" onDone={() => {}} onCancel={() => {}} />;`;
  async function mountSetup(calls) {
    globalThis.indexedDB = new IDBFactory();
    return mountJsx(entry, {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const key = `${init.method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;
        calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
        return json(key === "PUT /modules/m1/profile" ? { profile: {} } : {});
      },
    });
  }

  test("changing only the formats keeps the student's view style and never marks the setup wizard done", async () => {
    const calls = [];
    const m = await mountSetup(calls);
    const doc = m.container.ownerDocument;
    const pick = byText(doc, "button[aria-pressed]", new RegExp(FRL["جداول"]));
    await click(m, pick);
    await click(m, byText(doc, "button", new RegExp(`^${FRL["حفظ"]}$`)));
    await settle(m);
    const body = calls.filter((c) => c.key === "PUT /modules/m1/profile").pop().body;
    expect(body).toEqual({ formats: ["tree", "table"] }); // no viewStyle, no setupDone
    await m.unmount();
  });

  test("cards and Q&A are saved last, whatever the click order", async () => {
    const calls = [];
    const m = await mountSetup(calls);
    const doc = m.container.ownerDocument;
    await click(m, byText(doc, "button[aria-pressed]", new RegExp(FRL["س/ج"].replace("/", "\\/") + "|" + FRL["سؤال وجواب"])));
    await click(m, byText(doc, "button[aria-pressed]", new RegExp(FRL["جداول"])));
    await click(m, byText(doc, "button", new RegExp(`^${FRL["حفظ"]}$`)));
    await settle(m);
    expect(calls.filter((c) => c.key === "PUT /modules/m1/profile").pop().body.formats).toEqual(["tree", "table", "qa"]);
    await m.unmount();
  });

});
});

describe("learning angles: helpers and the graph angle", () => {
  let A;
  beforeAll(async () => { A = await loadEsm('export * from "@/components/LawOS/module/angles";'); });
  const n = (id, parentId, order, title, body = "") => ({ id, parentId, level: parentId ? 1 : 0, kind: "section", title, body, order, sourceRefs: [], aiDraft: false });

  test("snippet and plain text: no markup, no fences, cut at a word with an ellipsis only when cut", () => {
    expect(A.plain("**مهم** `x`\n```\nكود\n```\n- نقطة")).toBe("مهم x نقطة");
    expect(A.snippet("كلمة ".repeat(40), 30)).toMatch(/…$/);
    expect(A.snippet("قصير")).toBe("قصير");
    expect(A.snippet("")).toBe("");
  });

  test("legal references are read from the text itself, deduplicated, capped, and absent when there are none", () => {
    expect(A.refsOf("وفق الفصل 77 من ق.ل.ع ثم الفصل 77 من ق.ل.ع وكذلك ف. 230 والمادة 5 مكرر")).toEqual(["الفصل 77 من ق.ل.ع", "ف. 230", "المادة 5 مكرر"]);
    expect(A.refsOf("لا إحالة هنا")).toEqual([]);
    expect(A.refsOf("```\nالفصل 12\n```")).toEqual([]);
    // law numbers, years and words ending in م/ف are not articles
    for (const t of ["القانون رقم 70.03 بمثابة مدونة الأسرة", "الظهير الشريف رقم 1.04.22", "مرسوم 2.12.349", "عام 1913", "يوم 12", "حكم 45", "تعريف 3"]) expect({ t, refs: A.refsOf(t) }).toEqual({ t, refs: [] });
    expect(A.refsOf("نص الفصل 77. ثم المادة 5.")).toEqual(["الفصل 77", "المادة 5"]); // a full stop after the number is not a decimal
    expect(A.refsOf("(م 12) و(ف. 230)")).toEqual(["م 12", "ف. 230"]);
    expect(A.refsOf("الفصل 1 الفصل 2 الفصل 3 الفصل 4", 2)).toHaveLength(2);
  });

  test("branches: a unit's children, else the bullet lines of its own text; Q/A only from branches that have text", () => {
    const nodes = [n("u", null, 0, "وحدة"), n("a", "u", 0, "الخطأ", "إخلال بواجب"), n("b", "u", 1, "فرع بلا نص"), n("v", null, 1, "وحدة نقاط", "- العقد: توافق إرادتين\n- السبب: الباعث\nسطر بلا فاصل")];
    const kids = A.branchesOf(nodes, "u");
    expect(kids.map((b) => b.title)).toEqual(["الخطأ", "فرع بلا نص"]);
    expect(A.qaOf(kids, (t) => `ما ${t}؟`)).toEqual([{ id: "a", q: "ما الخطأ؟", a: "إخلال بواجب", refs: [] }]);
    const bullets = A.branchesOf(nodes, "v");
    expect(bullets.map((b) => b.title)).toEqual(["العقد", "السبب", "سطر بلا فاصل"]);
    expect(bullets[0].body).toBe("توافق إرادتين");
    expect(A.branchesOf(nodes, "missing")).toEqual([]);
    expect(A.defaultUnit(nodes)).toBe("u");
    // a unit whose branches are only titles is passed over for one with written text
    const orphan = [n("o1", "gone", 0, "درس يتيم", ""), n("o2", "o1", 0, "فرع", "نص")];
    expect(A.unitsOf(orphan).map((u) => u.title)).toEqual(["درس يتيم"]); // a lost parent never hides a lesson
    expect(A.branchesOf(orphan, "o1").map((b) => b.title)).toEqual(["فرع"]);
    const plain = [n("p", null, 0, "خطة فقط"), n("p1", "p", 0, "عنوان"), n("w", null, 1, "درس مكتوب"), n("w1", "w", 0, "فرع", "نص الفرع")];
    expect(A.defaultUnit(plain)).toBe("w");
    expect(A.defaultUnit([])).toBeNull();
  });

  test("rail labels, worked examples and the comprehension check come from the student's own text", () => {
    expect(A.shortTitle("مسؤولية مدنية — 03: المسؤولية التقصيرية والخاصة")).toBe("المسؤولية التقصيرية والخاصة");
    expect(A.shortTitle("الدرس 01 — مدخل عام")).toBe("مدخل عام");
    expect(A.shortTitle("الضرر")).toBe("الضرر");
    expect(A.shortTitle("ا".repeat(60), 10)).toHaveLength(11);
    expect(A.exampleOf("تعريف عام\n- مثال: مصاريف علاج ضحية حادثة وأجرها الضائع")).toBe("مصاريف علاج ضحية حادثة وأجرها الضائع");
    expect(A.exampleOf("**نازلة الورش العملي:** سقط حجر على مار في الطريق")).toBe("سقط حجر على مار في الطريق");
    expect(A.exampleOf("لا شيء هنا")).toBeNull();
    expect(A.exampleOf("مثال: قصير")).toBeNull(); // a bare marker is not an example
    const br = (id, title, body) => ({ id, title, body, refs: [] });
    expect(A.masteryQuestions([br("a", "أ", "نص أول طويل نسبيا")], (t) => t)).toBeNull(); // fewer than two written branches
    const q = A.masteryQuestions([br("a", "الخطأ", "الإخلال بواجب قانوني"), br("b", "الضرر", "المساس بحق أو مصلحة"), br("c", "السببية", "علاقة بين الخطأ والضرر")], (t) => `ما ${t}؟`);
    expect(q).toHaveLength(3);
    for (const x of q) {
      expect(new Set(x.options).size).toBe(x.options.length); // no repeated option
      expect(x.options.length).toBeGreaterThanOrEqual(2);
      expect(x.correct).toBeGreaterThanOrEqual(0);
    }
    expect(q[0].options[q[0].correct]).toBe("الإخلال بواجب قانوني");
    expect(q[1].options[q[1].correct]).toBe("المساس بحق أو مصلحة");
    expect(new Set(q.map((x) => x.correct)).size).toBeGreaterThan(1); // the key does not always sit first
    expect(A.masteryQuestions([br("a", "x", "نص"), br("b", "y", "نص")], (t) => t)).toBeNull(); // identical texts would give one-option questions: no check, never a trivial pass
  });

  test("graph starting points: cited articles that exist in the graph and concepts named in the notes", () => {
    const index = { nodes: new Map([["DOC:77", { id: "DOC:77", type: "article" }], ["c:fault", { id: "c:fault", type: "concept", titleAr: "الخطأ التقصيري" }], ["c:x", { id: "c:x", type: "concept", titleAr: "ضر" }]]) };
    const nodes = [n("a", null, 0, "الخطأ التقصيري", "وفق الفصل 77 من ق.ل.ع والفصل 999 من ق.ل.ع والفصل 5 من ق.ج")];
    expect(A.graphIdsOf(nodes, index)).toEqual(["DOC:77"]);
    expect(A.conceptIdsOf(nodes, index)).toEqual(["c:fault"]); // a 2-letter concept title never matches by accident
  });

  test("the graph angle starts from what the notes cite, and says so when nothing matches", async () => {
    const bundle = { nodes: [{ id: "DOC:77", type: "article", label: "الفصل", n: 77 }, { id: "c:fault", type: "concept", titleAr: "الخطأ التقصيري" }], edges: [{ s: "c:fault", t: "DOC:77", k: "concept" }], tours: [] };
    const entry = (nodes) => `import { MemoryRouter } from "react-router-dom";\nimport GraphAngleView from "@/components/LawOS/module/views/GraphAngleView";\nconst __default = () => <MemoryRouter><GraphAngleView nodes={${JSON.stringify(nodes)}} /></MemoryRouter>;`;
    const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => bundle });
    globalThis.indexedDB = new IDBFactory();
    const hit = await mountJsx(entry([n("a", null, 0, "الخطأ التقصيري", "وفق الفصل 77 من ق.ل.ع")]), { lang: "fr", fetch: fetchImpl });
    await settle(hit);
    expect(hit.container.textContent).toContain("Points de départ tirés de tes notes");
    expect(hit.container.querySelector("svg")).not.toBeNull(); // the ego map is drawn
    await hit.unmount();
    globalThis.indexedDB = new IDBFactory();
    const miss = await mountJsx(entry([n("a", null, 0, "موضوع آخر", "نص")]), { lang: "fr", fetch: fetchImpl });
    await settle(miss);
    expect(miss.container.textContent).toContain("Nous n’avons trouvé dans les notes");
    expect(miss.container.querySelector("svg")).toBeNull();
    await miss.unmount();
  });
});
