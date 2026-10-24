// RC3 Phase 5 (client): file import with review, desktop grid vs phone day tabs, reminder settings, the Today "tomorrow" card.
const fs = require("fs");
const path = require("path");
const { IDBFactory } = require("fake-indexeddb");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");

const FR = require("../../../frontend/src/locales/qanouni/fr.json");
const json = (body, ok = true, status) => ({ ok, status: status || (ok ? 200 : 400), json: async () => body });
const settle = (m) => m.idle(); // waits for the requests in flight, not for a fixed time
const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
const type = (m, el, value) => m.act(async () => {
  const proto = el.tagName === "SELECT" ? m.window.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? m.window.HTMLTextAreaElement.prototype : m.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new m.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});
const byText = (root, sel, re) => [...root.querySelectorAll(sel)].find((e) => re.test(e.textContent));
const keyOf = (method, url) => `${method || "GET"} ${String(url).replace(/^.*\/api\/law/, "").split("?")[0]}`;

const CANDIDATES = [
  { weekday: 1, startTime: "08:30", endTime: "10:00", kind: "amphi", subjectName: "المسؤولية المدنية", room: "مدرج 3", professor: "د. العلمي", groupLabel: "G01", activeFrom: "2026-10-12", activeTo: "2027-01-31", subjectId: null },
  { weekday: 3, startTime: "10:15", endTime: "11:45", kind: "TD", subjectName: "قانون الشركات", room: null, professor: null, groupLabel: null, activeFrom: null, activeTo: null, subjectId: null },
];

describe("shared payload", () => {
  test("toPayload carries the new fields and keeps ids; TP has a label", async () => {
    const S = await loadEsm('export * from "@/components/LawOS/Schedule/shared";');
    const p = S.toPayload([{ id: "x", weekday: "2", startTime: "08:00", endTime: "09:00", kind: "TP", professor: "د. فلان", groupLabel: "G02", moduleId: "m1", subjectId: "", room: "" }]);
    expect(p).toEqual([{ id: "x", weekday: 2, startTime: "08:00", endTime: "09:00", kind: "TP", room: null, subjectId: null, activeFrom: null, activeTo: null, professor: "د. فلان", groupLabel: "G02", moduleId: "m1", placeholder: false }]);
    expect(Object.keys(S.KIND_LABELS)).toEqual(["amphi", "TD", "TP"]);
  });
});

