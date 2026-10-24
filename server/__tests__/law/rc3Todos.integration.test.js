// RC3 Phase 2: offline-first to-do sync (idempotent by clientId, last-write-wins, soft delete, per-user).
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const sync = (token, items) => h.call("POST", "/law/todos/sync", { token, body: { items } });
const todo = (clientId, over = {}) => ({ clientId, title: "مراجعة الالتزامات", updatedAt: iso(1000), ...over });
const student = () => h.signUp("سلمى", "a@example.ma");
const rows = async (userId) => h.tmp.client.lawTodo.findMany({ where: { userId }, orderBy: { id: "asc" } });

describe("POST /law/todos/sync", () => {
  test("creates todos and returns them with the server view", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const r = await sync(a.token, [todo(U1, { dueDate: "2026-11-03", kind: "reading", sortOrder: 2 })]);
    expect(r.status).toBe(200);
    expect(r.body.applied).toBe(1);
    expect(r.body.rejected).toEqual([]);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ clientId: U1, title: "مراجعة الالتزامات", kind: "reading", dueDate: "2026-11-03", done: false, sortOrder: 2, deletedAt: null });
  });

  test("is idempotent: pushing the same clientId again never duplicates", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const item = todo(U1);
    await sync(a.token, [item]);
    await sync(a.token, [item]);
    await sync(a.token, [item, item]);
    expect(await rows(a.user.id)).toHaveLength(1);
  });

  test("last write wins on updatedAt: a newer edit applies, an older one is ignored", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1, { title: "الأصلي", updatedAt: iso(5000) })]);
    await sync(a.token, [todo(U1, { title: "أحدث", updatedAt: iso(3000) })]);
    const stale = await sync(a.token, [todo(U1, { title: "قديم", updatedAt: iso(4000) })]);
    expect(stale.body.applied).toBe(0);
    expect((await rows(a.user.id))[0].title).toBe("أحدث");
  });

  test("marking done stores doneAt; un-marking clears it", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1, { updatedAt: iso(3000) })]);
    const done = await sync(a.token, [todo(U1, { done: true, updatedAt: iso(2000) })]);
    expect(done.body.items[0].done).toBe(true);
    expect(done.body.items[0].doneAt).toBeTruthy();
    const undone = await sync(a.token, [todo(U1, { done: false, updatedAt: iso(1000) })]);
    expect(undone.body.items[0].doneAt).toBeNull();
  });

  test("soft delete: the row stays with deletedAt so other devices learn about it", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1, { updatedAt: iso(3000) })]);
    const r = await sync(a.token, [todo(U1, { deletedAt: iso(2000), updatedAt: iso(2000) })]);
    expect(r.body.items[0].deletedAt).toBeTruthy();
    expect(await rows(a.user.id)).toHaveLength(1);
  });

  test("two students can use the same clientId without touching each other's rows", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const b = await h.signUp("يوسف", "b@example.ma");
    await sync(a.token, [todo(U1, { title: "لسلمى" })]);
    await sync(b.token, [todo(U1, { title: "ليوسف" })]);
    expect((await rows(a.user.id))[0].title).toBe("لسلمى");
    expect((await rows(b.user.id))[0].title).toBe("ليوسف");
    const mine = await sync(a.token, []);
    expect(mine.body.items.map((i) => i.title)).toEqual(["لسلمى"]);
  });

  test("a userId in the payload is ignored (cannot write for someone else)", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const b = await h.signUp("يوسف", "b@example.ma");
    await sync(a.token, [todo(U2, { userId: b.user.id })]);
    expect(await rows(b.user.id)).toHaveLength(0);
    expect(await rows(a.user.id)).toHaveLength(1);
  });

  test("rejects bad items individually and applies the good ones", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const r = await sync(a.token, [
      todo(U1),
      todo("x", {}), // clientId too short
      todo(U2, { title: "   " }),
      todo("33333333-3333-4333-8333-333333333333", { dueDate: "2026-02-30" }),
      todo("44444444-4444-4444-8444-444444444444", { kind: "bogus" }),
      todo("55555555-5555-4555-8555-555555555555", { title: "x".repeat(301) }),
      null,
      "str",
    ]);
    expect(r.status).toBe(200);
    expect(r.body.applied).toBe(1);
    expect(r.body.rejected.map((x) => x.reason).sort()).toEqual(["bad_client_id", "bad_due_date", "bad_item", "bad_item", "bad_kind", "bad_title", "bad_title"].sort());
    expect(await rows(a.user.id)).toHaveLength(1);
  });

  test("clamps a future updatedAt to now so a wrong device clock cannot freeze an item", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1, { updatedAt: new Date(Date.now() + 86_400_000 * 30).toISOString() })]);
    const r = await sync(a.token, [todo(U1, { title: "تعديل لاحق", updatedAt: iso(0) })]);
    expect(r.body.items[0].title).toBe("تعديل لاحق");
  });

  test("batch limit: more than 200 items is a 400 and nothing is stored", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const items = Array.from({ length: 201 }, (_, i) => todo(`aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`));
    expect((await sync(a.token, items)).status).toBe(400);
    expect(await rows(a.user.id)).toHaveLength(0);
  });

  test("items must be an array; a missing token is 401", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    expect((await h.call("POST", "/law/todos/sync", { token: a.token, body: { items: "no" } })).status).toBe(400);
    expect((await h.call("POST", "/law/todos/sync", { body: { items: [] } })).status).toBe(401);
  });

  test("always returns the whole list, so a late push from an offline device is never missed", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1, { updatedAt: iso(60_000) })]);
    // another device pushes an item it edited long ago (older than anything already synced)
    const late = await sync(a.token, [todo(U2, { updatedAt: iso(120_000) })]);
    expect(late.body.items.map((i) => i.clientId).sort()).toEqual([U1, U2].sort());
  });
});

