// RC3 Phase 2: Today dashboard: to-do model, offline-first store, IndexedDB upgrade, rendering.
const path = require("path");
const fs = require("fs");
const { IDBFactory } = require("fake-indexeddb");
const { loadEsm, mountJsx } = require("../../utils/law/testing/renderJsx");

const SRC = path.resolve(__dirname, "../../../frontend/src");
const json = (body, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });

let model;
beforeAll(async () => { model = await loadEsm('export * from "@/components/LawOS/Today/todoModel";'); });

describe("todo model", () => {
  const labels = { lecture: (s) => `L ${s.startTime}`, review: (n) => `R ${n}` };
  const T = "2026-10-14";

  test("auto items: one per session plus one review item; ids are deterministic and valid sync ids", () => {
    const a = model.autoItems({ date: T, slots: [{ startTime: "08:30" }, { startTime: "10:30" }], dueCards: 7, labels });
    expect(a.map((x) => x.clientId)).toEqual(["auto-lecture-2026-10-14-0830", "auto-lecture-2026-10-14-1030", "auto-review-2026-10-14"]);
    for (const x of a) expect(/^[A-Za-z0-9-]{8,64}$/.test(x.clientId)).toBe(true);
    expect(model.autoItems({ date: T, slots: [], dueCards: 0, labels })).toEqual([]);
    expect(model.autoItems({ date: T, slots: null, dueCards: 3, labels })).toHaveLength(1);
  });

  test("a stored todo replaces its computed twin (checked stays checked); deleted ones disappear", () => {
    const auto = model.autoItems({ date: T, slots: [{ startTime: "08:30" }], dueCards: 2, labels });
    const stored = [{ ...auto[0], done: true, auto: undefined }, { ...auto[1], deletedAt: "2026-10-14T08:00:00Z" }];
    const merged = model.withAuto(stored, auto);
    expect(merged.map((x) => [x.clientId, x.done])).toEqual([["auto-lecture-2026-10-14-0830", true]]);
  });

  test("filters: today includes undated, late is past-due and unfinished, all is everything", () => {
    const mk = (id, dueDate, done = false, sortOrder = 0) => ({ clientId: id, dueDate, done, sortOrder });
    const list = [mk("a", T), mk("b", "2026-10-10"), mk("c", "2026-10-10", true), mk("d", null), mk("e", "2026-10-20")];
    expect(model.filterTodos(list, "today", T).map((x) => x.clientId)).toEqual(["a", "d"]);
    expect(model.filterTodos(list, "late", T).map((x) => x.clientId)).toEqual(["b"]);
    expect(model.filterTodos(list, "all", T)).toHaveLength(5);
    expect(model.lateCount(list, T)).toBe(1);
  });

  test("allDoneToday needs at least one task and every one of today's tasks done", () => {
    const mk = (dueDate, done) => ({ dueDate, done });
    expect(model.allDoneToday([], T)).toBe(false);
    expect(model.allDoneToday([mk(T, true), mk(T, true), mk("2026-10-20", false)], T)).toBe(true);
    expect(model.allDoneToday([mk(T, true), mk(null, false)], T)).toBe(false);
  });

  test("reorder renumbers and returns only changed items; out-of-range is a no-op", () => {
    const list = ["a", "b", "c"].map((id, i) => ({ clientId: id, sortOrder: i }));
    const ch = model.reorder(list, 0, 2);
    expect(Object.fromEntries(ch.map((x) => [x.clientId, x.sortOrder]))).toEqual({ a: 2, b: 0, c: 1 });
    expect(ch.every((x) => x.dirty)).toBe(true);
    expect(model.reorder(list, 1, 1)).toEqual([]);
    expect(model.reorder(list, -1, 2)).toEqual([]);
    expect(model.reorder(list, 0, 9)).toEqual([]);
  });

  test("makeTodo trims and caps the title, is dirty, and gets a unique id", () => {
    const a = model.makeTodo("  عنوان  ");
    const b = model.makeTodo("x".repeat(500));
    expect(a.title).toBe("عنوان");
    expect(b.title).toHaveLength(300);
    expect(a.dirty).toBe(true);
    expect(a.clientId).not.toBe(b.clientId);
    expect(/^[A-Za-z0-9-]{8,64}$/.test(a.clientId)).toBe(true);
  });

  describe("applyServer", () => {
    const t = (id, updatedAt, extra = {}) => ({ clientId: id, title: id, updatedAt, ...extra });
    test("server rows become clean; unknown server rows are added", () => {
      const out = model.applyServer([t("a", "2026-10-14T10:00:00Z", { dirty: true })], [t("a", "2026-10-14T10:00:00Z"), t("b", "2026-10-14T09:00:00Z")], new Map([["a", "2026-10-14T10:00:00Z"]]));
      expect(out.map((x) => [x.clientId, x.dirty])).toEqual([["a", false], ["b", false]]);
    });
    test("a row edited after the push began stays local and dirty", () => {
      const out = model.applyServer([t("a", "2026-10-14T11:00:00Z", { dirty: true, title: "new" })], [t("a", "2026-10-14T10:00:00Z", { title: "old" })], new Map([["a", "2026-10-14T10:00:00Z"]]));
      expect(out[0]).toMatchObject({ title: "new", dirty: true });
    });
    test("dirty rows the server has not seen are kept; rejected ones are dropped; clean rows the server purged vanish", () => {
      const local = [t("n", "x", { dirty: true }), t("bad", "x", { dirty: true }), t("old", "x", { dirty: false })];
      const out = model.applyServer(local, [], new Map(), new Set(["bad"]));
      expect(out.map((x) => x.clientId)).toEqual(["n"]);
    });
  });
});