describe("ICS / CSV import with review", () => {
  const entry = `import FileImport from "@/components/LawOS/Schedule/FileImport";
const __default = () => <FileImport modules={[{ id: "m2", title: "قانون الشركات" }]} semester="S3" current={[]} onSaved={(s) => { globalThis.__saved = s; }} />;`;
  function api(calls, over = {}) {
    return async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (over[key]) return over[key](init);
      if (key === "POST /timetable/import") return json({ slots: CANDIDATES, rejected: [{ line: 4, reason: "invalid_weekday" }], warnings: ["unsupported_recurrence"], notes: null });
      if (key === "POST /modules") return json({ module: { id: "m-new" } }, true, 201);
      if (key === "PUT /timetable") return json({ slots: JSON.parse(init.body).slots });
      return json({}, false, 404);
    };
  }
  const pick = async (m, name, content, type = "text/calendar") => {
    const input = m.container.querySelector("input[type=file]");
    const file = new (require("buffer").File)([content], name, { type });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await m.act(async () => { input.dispatchEvent(new m.window.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 20)); });
    await settle(m);
  };
  afterEach(() => { delete globalThis.__saved; });

  test("a calendar is parsed on the server, shown for review with its warnings and unreadable rows, and saved only after confirmation", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: api(calls) });
    await pick(m, "emploi.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR");
    expect(calls.find((c) => c.key === "POST /timetable/import").body).toEqual({ format: "ics", content: "BEGIN:VCALENDAR\nEND:VCALENDAR" });
    expect(calls.some((c) => c.key === "PUT /timetable")).toBe(false); // nothing saved yet
    const text = m.container.textContent;
    expect(text).toContain("المسؤولية المدنية"); expect(text).toContain("د. العلمي");
    expect(text).toContain(FR["بعض الأحداث متكررة بطريقة غير مدعومة: أُخذ أول موعد فقط."]);
    expect(text).toContain(FR["يوم غير مفهوم"]);
    expect(text).toContain(FR["سطر {0}"].replace("{0}", "4"));
    // unknown module -> a new one is created on confirm; the module with the same title is reused
    await click(m, byText(m.container, "button", /Confirmer et enregistrer 2|تأكيد وحفظ 2/) || [...m.container.querySelectorAll("button")].find((b) => /2/.test(b.textContent) && !b.disabled));
    await settle(m, 100);
    expect(calls.filter((c) => c.key === "POST /modules")).toHaveLength(1);
    expect(calls.find((c) => c.key === "POST /modules").body).toEqual({ semester: "S3", title: "المسؤولية المدنية" });
    const put = calls.find((c) => c.key === "PUT /timetable").body.slots;
    expect(put[0]).toMatchObject({ weekday: 1, startTime: "08:30", professor: "د. العلمي", groupLabel: "G01", activeFrom: "2026-10-12", activeTo: "2027-01-31", moduleId: "m-new" });
    expect(put[1]).toMatchObject({ weekday: 3, kind: "TD", moduleId: "m2" });
    expect(globalThis.__saved).toHaveLength(2);
    await m.unmount();
  });

  test("a row can be unchecked and is then not saved", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: api(calls) });
    await pick(m, "t.csv", "day,start,end,subject\nmonday,08:30,10:00,x", "text/csv");
    expect(calls.find((c) => c.key === "POST /timetable/import").body.format).toBe("csv");
    await click(m, m.container.querySelectorAll("input[type=checkbox]")[1]); // second row off
    await click(m, [...m.container.querySelectorAll("button")].find((b) => /1/.test(b.textContent) && /تأكيد|Confirmer/.test(b.textContent)));
    await settle(m, 100);
    expect(calls.find((c) => c.key === "PUT /timetable").body.slots).toHaveLength(1);
    await m.unmount();
  });

  test("wrong file type, oversize file and server refusals are explained without saving anything", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", fetch: api(calls, { "POST /timetable/import": () => json({ error: "missing_columns" }, false, 400) }) });
    await pick(m, "notes.txt", "x", "text/plain");
    expect(m.container.textContent).toContain(FR["اختر ملف .ics أو .csv."]);
    expect(calls).toHaveLength(0);
    const input = m.container.querySelector("input[type=file]");
    const big = new (require("buffer").File)([new Uint8Array(950 * 1024)], "big.ics", { type: "text/calendar" });
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    await m.act(async () => { input.dispatchEvent(new m.window.Event("change", { bubbles: true })); });
    await settle(m);
    expect(m.container.textContent).toContain(FR["الملف كبير جداً."]);
    expect(calls).toHaveLength(0);
    await pick(m, "a.csv", "a,b\n1,2", "text/csv");
    expect(m.container.textContent).toContain(FR["ينقص الملف أعمدة ضرورية: اليوم، البداية، النهاية، المادة."]);
    expect(calls.some((c) => c.key === "PUT /timetable")).toBe(false);
    await m.unmount();
  });
});

