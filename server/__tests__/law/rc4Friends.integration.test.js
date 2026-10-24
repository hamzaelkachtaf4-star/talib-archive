// RC4 Phase 8: a friend request by share code reaches the other student's notifications and can be answered from there.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const api = (u, method, path, body) => h.call(method, path, { token: u.token, body });
async function pair() {
  const a = await h.signUp("سلمى", "fa@example.ma");
  const b = await h.signUp("يوسف", "fb@example.ma");
  const code = (await api(a, "GET", "/law/friends/code")).body.shareCode;
  return { a, b, code };
}

describe("friend request notifications", () => {
  test("a request notifies the addressee with the friendship id; accepting notifies the requester", async () => {
    const { a, b, code } = await pair();
    expect((await api(b, "POST", "/law/friends", { code })).body.status).toBe("pending");
    const n = (await api(a, "GET", "/law/notifications")).body;
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ type: "FRIEND_REQUEST", payload: { name: "يوسف", userId: b.user.id } });
    const fid = n.items[0].payload.friendshipId;
    expect(fid).toBeTruthy();
    expect((await api(a, "POST", `/law/friends/${fid}/respond`, { accept: true })).status).toBe(200);
    const back = (await api(b, "GET", "/law/notifications")).body;
    expect(back.items[0]).toMatchObject({ type: "FRIEND_ACCEPTED", payload: { name: "سلمى" } });
  });

  test("declining sends nothing to the requester; asking twice does not notify twice", async () => {
    const { a, b, code } = await pair();
    await api(b, "POST", "/law/friends", { code });
    await api(b, "POST", "/law/friends", { code });
    const n = (await api(a, "GET", "/law/notifications")).body;
    expect(n.items.filter((x) => x.type === "FRIEND_REQUEST")).toHaveLength(1);
    await api(a, "POST", `/law/friends/${n.items[0].payload.friendshipId}/respond`, { accept: false });
    expect((await api(b, "GET", "/law/notifications")).body.items).toHaveLength(0);
  });

  test("asking someone who already asked you accepts at once and tells them", async () => {
    const { a, b, code } = await pair();
    const bcode = (await api(b, "GET", "/law/friends/code")).body.shareCode;
    await api(b, "POST", "/law/friends", { code });
    expect((await api(a, "POST", "/law/friends", { code: bcode })).body.status).toBe("accepted");
    expect((await api(b, "GET", "/law/notifications")).body.items.map((x) => x.type)).toContain("FRIEND_ACCEPTED");
  });
});