describe("IndexedDB upgrade", () => {
  function openV4WithData() {
    globalThis.indexedDB = new IDBFactory();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("lawos", 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("cards", { keyPath: "id" });
        db.createObjectStore("reviewQueue", { keyPath: "clientReviewId" });
        db.createObjectStore("meta", { keyPath: "key" });
        db.createObjectStore("captures", { keyPath: "clientCaptureId" });
        db.createObjectStore("batches", { keyPath: "clientBatchId" });
        db.createObjectStore("ttQueue", { keyPath: "clientOpId" });
        db.createObjectStore("legalTexts", { keyPath: "slug" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["cards", "meta", "captures"], "readwrite");
        tx.objectStore("cards").put({ id: "c1", front: "q" });
        tx.objectStore("meta").put({ key: "today", value: { streak: 3 } });
        tx.objectStore("captures").put({ clientCaptureId: "cap1", blob: "b" });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  test("v4 -> v5 keeps every existing record and adds the todos store", async () => {
    await openV4WithData();
    const idb = await loadEsm('export * from "@/components/LawOS/lib/idb";');
    expect(await idb.getAll("cards")).toEqual([{ id: "c1", front: "q" }]);
    expect(await idb.getMeta("today")).toEqual({ streak: 3 });
    expect((await idb.getAll("captures")).map((c) => c.clientCaptureId)).toEqual(["cap1"]);
    expect(await idb.getAll("todos")).toEqual([]);
    const db = await idb.openDb();
    expect(db.version).toBe(5);
    expect([...db.objectStoreNames].sort()).toEqual(["batches", "captures", "cards", "legalTexts", "meta", "reviewQueue", "todos", "ttQueue"]);
    db.close();
  });

  test("the upload engine carries the identical schema version and todos store", () => {
    const eng = fs.readFileSync(path.resolve(SRC, "../public/lawos-upload-engine.js"), "utf8");
    const app = fs.readFileSync(path.join(SRC, "components/LawOS/lib/idb.js"), "utf8");
    expect(eng.match(/DB_VERSION = (\d+)/)[1]).toBe(app.match(/VERSION = (\d+)/)[1]);
    expect(eng).toMatch(/createObjectStore\("todos", \{ keyPath: "clientId" \}\)/);
    expect(app).not.toMatch(/deleteObjectStore/);
  });

  test("wipeAll (a different account signs in) empties the todos too", async () => {
    globalThis.indexedDB = new IDBFactory();
    const idb = await loadEsm('export * from "@/components/LawOS/lib/idb";');
    await idb.put("todos", { clientId: "aaaaaaaa", title: "t" });
    await idb.wipeAll();
    expect(await idb.getAll("todos")).toEqual([]);
    (await idb.openDb()).close();
  });
});

describe("todo store (offline first)", () => {
  async function store(handler) {
    globalThis.indexedDB = new IDBFactory();
    const calls = [];
    globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(url, init); };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.window = { localStorage: globalThis.localStorage };
    const mod = await loadEsm('export * from "@/components/LawOS/lib/todoStore";');
    return { mod, calls };
  }
  afterEach(() => { delete globalThis.fetch; delete globalThis.localStorage; delete globalThis.window; });

  test("offline: writes stay dirty in IndexedDB and nothing is lost", async () => {
    const { mod } = await store(async () => { throw new Error("offline"); });
    const t = await mod.addTodo("مراجعة", { dueDate: "2026-10-14" });
    await mod.syncTodos();
    const rows = await mod.loadTodos();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientId: t.clientId, dirty: true });
  });

  test("online: pushes dirty rows, then they are clean; a second sync pushes nothing", async () => {
    const pushedBatches = [];
    const serverRows = new Map(); // the real endpoint always answers with the whole list
    const { mod, calls } = await store(async (url, init) => {
      const body = JSON.parse(init.body);
      pushedBatches.push(body.items);
      for (const i of body.items) serverRows.set(i.clientId, { ...i });
      return json({ applied: body.items.length, rejected: [], items: [...serverRows.values()], serverTime: new Date().toISOString() });
    });
    const t = await mod.addTodo("مهمة", { dueDate: "2026-10-14" });
    await mod.syncTodos();
    const first = pushedBatches.find((b) => b.length);
    expect(first.map((p) => p.clientId)).toEqual([t.clientId]);
    expect(first[0].dirty).toBeUndefined();
    expect((await mod.loadTodos())[0].dirty).toBe(false);
    const n = calls.length;
    await mod.syncTodos();
    expect(JSON.parse(calls[n].init.body).items).toEqual([]);
  });

  test("rejected items are dropped, not re-sent forever", async () => {
    const { mod } = await store(async (url, init) => {
      const body = JSON.parse(init.body);
      return json({ applied: 0, rejected: body.items.map((i) => ({ clientId: i.clientId, reason: "bad_title" })), items: [], serverTime: "x" });
    });
    await mod.addTodo("مهمة");
    await mod.syncTodos();
    expect(await mod.loadTodos()).toEqual([]);
  });

  test("toggle then delete", async () => {
    const { mod } = await store(async () => json({}, false));
    const t = await mod.addTodo("مهمة");
    const done = await mod.toggleTodo(t);
    expect(done).toMatchObject({ done: true, dirty: true });
    expect(done.doneAt).toBeTruthy();
    const undone = await mod.toggleTodo(done);
    expect(undone.doneAt).toBeNull();
    const gone = await mod.removeTodo(undone);
    expect(gone.deletedAt).toBeTruthy();
  });

  test("an empty title is ignored", async () => {
    const { mod } = await store(async () => json({}, false));
    expect(await mod.addTodo("   ")).toBeNull();
    expect(await mod.loadTodos()).toEqual([]);
  });
});