describe("Schedule layout: grid on desktop, day tabs on phones", () => {
  const entry = `import Schedule from "@/pages/LawOS/Schedule";\nconst __default = () => <Schedule />;`;
  const slots = [
    { id: "a", weekday: 1, startTime: "08:30", endTime: "10:00", kind: "amphi", room: "A1", moduleId: "m1", professor: "د. العلمي" },
    { id: "b", weekday: 3, startTime: "10:15", endTime: "11:45", kind: "TP", room: null, moduleId: "m1" },
  ];
  const fetchFor = (calls = []) => async (url, init = {}) => {
    const key = keyOf(init.method, url);
    calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
    if (key === "GET /timetable") return json({ slots });
    if (key === "GET /me/academic") return json({ academic: { semester: "S3" } });
    if (key === "GET /modules") return json({ semester: "S3", modules: [{ id: "m1", title: "المسؤولية المدنية" }] });
    if (key === "PUT /timetable") return json({ slots: JSON.parse(init.body).slots.map((s, i) => ({ ...s, id: s.id || `n${i}` })) });
    return json({}, false, 404);
  };

  test("desktop shows all six days at once and no day tabs", async () => {
    const m = await mountJsx(entry, { lang: "fr", media: (q) => q.includes("min-width: 1024px"), fetch: fetchFor() });
    await settle(m);
    expect(m.container.querySelectorAll("[role=columnheader]").length).toBe(7); // the time column plus Monday to Saturday
    expect(m.container.querySelector("[role=table]")).not.toBeNull();
    expect(m.container.querySelector("[role=tablist][aria-label='" + FR["اليوم"] + "']")).toBeNull();
    expect(m.container.textContent).toContain("المسؤولية المدنية");
    expect(m.container.textContent).toContain("د. العلمي"); // the professor is on the card
    expect(m.container.textContent).toContain("CM"); // lecture type
    expect([...m.container.querySelectorAll("[role=rowheader]")].map((e) => e.textContent)).toEqual(["08:30", "10:15"]); // one row per start time
    // module-level labels are translated once the dictionary is loaded (the app awaits it before loading a page; this harness does not)
    expect(m.container.textContent).toContain("TP");
    await m.unmount();
  });

  test("a phone shows day tabs and one day at a time", async () => {
    const m = await mountJsx(entry, { lang: "fr", media: () => false, fetch: fetchFor() });
    await settle(m);
    const tabs = m.container.querySelectorAll("[role=tablist][aria-label='" + FR["اليوم"] + "'] [role=tab]");
    expect(tabs).toHaveLength(6);
    expect(m.container.querySelectorAll("section[aria-label]").length).toBe(0);
    await m.unmount();
  });

  test("quick add on a desktop column saves a session with professor and group", async () => {
    const calls = [];
    const m = await mountJsx(entry, { lang: "fr", media: (q) => q.includes("min-width: 1024px"), fetch: fetchFor(calls) });
    await settle(m);
    // the empty cell of Tuesday at 08:30 opens the modal form
    await click(m, m.container.querySelector("button[aria-label*='08:30'][aria-label*='" + FR["الثلاثاء"] + "']") || [...m.container.querySelectorAll("button[aria-label]")].find((b) => /08:30/.test(b.getAttribute("aria-label")) && /الثلاثاء|Mardi/.test(b.getAttribute("aria-label"))));
    const form = m.container.ownerDocument.querySelector("form");
    const inputs = form.querySelectorAll("input");
    await type(m, inputs[inputs.length - 2], "د. الإدريسي");
    await type(m, inputs[inputs.length - 1], "G03");
    await m.act(async () => { form.dispatchEvent(new m.window.Event("submit", { bubbles: true, cancelable: true })); });
    await settle(m, 100);
    const put = calls.filter((c) => c.key === "PUT /timetable").pop().body.slots;
    expect(put.find((s) => !s.id)).toMatchObject({ weekday: 2, startTime: "08:30", professor: "د. الإدريسي", groupLabel: "G03" });
    await m.unmount();
  });

  test("the three entry points: by hand, a file, a photo or text", async () => {
    const m = await mountJsx(entry, { lang: "fr", media: () => false, fetch: fetchFor() });
    await settle(m);
    const modes = [...m.container.querySelectorAll("[role=tablist] [role=tab]")].filter((b) => /Manuel|باليد|Fichier|ملف|Image|صورة/.test(b.textContent));
    expect(modes.length).toBeGreaterThanOrEqual(3);
    await click(m, byText(m.container, "[role=tab]", new RegExp(FR["ملف"])));
    expect(m.container.querySelector("input[type=file][accept*='.ics']")).not.toBeNull();
    await m.unmount();
  });
});

describe("reminder settings", () => {
  const entry = `import ReminderSettings from "@/components/LawOS/Timetable/ReminderSettings";\nconst __default = () => <ReminderSettings />;`;
  test("loads the preferences and saves each change at once (undone when the server says no)", async () => {
    const calls = [];
    let ok = true;
    const m = await mountJsx(entry, { lang: "fr", fetch: async (url, init = {}) => {
      const key = keyOf(init.method, url);
      calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
      if (key === "GET /timetable/reminders") return json({ prefs: { enabled: true, eveningBefore: true, minutesBefore: null }, minutesOptions: [15, 30, 60, 120] });
      if (key === "PUT /timetable/reminders") return ok ? json({ prefs: { enabled: true, eveningBefore: true, minutesBefore: 30, ...JSON.parse(init.body) } }) : json({}, false, 500);
      return json({}, false, 404);
    } });
    await settle(m);
    const toggles = m.container.querySelectorAll("button[role=switch], input[type=checkbox]");
    expect(toggles.length).toBeGreaterThanOrEqual(2);
    await type(m, m.container.querySelector("select"), "30");
    expect(calls.find((c) => c.key === "PUT /timetable/reminders").body).toEqual({ minutesBefore: 30 });
    expect(m.container.querySelector("select").value).toBe("30");
    ok = false;
    await type(m, m.container.querySelector("select"), "60");
    await settle(m);
    expect(m.container.querySelector("select").value).toBe("30"); // reverted
    expect(m.container.textContent).toContain(FR["تعذر الحفظ. يلزم الاتصال."]);
    const options = [...m.container.querySelectorAll("option")].map((o) => o.value);
    expect(options).toEqual(["", "15", "30", "60", "120"]);
    await m.unmount();
  });
});