describe("large lists", () => {
  const bulk = (userId, n, extra = () => ({})) =>
    h.tmp.client.$transaction(Array.from({ length: n }, (_, i) => h.tmp.client.lawTodo.create({ data: { userId, clientId: `bulk-${String(i).padStart(6, "0")}`, title: `مهمة ${i}`, sortOrder: i, updatedAt: new Date(Date.now() - 1e6 + i), ...extra(i) } })));

  test("a student with more than 1000 todos still receives everything, including a new one pushed with the highest sortOrder", async () => {
    const a = await student();
    await bulk(a.user.id, 1200);
    const r = await sync(a.token, [todo(U1, { sortOrder: 5000 })]);
    expect(r.body.applied).toBe(1);
    expect(r.body.items).toHaveLength(1201);
    expect(r.body.items.some((i) => i.clientId === U1)).toBe(true);
  });

  test("long-deleted and long-finished todos are removed for good; recent ones stay", async () => {
    const a = await student();
    const day = 86_400_000;
    await h.tmp.client.lawTodo.create({ data: { userId: a.user.id, clientId: "old-deleted-1", title: "x", deletedAt: new Date(Date.now() - 40 * day) } });
    await h.tmp.client.lawTodo.create({ data: { userId: a.user.id, clientId: "old-done-0001", title: "x", done: true, doneAt: new Date(Date.now() - 100 * day) } });
    await h.tmp.client.lawTodo.create({ data: { userId: a.user.id, clientId: "recent-done-1", title: "x", done: true, doneAt: new Date(Date.now() - 10 * day) } });
    await h.tmp.client.lawTodo.create({ data: { userId: a.user.id, clientId: "recent-del-01", title: "x", deletedAt: new Date(Date.now() - 5 * day) } });
    const r = await sync(a.token, [todo(U1)]);
    const ids = (await rows(a.user.id)).map((x) => x.clientId).sort();
    expect(ids).toEqual(["recent-del-01", "recent-done-1", U1].sort());
    expect(r.body.items.map((x) => x.clientId).sort()).toEqual(["recent-del-01", "recent-done-1", U1].sort());
  });

  test("a student cannot store more than 3000 live todos; the rest is reported, not silently dropped", async () => {
    const a = await student();
    await bulk(a.user.id, 3000);
    const r = await sync(a.token, [todo(U1)]);
    expect(r.body.applied).toBe(0);
    expect(r.body.rejected).toEqual([{ clientId: U1, reason: "too_many_todos" }]);
    // deleting one frees a slot
    await sync(a.token, [todo("bulk-000001", { deletedAt: iso(10), updatedAt: iso(10) })]);
    expect((await sync(a.token, [todo(U2)])).body.applied).toBe(1);
  });

  test("timestamps must be strings; a deletedAt in the future is clamped to now", async () => {
    const a = await student();
    const r = await sync(a.token, [todo(U1, { updatedAt: 12345 }), todo(U2, { deletedAt: true })]);
    expect(r.body.rejected.map((x) => x.reason).sort()).toEqual(["bad_deleted_at", "bad_updated_at"]);
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const ok = await sync(a.token, [todo("33333333-3333-4333-8333-333333333333", { deletedAt: future })]);
    expect(new Date(ok.body.items[0].deletedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("GET /law/todos", () => {
  test("lists my todos, hides soft-deleted ones", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1), todo(U2, { deletedAt: iso(500) })]);
    const r = await h.call("GET", "/law/todos", { token: a.token });
    expect(r.status).toBe(200);
    expect(r.body.items.map((i) => i.clientId)).toEqual([U1]);
  });
});

describe("account deletion", () => {
  test("deleting the user cascades to their todos", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    await sync(a.token, [todo(U1)]);
    await h.tmp.client.users.delete({ where: { id: a.user.id } });
    expect(await h.tmp.client.lawTodo.count()).toBe(0);
  });
});

describe("priority (RC4)", () => {
  test("defaults to normal, stores high/medium, rejects anything else", async () => {
    const a = await h.signUp("سلمى", "a@example.ma");
    const r = await sync(a.token, [todo(U1), todo(U2, { priority: "high" }), todo("33333333-3333-4333-8333-333333333333", { priority: "urgent" })]);
    expect(r.body.applied).toBe(2);
    expect(r.body.rejected).toEqual([expect.objectContaining({ reason: "bad_priority" })]);
    const byId = Object.fromEntries(r.body.items.map((t) => [t.clientId, t.priority]));
    expect(byId).toEqual({ [U1]: "normal", [U2]: "high" });
    const again = await sync(a.token, [todo(U2, { priority: "medium", updatedAt: iso(0) })]);
    expect(again.body.items.find((t) => t.clientId === U2).priority).toBe("medium");
  });
});