describe("Today page", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";
import Today from "@/pages/LawOS/Today";
const __default = () => <MemoryRouter initialEntries={["/law/today"]}><Today /></MemoryRouter>;`;
  const routes = {
    "/today": { due: { reviewCount: 4, newCount: 1 }, inboxCount: 2, slots: [{ startTime: "08:30", endTime: "10:30", kind: "COURS", subject: { name: "الالتزامات" } }], exams: [], streak: { current: 3, dailyGoalMinutes: 20 } },
    "/notifications": { unread: 0, items: [] },
    "/brain/me": { enabled: true, memories: [{ id: "m1", status: "ACTIVE", strength: 0.8, summaryAr: "الخلط بين الفسخ والبطلان" }] },
    "/brain/today": { enabled: false },
  };
  async function mount(extra = {}) {
    globalThis.indexedDB = new IDBFactory();
    return mountJsx(entry, {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const p = String(url).replace(/^.*\/api\/law/, "").split("?")[0];
        if (p === "/todos/sync") { const b = JSON.parse(init.body); return json({ applied: b.items.length, rejected: [], items: b.items, serverTime: "x" }); }
        const hit = { ...routes, ...extra }[p];
        return hit === undefined ? json({}, false) : json(hit);
      },
    });
  }
  const settle = (m) => m.idle(); // waits for the requests in flight, not for a fixed time

  test("renders the to-do hub with computed items, no minute-goal picker and no streak/goal card", async () => {
    const m = await mount();
    await settle(m);
    const text = m.container.textContent;
    expect(m.container.querySelector("section[aria-label='Tâches du jour']")).not.toBeNull();
    expect(text).toMatch(/Cours 08:30/);
    // the review item is computed from the offline pack, which is empty here (covered in the model tests)
    expect(text).not.toMatch(/Révisez/);
    expect(m.container.querySelector("svg circle[stroke-dasharray]")).toBeNull(); // GoalRing
    expect(text).not.toMatch(/Collaborez|Collab/);
    await m.unmount();
  });

  test("cards without data collapse: no exams, no unread discussions", async () => {
    const m = await mount();
    await settle(m);
    expect(m.container.querySelector("section[aria-label='Prochain examen']")).toBeNull();
    expect(m.container.querySelector("section[aria-label='Discussions non lues']")).toBeNull();
    expect(m.container.querySelector("section[aria-label='Radar des lacunes']")).toBeNull(); // secondary tools left Today
    await m.unmount();
  });

  test("quick add with Enter stores a todo; checking everything shows the celebration", async () => {
    const m = await mount({ "/today": { due: { reviewCount: 0, newCount: 0 }, inboxCount: 0, slots: [], exams: [] } });
    await settle(m);
    const input = m.container.querySelector("input[placeholder]");
    const form = input.closest("form");
    await m.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(m.window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "مراجعة المسؤولية");
      input.dispatchEvent(new m.window.Event("input", { bubbles: true }));
    });
    await m.act(async () => { form.dispatchEvent(new m.window.Event("submit", { bubbles: true, cancelable: true })); });
    await settle(m);
    expect(m.container.textContent).toMatch(/مراجعة المسؤولية/);
    const box = m.container.querySelector("input[type='checkbox']");
    await m.act(async () => { box.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });
    await settle(m);
    expect(m.container.textContent).toMatch(/Vous avez terminé toutes les tâches du jour/);
    await m.unmount();
  });
});

describe("sync robustness (critic findings)", () => {
  async function store(handler) {
    globalThis.indexedDB = new IDBFactory();
    const calls = [];
    globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(url, init, calls); };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.window = { localStorage: globalThis.localStorage };
    const mod = await loadEsm('export * from "@/components/LawOS/lib/todoStore"; export * from "@/components/LawOS/lib/idb";');
    return { mod, calls };
  }
  afterEach(() => { delete globalThis.fetch; delete globalThis.localStorage; delete globalThis.window; });
  const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ clientId: `stuck-${String(i).padStart(5, "0")}`, title: `t${i}`, kind: "custom", refType: null, refId: null, dueDate: null, done: false, doneAt: null, sortOrder: i, deletedAt: null, updatedAt: new Date(1e12 + i).toISOString(), dirty: true }));

  test("a server that applies nothing cannot make the client loop forever", async () => {
    const { mod, calls } = await store(async () => json({ applied: 0, rejected: [], items: [], serverTime: "x" }));
    await mod.putMany("todos", rowsOf(450));
    await mod.syncTodos();
    expect(calls.length).toBeLessThanOrEqual(5);
    expect((await mod.loadTodos()).length).toBe(450); // nothing dropped, still dirty for the next attempt
  });

  test("permanently rejected rows are dropped; capacity rejections are kept", async () => {
    const { mod } = await store(async (u, init) => {
      const items = JSON.parse(init.body).items;
      return json({ applied: 0, rejected: [{ clientId: items[0].clientId, reason: "bad_title" }, { clientId: items[1].clientId, reason: "too_many_todos" }], items: [], serverTime: "x" });
    });
    await mod.putMany("todos", rowsOf(3));
    await mod.syncTodos();
    expect((await mod.loadTodos()).map((t) => t.clientId).sort()).toEqual(["stuck-00001", "stuck-00002"]);
  });

  test("rows beyond 1000 are all kept and pushed: nothing is dropped from the local list", async () => {
    const server = new Map();
    const { mod } = await store(async (u, init) => {
      for (const i of JSON.parse(init.body).items) server.set(i.clientId, { ...i });
      return json({ applied: 1, rejected: [], items: [...server.values()], serverTime: "x" });
    });
    for (let i = 0; i < 1200; i++) server.set(`old-${String(i).padStart(6, "0")}`, { ...rowsOf(1)[0], clientId: `old-${String(i).padStart(6, "0")}`, sortOrder: i });
    await mod.addTodo("جديد", { sortOrder: 5000 });
    await mod.syncTodos();
    const local = await mod.loadTodos();
    expect(local).toHaveLength(1201);
    expect(local.every((t) => t.dirty === false)).toBe(true);
  });

  test("a todo added while a sync is in flight is merged, not lost", async () => {
    let mod;
    const { mod: m } = await store(async () => { await mod.addTodo("أضيفت أثناء المزامنة"); return json({ applied: 0, rejected: [], items: [], serverTime: "x" }); });
    mod = m;
    await mod.addTodo("أولى");
    await mod.syncTodos();
    const titles = (await mod.loadTodos()).map((t) => t.title);
    expect(titles).toContain("أضيفت أثناء المزامنة");
  });

  test("replaceMerged reads and writes in one transaction", async () => {
    const { mod } = await store(async () => json({}, false));
    await mod.put("todos", { clientId: "a-0000001", title: "a" });
    const seen = [];
    const next = await mod.replaceMerged("todos", (rows) => { seen.push(rows.length); return [...rows, { clientId: "b-0000001", title: "b" }]; });
    expect(seen).toEqual([1]);
    expect(next).toHaveLength(2);
    expect((await mod.getAll("todos")).map((t) => t.clientId).sort()).toEqual(["a-0000001", "b-0000001"]);
  });

  test("a computed title longer than 300 characters is capped before it is stored", async () => {
    const { mod } = await store(async () => json({}, false));
    const row = await mod.putTodo({ clientId: "auto-lecture-2026-10-14-0830", title: "x".repeat(400), kind: "lecture", done: false, sortOrder: -2000, updatedAt: null }, { done: true });
    expect(row.title).toHaveLength(300);
  });
});

describe("Today interactions (critic findings)", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";
import Today from "@/pages/LawOS/Today";
const __default = () => <MemoryRouter initialEntries={["/law/today"]}><Today /></MemoryRouter>;`;
  async function mount(extra = {}) {
    globalThis.indexedDB = new IDBFactory();
    return mountJsx(entry, {
      lang: "fr",
      fetch: async (url, init = {}) => {
        const p = String(url).replace(/^.*\/api\/law/, "").split("?")[0];
        if (p === "/todos/sync") return json({ applied: 0, rejected: [], items: [], serverTime: "x" }, false);
        const table = { "/today": { due: { reviewCount: 0, newCount: 0 }, inboxCount: 0, slots: [{ startTime: "08:30", endTime: "10:30", kind: "COURS", subject: { name: "الالتزامات" } }], exams: [] }, "/notifications": { unread: 0, items: [] }, ...extra };
        return table[p] === undefined ? json({}, false) : json(table[p]);
      },
    });
  }
  const settle = (m) => m.idle(); // waits for the requests in flight, not for a fixed time
  const addVia = async (m, text) => {
    const input = m.container.querySelector("input[placeholder]");
    await m.act(async () => { Object.getOwnPropertyDescriptor(m.window.HTMLInputElement.prototype, "value").set.call(input, text); input.dispatchEvent(new m.window.Event("input", { bubbles: true })); });
    await m.act(async () => { input.closest("form").dispatchEvent(new m.window.Event("submit", { bubbles: true, cancelable: true })); });
    await settle(m);
  };
  const click = (m, el) => m.act(async () => { el.dispatchEvent(new m.window.MouseEvent("click", { bubbles: true })); });

  test("moving a stored todo never stores the computed lecture item", async () => {
    const m = await mount();
    await settle(m);
    await addVia(m, "الأولى");
    await addVia(m, "الثانية");
    const down = [...m.container.querySelectorAll("button[aria-label='Descendre']")].filter((b) => !b.disabled);
    expect(down.length).toBeGreaterThan(0);
    await click(m, down[0]);
    await settle(m);
    const idb = await loadEsm('export * from "@/components/LawOS/lib/idb";');
    const ids = (await idb.getAll("todos")).map((t) => t.clientId);
    expect(ids.some((id) => id.startsWith("auto-"))).toBe(false);
    expect(ids).toHaveLength(2);
    await m.unmount();
  });

  test("the computed item has no move buttons enabled", async () => {
    const m = await mount();
    await settle(m);
    const row = [...m.container.querySelectorAll("li")].find((li) => /Cours 08:30/.test(li.textContent));
    expect(row).toBeTruthy();
    expect([...row.querySelectorAll("button[aria-label='Monter'],button[aria-label='Descendre']")].every((b) => b.disabled)).toBe(true);
    await m.unmount();
  });
});

