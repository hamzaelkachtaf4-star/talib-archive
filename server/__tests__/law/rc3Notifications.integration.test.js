// RC3 Phase 1: per-item and bulk mark-as-read for the notification popover.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

async function twoWithNotifications() {
  const a = await h.signUp("سلمى", "a@example.ma");
  const b = await h.signUp("يوسف", "b@example.ma");
  const c = await h.signUp("أمينة", "c@example.ma");
  // a and c follow b: b gets two NEW_FOLLOWER notifications
  await h.call("POST", `/law/social/follow/${b.user.id}`, { token: a.token });
  await h.call("POST", `/law/social/follow/${b.user.id}`, { token: c.token });
  return { a, b, c };
}

describe("PATCH /law/notifications/:id/read", () => {
  test("marks one of my notifications as read and leaves the others", async () => {
    const { b } = await twoWithNotifications();
    const before = (await h.call("GET", "/law/notifications", { token: b.token })).body;
    expect(before.unread).toBe(2);
    const r = await h.call("PATCH", `/law/notifications/${before.items[0].id}/read`, { token: b.token });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(1);
    expect((await h.call("GET", "/law/notifications", { token: b.token })).body.unread).toBe(1);
  });

  test("is idempotent", async () => {
    const { b } = await twoWithNotifications();
    const id = (await h.call("GET", "/law/notifications", { token: b.token })).body.items[0].id;
    await h.call("PATCH", `/law/notifications/${id}/read`, { token: b.token });
    const again = await h.call("PATCH", `/law/notifications/${id}/read`, { token: b.token });
    expect(again.status).toBe(200);
    expect(again.body.updated).toBe(0);
  });

  test("cannot touch someone else's notification (404, nothing changes)", async () => {
    const { a, b } = await twoWithNotifications();
    const id = (await h.call("GET", "/law/notifications", { token: b.token })).body.items[0].id;
    const r = await h.call("PATCH", `/law/notifications/${id}/read`, { token: a.token });
    expect(r.status).toBe(404);
    expect((await h.call("GET", "/law/notifications", { token: b.token })).body.unread).toBe(2);
  });

  test("unknown id is 404 and a missing token is 401", async () => {
    const { b } = await twoWithNotifications();
    expect((await h.call("PATCH", "/law/notifications/nope/read", { token: b.token })).status).toBe(404);
    expect((await h.call("PATCH", "/law/notifications/x/read")).status).toBe(401);
  });
});

describe("POST /law/notifications/read-all", () => {
  test("marks only my unread notifications", async () => {
    const { a, b } = await twoWithNotifications();
    await h.call("POST", `/law/social/follow/${a.user.id}`, { token: b.token }); // a gets one too
    const r = await h.call("POST", "/law/notifications/read-all", { token: b.token });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(2);
    expect((await h.call("GET", "/law/notifications", { token: b.token })).body.unread).toBe(0);
    expect((await h.call("GET", "/law/notifications", { token: a.token })).body.unread).toBe(1);
  });

  test("requires a token", async () => {
    expect((await h.call("POST", "/law/notifications/read-all")).status).toBe(401);
  });
});