describe("Today: tomorrow card and reminder notifications", () => {
  const entry = (now) => `import { MemoryRouter } from "react-router-dom";\nimport { TomorrowCard } from "@/components/LawOS/Today/cards";\nconst __default = () => <MemoryRouter><TomorrowCard now={new Date("${now}")} /></MemoryRouter>;`;
  const session = (over = {}) => ({ startTime: "08:30", endTime: "10:00", subject: "المسؤولية المدنية", room: "Amphi 3", ...over });
  const mount = (now, data, calls = []) => mountJsx(entry(now), { lang: "fr", fetch: async (url, init = {}) => { calls.push(keyOf(init.method, url)); return json(data); } });
  const EVENING = "2026-10-12T18:30:00Z"; // 19:30 or 18:30 Casablanca: after 17:00 either way
  const MORNING = "2026-10-12T08:00:00Z";

  test("before 17:00 the card does not even ask the server", async () => {
    const calls = [];
    const m = await mount(MORNING, { date: "2026-10-13", sessions: [session()], prefs: { enabled: true, eveningBefore: true } }, calls);
    await settle(m);
    expect(calls).toEqual([]);
    expect(m.container.textContent).toBe("");
    await m.unmount();
  });

  test("in the evening it names tomorrow's class and room; several classes give a count and the first time", async () => {
    const m = await mount(EVENING, { date: "2026-10-13", sessions: [session()], prefs: { enabled: true, eveningBefore: true } });
    await settle(m);
    expect(m.container.textContent).toContain(FR["لديك حصة غداً:"]);
    expect(m.container.textContent).toContain("المسؤولية المدنية");
    expect(m.container.textContent).toContain("Amphi 3");
    expect(m.container.querySelector("a[href='/law/timetable']")).not.toBeNull();
    await m.unmount();
    const many = await mount(EVENING, { date: "2026-10-13", sessions: [session(), session({ startTime: "10:15", subject: "قانون الشركات" })], prefs: { enabled: true, eveningBefore: true } });
    await settle(many);
    expect(many.container.textContent).toContain(FR["لديك {0} حصص غداً، أولها {1}"].replace("{0}", "2").replace("{1}", "08:30"));
    await many.unmount();
  });

  test("collapses with no classes, with reminders off, or with the evening reminder off", async () => {
    for (const data of [
      { sessions: [], prefs: { enabled: true, eveningBefore: true } },
      { sessions: [session()], prefs: { enabled: false, eveningBefore: true } },
      { sessions: [session()], prefs: { enabled: true, eveningBefore: false } },
    ]) {
      const m = await mount(EVENING, { date: "2026-10-13", ...data });
      await settle(m);
      expect(m.container.textContent).toBe("");
      await m.unmount();
    }
  });

  test("the notification popover words both reminder types", async () => {
    const D = await loadEsm('export * from "@/components/LawOS/notifications/describe";');
    const one = D.describe({ type: "SESSION_REMINDER", payload: { count: 1, first: { subject: "المسؤولية المدنية", room: "Amphi 3", start: "08:30" } } });
    expect(one).toMatchObject({ group: "reminders", to: "/law/timetable" });
    expect(one.text).toBe("لديك حصة غداً: المسؤولية المدنية — Amphi 3");
    expect(D.describe({ type: "SESSION_REMINDER", payload: { count: 1, first: { subject: "س", room: null } } }).text).toBe("لديك حصة غداً: س");
    expect(D.describe({ type: "SESSION_REMINDER", payload: { count: 3, first: { start: "08:30" } } }).text).toBe("لديك 3 حصص غداً، أولها 08:30");
    expect(D.describe({ type: "SESSION_SOON", payload: { subject: "س", room: "A1", start: "09:00" } })).toMatchObject({ group: "reminders", text: "حصة قريبة: س — A1 (09:00)" });
  });
});

describe("source hygiene", () => {
  const SRC = path.resolve(__dirname, "../../../frontend/src");
  test("no hex colours, physical-direction classes or typed arrows in the new timetable code", () => {
    const files = ["components/LawOS/Schedule/ImportReview.jsx", "components/LawOS/Schedule/FileImport.jsx", "components/LawOS/Timetable/ReminderSettings.jsx", "pages/LawOS/Schedule.jsx", "pages/LawOS/Timetable.jsx"].map((f) => path.join(SRC, f));
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/(^|[^\w-])-?(ml|mr|pl|pr|left|right)-[\w[]/);
      expect(src).not.toMatch(/[←→]/);
    }
  });
});