describe("Today next-exam card", () => {
  const entry = `import { MemoryRouter } from "react-router-dom";
import Today from "@/pages/LawOS/Today";
const __default = () => <MemoryRouter initialEntries={["/law/today"]}><Today /></MemoryRouter>;`;
  const mountWith = (countdown, subjectExams) => {
    globalThis.indexedDB = new IDBFactory();
    return mountJsx(entry, { lang: "fr", fetch: async (url) => {
      const p = String(url).replace(/^.*\/api\/law/, "").split("?")[0];
      const t = { "/today": { due: { reviewCount: 0, newCount: 0 }, inboxCount: 0, slots: [], exams: subjectExams }, "/exam/countdown": { exams: countdown }, "/notifications": { unread: 0, items: [] } }[p];
      return t === undefined ? json({}, false) : json(t);
    } });
  };
  const settle = (m) => m.idle(); // waits for the requests in flight, not for a fixed time

  test("confirmed exam-center dates win over the subjects' own exam dates", async () => {
    const m = await mountWith([{ id: 1, title: "امتحان المسؤولية", daysTo: 4 }], [{ id: "s", name: "مادة قديمة", daysToExam: 30, color: "x" }]);
    await settle(m);
    const card = m.container.querySelector("section[aria-label='Prochain examen']");
    expect(card.textContent).toContain("امتحان المسؤولية");
    expect(card.textContent).not.toContain("مادة قديمة");
    expect(card.querySelector("a[href='/law/exam']")).not.toBeNull();
    await m.unmount();
  });

  test("with no exam-center dates the subjects' exams still show; with neither the card collapses", async () => {
    const m = await mountWith([], [{ id: "s", name: "مادة قديمة", daysToExam: 30 }]);
    await settle(m);
    expect(m.container.querySelector("section[aria-label='Prochain examen']").textContent).toContain("مادة قديمة");
    await m.unmount();
    const none = await mountWith([], []);
    await settle(none);
    expect(none.container.querySelector("section[aria-label='Prochain examen']")).toBeNull();
    await none.unmount();
  });
});

describe("Today page source", () => {
  test("no physical-direction CSS or hex colors in the new components", () => {
    for (const f of ["components/LawOS/Today/TodoHub.jsx", "components/LawOS/Today/cards.jsx", "pages/LawOS/Today.jsx"]) {
      const src = fs.readFileSync(path.join(SRC, f), "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/(^|[^\w-])-?(ml|mr|pl|pr|left|right)-[\w[]/);
      expect(src).not.toMatch(/\b(text-left|text-right|border-l|border-r)\b/);
    }
  });
});
