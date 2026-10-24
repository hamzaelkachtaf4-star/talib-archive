// Phase 7: follows (public/private/reject/block), friends, suggestions, contact matching (flagged, HMAC only), notifications.
jest.mock("../../utils/prisma", () => {
  return new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] });
});

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { lawEndpoints } = require("../../endpoints/law");
const { resetRateLimits } = require("../../endpoints/law/auth");
const { LawAccount } = require("../../models/lawAccount");
const { LawSetting } = require("../../models/lawSetting");
const { LawEmailCode } = require("../../models/lawEmailCode");
const { setMailTransport } = require("../../utils/law/mailer");
const router = require("../../utils/law/ai/router");
const { closeFts } = require("../../utils/law/fts");
const fs = require("fs");
const pathMod = require("path");
const { setFdcFetch } = require("../../endpoints/law/timetable");

jest.setTimeout(60000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
let tmp;
let server;
let base;
let mails;
let aiReply;
let aiCalls;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json };
}

const lastCode = () => mails.at(-1).text.match(/\b(\d{6})\b/)[1];
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function signUp(name, email) {
  const r = await call("POST", "/law/auth/register", {
    body: { fullName: name, email, password: PASSWORD },
  });
  expect(r.status).toBe(202);
  const v = await call("POST", "/law/auth/register/verify", {
    body: { email, code: lastCode() },
  });
  expect(v.status).toBe(201);
  return v.body;
}

beforeEach(async () => {
  process.env = {
    ...ENV,
    JWT_SECRET: "test-secret-for-qanouni",
    GEMINI_API_KEY: "k",
    GEMINI_MODEL_MULTIMODAL: "gemini-flash",
  };
  delete process.env.AUTH_TOKEN;
  tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;
  resetRateLimits();
  mails = [];
  setMailTransport(async (m) => {
    mails.push(m);
    return { delivered: true };
  });
  aiCalls = [];
  aiReply = null;
  router.setClientFactory({
    gemini: () => ({
      generate: async (req) => {
        aiCalls.push(req);
        return { text: JSON.stringify(aiReply), json: aiReply, model: "fake", usage: { tokensIn: 10, tokensOut: 10 } };
      },
    }),
    deepseek: () => ({ generate: async () => { throw new Error("unused"); } }),
  });
  await LawSetting.update({ aiBudgetGeminiUsd: 5 });
  await LawAccount.enableMultiUserMode();
  const app = express();
  app.use(bodyParser.json({ limit: "20mb" }));
  const r = express.Router();
  lawEndpoints(r);
  app.use("/api", r);
  server = http.createServer(app);
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  setMailTransport(null);
  await new Promise((r) => server.close(r));
  closeFts();
  await tmp.cleanup();
  globalThis.__lawTestPrisma = null;
  process.env = ENV;
});




const F = (token, id) => call("POST", `/law/social/follow/${id}`, { token });
async function trio() {
  const a = await signUp("سلمى", "a@example.ma");
  const b = await signUp("يوسف", "b@example.ma");
  const c = await signUp("أمينة", "c@example.ma");
  return { a, b, c };
}
const setPrivate = (u, v) => tmp.client.lawUserProfile.updateMany({ where: { userId: u.user.id }, data: { isPrivate: v } });

describe("follow flows", () => {
  test("public target: accepted at once; mutual follows are friends; unfollow", async () => {
    const { a, b } = await trio();
    expect((await F(a.token, b.user.id)).body.status).toBe("following");
    expect((await F(a.token, b.user.id)).body.status).toBe("following"); // idempotent
    expect((await call("GET", "/law/social/friends", { token: a.token })).body.friends).toEqual([]);
    expect((await F(b.token, a.user.id)).body.status).toBe("friends");
    expect((await call("GET", "/law/social/friends", { token: a.token })).body.friends.map((f) => f.userId)).toEqual([b.user.id]);
    expect((await call("GET", "/law/social/friends", { token: b.token })).body.friends.map((f) => f.userId)).toEqual([a.user.id]);
    const n = await call("GET", "/law/notifications", { token: b.token });
    expect(n.body.items[0]).toMatchObject({ type: "NEW_FOLLOWER", payload: { userId: a.user.id } });
    expect((await call("DELETE", `/law/social/follow/${b.user.id}`, { token: a.token })).body.status).toBe("none");
    expect((await call("GET", "/law/social/friends", { token: b.token })).body.friends).toEqual([]);
    expect((await F(a.token, a.user.id)).status).toBe(400);
    expect((await F(a.token, 99999)).status).toBe(404);
  });

  test("private target: pending + request notification; only the followee can accept; accept notifies the follower", async () => {
    const { a, b, c } = await trio();
    await setPrivate(b, true);
    expect((await F(a.token, b.user.id)).body.status).toBe("pending");
    const reqs = (await call("GET", "/law/social/requests", { token: b.token })).body.requests;
    expect(reqs).toHaveLength(1);
    expect(reqs[0].from).toMatchObject({ userId: a.user.id, name: "سلمى" });
    expect((await call("GET", "/law/notifications", { token: b.token })).body.items[0].type).toBe("FOLLOW_REQUEST");
    // not the follower, not a bystander
    expect((await call("POST", `/law/social/requests/${reqs[0].id}/accept`, { token: a.token })).status).toBe(404);
    expect((await call("POST", `/law/social/requests/${reqs[0].id}/accept`, { token: c.token })).status).toBe(404);
    expect((await call("POST", `/law/social/requests/${reqs[0].id}/accept`, { token: b.token })).status).toBe(200);
    expect((await call("POST", `/law/social/requests/${reqs[0].id}/accept`, { token: b.token })).status).toBe(404); // already decided
    expect((await call("GET", "/law/notifications", { token: a.token })).body.items[0]).toMatchObject({ type: "FOLLOW_ACCEPTED", payload: { userId: b.user.id } });
    await F(b.token, a.user.id);
    expect((await call("GET", "/law/social/friends", { token: a.token })).body.friends).toHaveLength(1);
  });

  test("private target: reject keeps the follower out, with a 7-day cooldown", async () => {
    const { a, b } = await trio();
    await setPrivate(b, true);
    await F(a.token, b.user.id);
    const id = (await call("GET", "/law/social/requests", { token: b.token })).body.requests[0].id;
    expect((await call("POST", `/law/social/requests/${id}/reject`, { token: b.token })).status).toBe(200);
    expect((await call("GET", "/law/social/requests", { token: b.token })).body.requests).toEqual([]);
    const again = await F(a.token, b.user.id);
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe("request_cooldown");
    // after the cooldown a new request is allowed
    await tmp.client.lawFollow.updateMany({ data: { decidedAt: new Date(Date.now() - 8 * 86400000) } });
    expect((await F(a.token, b.user.id)).body.status).toBe("pending");
  });

  test("block: removes follows both ways, hides the user, refuses new follows (404), is reversible", async () => {
    const { a, b, c } = await trio();
    await F(a.token, b.user.id);
    await F(b.token, a.user.id);
    await tmp.client.lawUserProfile.updateMany({ where: { userId: b.user.id }, data: { handle: "yousef" } });
    expect((await call("POST", `/law/social/block/${b.user.id}`, { token: a.token })).status).toBe(200);
    expect(await tmp.client.lawFollow.count()).toBe(0);
    expect((await F(a.token, b.user.id)).status).toBe(404);
    expect((await F(b.token, a.user.id)).status).toBe(404); // the blocked side cannot tell
    expect((await call("GET", "/law/social/find?q=yousef", { token: a.token })).body.results).toEqual([]);
    expect((await call("GET", "/law/social/blocked", { token: a.token })).body.blocked.map((x) => x.userId)).toEqual([b.user.id]);
    const sug = (await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions.map((s) => s.userId);
    expect(sug).toEqual([c.user.id]);
    expect((await call("GET", "/law/social/suggestions", { token: b.token })).body.suggestions.map((s) => s.userId)).toEqual([c.user.id]);
    expect((await call("DELETE", `/law/social/block/${b.user.id}`, { token: a.token })).status).toBe(200);
    expect((await F(a.token, b.user.id)).body.status).toBe("following");
  });

  test("a pending request disappears from the blocker's inbox when they block the requester", async () => {
    const { a, b } = await trio();
    await setPrivate(b, true);
    await F(a.token, b.user.id);
    await call("POST", `/law/social/block/${a.user.id}`, { token: b.token });
    expect((await call("GET", "/law/social/requests", { token: b.token })).body.requests).toEqual([]);
  });
});

describe("find and suggestions", () => {
  test("find by handle prefix (discoverable only) or exact friend code", async () => {
    const { a, b, c } = await trio();
    await tmp.client.lawUserProfile.updateMany({ where: { userId: b.user.id }, data: { handle: "yousef.law" } });
    await tmp.client.lawUserProfile.updateMany({ where: { userId: c.user.id }, data: { handle: "yousra", discoverable: false, friendCode: "QAN-AMINA-1234" } });
    const r = await call("GET", "/law/social/find?q=@yous", { token: a.token });
    expect(r.body.results.map((x) => x.userId)).toEqual([b.user.id]); // yousra is hidden
    expect(r.body.results[0]).toMatchObject({ handle: "yousef.law", status: "none" });
    expect(r.body.results[0].email).toBeUndefined();
    expect((await call("GET", "/law/social/find?q=QAN-AMINA-1234", { token: a.token })).body.results.map((x) => x.userId)).toEqual([c.user.id]);
    expect((await call("GET", "/law/social/find?q=yo", { token: a.token })).body.results).toEqual([]); // too short
  });

  test("suggestions rank academic match + diligence + mutual friends, exclude followed/pending/self, never leak private fields", async () => {
    const { a, b, c } = await trio();
    const d = await signUp("خالد", "d@example.ma");
    const set = (u, data) => tmp.client.lawUserProfile.updateMany({ where: { userId: u.user.id }, data });
    const acad = { facultyCode: "FSJES_AIN_CHOCK", semester: "S3", track: "PRIVE", studyLang: "AR", tdGroup: "G01" };
    await set(a, acad);
    await set(b, acad); // perfect match
    await set(c, { ...acad, semester: "S5", tdGroup: "G02" }); // partial
    await set(d, { facultyCode: "OTHER", semester: "S1", track: "PUBLIC", studyLang: "FR", tdGroup: "G09" });
    const sug = (await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions;
    expect(sug.map((s) => s.userId)).toEqual([b.user.id, c.user.id, d.user.id]);
    expect(sug[0].reasons[0]).toEqual({ code: "same_group" });
    expect(sug[0]).not.toHaveProperty("email");
    // diligence lifts a weaker candidate above a stronger one
    await tmp.client.lawStreak.create({ data: { userId: d.user.id, current: 60 } });
    await tmp.client.lawStudyDay.create({ data: { userId: d.user.id, date: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date()) } });
    const sug2 = (await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions;
    expect(sug2.find((s) => s.userId === d.user.id).score).toBe(35); // 25 streak + 10 recent activity
    // followed / pending are excluded
    await F(a.token, b.user.id);
    await setPrivate(c, true);
    await F(a.token, c.user.id);
    expect((await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions.map((s) => s.userId)).toEqual([d.user.id]);
    // mutual friends: a-b friends; b follows d => d gets +8 for a
    await F(b.token, a.user.id);
    await F(b.token, d.user.id);
    const s3 = (await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions[0];
    expect(s3.reasons).toEqual(expect.arrayContaining([{ code: "mutual_friends", count: 1 }]));
    expect(s3.score).toBe(43);
    // discoverable=false users are never suggested
    await set(d, { discoverable: false });
    expect((await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions).toEqual([]);
  });
});

describe("contact matching (flagged, HMAC only)", () => {
  test("off by default", async () => {
    const { a } = await trio();
    expect((await call("POST", "/law/social/phone", { token: a.token, body: { phone: "0612345678" } })).status).toBe(404);
    expect((await call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["0612345678"] } })).status).toBe(404);
    expect((await call("GET", "/law/social/config", { token: a.token })).body.contactMatch).toBe(false);
  });

  test("phone normalization", () => {
    const { normalizePhone } = require("../../models/lawSocial").LawSocial;
    expect(normalizePhone("06 12-34 56 78")).toBe("+212612345678");
    expect(normalizePhone("+212 6 12 34 56 78")).toBe("+212612345678");
    expect(normalizePhone("00212712345678")).toBe("+212712345678");
    expect(normalizePhone("212512345678")).toBe("+212512345678");
    expect(normalizePhone("+33612345678")).toBe("+33612345678");
    for (const bad of ["", "abc", "0412345678", "+2129", "06123", null, "+0123456789"]) expect(normalizePhone(bad)).toBeNull();
  });

  test("opt-in, discoverable-only, no raw numbers stored, 3 matches/day, 500 numbers max, blocks respected", async () => {
    process.env.FEATURE_CONTACT_MATCH = "true";
    process.env.PHONE_HASH_KEY = "test-key-0123456789abcdef-0123456789abcdef";
    const { a, b, c } = await trio();
    expect((await call("POST", "/law/social/phone", { token: b.token, body: { phone: "garbage" } })).status).toBe(400);
    expect((await call("POST", "/law/social/phone", { token: b.token, body: { phone: "0612345678" } })).status).toBe(200);
    // same number from another student: same answer as success (no oracle), nothing stored or changed
    expect((await call("POST", "/law/social/phone", { token: c.token, body: { phone: "+212 612 345 678" } })).status).toBe(200);
    expect((await tmp.client.lawPhoneHash.findMany()).map((r) => r.userId)).toEqual([b.user.id]);
    // nothing recognizable is stored
    const rows = await tmp.client.lawPhoneHash.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).toMatch(/^[0-9a-f]{64}$/);
    const dump = JSON.stringify(await tmp.client.lawPhoneHash.findMany()) + JSON.stringify(await tmp.client.lawSetting.findMany());
    expect(dump).not.toContain("612345678");

    const m = await call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["06 12 34 56 78", "0699999999", "junk"] } });
    expect(m.status).toBe(200);
    expect(m.body.matches.map((x) => x.userId)).toEqual([b.user.id]);
    // the uploaded list is not stored anywhere (settings only hold the counter)
    expect(JSON.stringify(await tmp.client.lawSetting.findMany())).not.toContain("0699999999");
    // not discoverable => not matched
    await tmp.client.lawUserProfile.updateMany({ where: { userId: b.user.id }, data: { discoverable: false } });
    expect((await call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["0612345678"] } })).body.matches).toEqual([]);
    await tmp.client.lawUserProfile.updateMany({ where: { userId: b.user.id }, data: { discoverable: true } });
    // rate limit: the 4th call of the day
    expect((await call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["0612345678"] } })).status).toBe(200);
    expect((await call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["0612345678"] } })).status).toBe(429);
    // limits and validation
    expect((await call("POST", "/law/social/contacts/match", { token: c.token, body: { numbers: Array.from({ length: 501 }, () => "0612345678") } })).status).toBe(400);
    expect((await call("POST", "/law/social/contacts/match", { token: c.token, body: { numbers: [] } })).status).toBe(400);
    // blocked users are not returned; removing the phone removes the hash
    await call("POST", `/law/social/block/${b.user.id}`, { token: c.token });
    expect((await call("POST", "/law/social/contacts/match", { token: c.token, body: { numbers: ["0612345678"] } })).body.matches).toEqual([]);
    expect((await call("DELETE", "/law/social/phone", { token: b.token })).status).toBe(200);
    expect(await tmp.client.lawPhoneHash.count()).toBe(0);
    delete process.env.FEATURE_CONTACT_MATCH;
    delete process.env.PHONE_HASH_KEY; delete process.env.PHONE_HASH_PEPPER;
  });

  test("without a pepper the feature refuses (503) instead of hashing with a default", async () => {
    process.env.FEATURE_CONTACT_MATCH = "true";
    delete process.env.PHONE_HASH_KEY; delete process.env.PHONE_HASH_PEPPER;
    const { a } = await trio();
    expect((await call("POST", "/law/social/phone", { token: a.token, body: { phone: "0612345678" } })).status).toBe(503);
    expect((await call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["0612345678"] } })).status).toBe(503);
    delete process.env.FEATURE_CONTACT_MATCH;
  });
});

describe("notifications and legacy bridge", () => {
  test("read state is per user", async () => {
    const { a, b } = await trio();
    await F(a.token, b.user.id);
    const n = (await call("GET", "/law/notifications", { token: b.token })).body;
    expect(n.unread).toBe(1);
    expect((await call("POST", "/law/notifications/read", { token: a.token, body: { ids: [n.items[0].id] } })).body.updated).toBe(0); // not a's
    expect((await call("POST", "/law/notifications/read", { token: b.token, body: {} })).body.updated).toBe(1);
    expect((await call("GET", "/law/notifications", { token: b.token })).body.unread).toBe(0);
  });

  test("friend-code friendships are mirrored into the follow graph and migrated idempotently", async () => {
    const { a, b } = await trio();
    const code = (await call("GET", "/law/profile", { token: b.token })).body.progress.friendCode;
    expect((await call("POST", "/law/friends", { token: a.token, body: { code } })).body.status).toBe("pending");
    const incoming = (await call("GET", "/law/friends", { token: b.token })).body.incoming[0];
    await call("POST", `/law/friends/${incoming.friendshipId}/respond`, { token: b.token, body: { accept: true } });
    expect((await call("GET", "/law/social/friends", { token: a.token })).body.friends.map((f) => f.userId)).toEqual([b.user.id]);
    // removing the legacy friendship removes both follows
    await call("DELETE", `/law/friends/${incoming.friendshipId}`, { token: a.token });
    expect((await call("GET", "/law/social/friends", { token: a.token })).body.friends).toEqual([]);

    // legacy accepted rows with no follows (pre-Phase-7 data): dry run counts, real run creates, rerun is a no-op
    await tmp.client.lawFriendship.create({ data: { requesterId: a.user.id, addresseeId: b.user.id, status: "accepted" } });
    const { migrateFriendships } = require("../../utils/law/scripts/migrateFriendships");
    expect(await migrateFriendships(tmp.client, { dryRun: true })).toMatchObject({ friendships: 1, followsToCreate: 2, dryRun: true });
    expect(await tmp.client.lawFollow.count()).toBe(0);
    expect(await migrateFriendships(tmp.client)).toMatchObject({ followsToCreate: 2 });
    expect(await migrateFriendships(tmp.client)).toMatchObject({ followsToCreate: 0, alreadyAccepted: 2 });
    // the leaderboard sees follow-only friends too
    await tmp.client.lawFriendship.deleteMany();
    expect((await call("GET", "/law/friends", { token: a.token })).body.friends.map((f) => f.name)).toEqual(["يوسف"]);
  });
});

describe("audit regressions", () => {
  test("a block also cuts the legacy friend-code flow (existing friendships, new requests, leaderboard)", async () => {
    const { a, b } = await trio();
    const codeA = (await call("GET", "/law/profile", { token: a.token })).body.progress.friendCode;
    const codeB = (await call("GET", "/law/profile", { token: b.token })).body.progress.friendCode;
    await call("POST", "/law/friends", { token: a.token, body: { code: codeB } });
    const inc = (await call("GET", "/law/friends", { token: b.token })).body.incoming[0];
    await call("POST", `/law/friends/${inc.friendshipId}/respond`, { token: b.token, body: { accept: true } });
    expect((await call("GET", "/law/friends", { token: b.token })).body.friends).toHaveLength(1);
    await call("POST", `/law/social/block/${a.user.id}`, { token: b.token });
    expect((await call("GET", "/law/friends", { token: a.token })).body.friends).toEqual([]);
    expect((await call("GET", "/law/friends", { token: b.token })).body.friends).toEqual([]);
    expect(await tmp.client.lawFriendship.count()).toBe(0);
    // neither side can open a legacy request towards the other
    expect((await call("POST", "/law/friends", { token: a.token, body: { code: codeB } })).status).toBe(404);
    expect((await call("POST", "/law/friends", { token: b.token, body: { code: codeA } })).status).toBe(404);
  });

  test("unfollow does not reset the rejection cooldown; follow/unfollow loops do not spam notifications; legacy friendship ends with the follow", async () => {
    const { a, b } = await trio();
    await setPrivate(b, true);
    await F(a.token, b.user.id);
    const id = (await call("GET", "/law/social/requests", { token: b.token })).body.requests[0].id;
    await call("POST", `/law/social/requests/${id}/reject`, { token: b.token });
    await call("DELETE", `/law/social/follow/${b.user.id}`, { token: a.token });
    expect((await F(a.token, b.user.id)).status).toBe(429);
    // public target: loop 5 times => one notification
    const c = await student();
    for (let i = 0; i < 5; i++) { await F(a.token, c.user.id); await call("DELETE", `/law/social/follow/${c.user.id}`, { token: a.token }); }
    expect((await call("GET", "/law/notifications", { token: c.token })).body.items.filter((n) => n.type === "NEW_FOLLOWER")).toHaveLength(1);
    // unfollowing a legacy friend removes the legacy row too
    await tmp.client.lawFriendship.create({ data: { requesterId: a.user.id, addresseeId: c.user.id, status: "accepted" } });
    await call("DELETE", `/law/social/follow/${c.user.id}`, { token: a.token });
    expect(await tmp.client.lawFriendship.count()).toBe(0);
    async function student() { return signUp("ج", "c2@example.ma"); }
  });

  test("contact matching: parallel requests cannot exceed the daily allowance; friend-code lookups are rate limited; private profiles are not suggested", async () => {
    process.env.FEATURE_CONTACT_MATCH = "true";
    process.env.PHONE_HASH_KEY = "test-key-0123456789abcdef-0123456789abcdef";
    const { a, b, c } = await trio();
    const rs = await Promise.all(Array.from({ length: 8 }, () => call("POST", "/law/social/contacts/match", { token: a.token, body: { numbers: ["0612345678"] } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(3);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(5);
    delete process.env.FEATURE_CONTACT_MATCH; delete process.env.PHONE_HASH_KEY; delete process.env.PHONE_HASH_PEPPER;
    let last;
    for (let i = 0; i < 31; i++) last = await call("GET", `/law/social/find?q=QAN-AMINA-${1000 + i}`, { token: a.token });
    expect(last.status).toBe(429);
    await tmp.client.lawUserProfile.updateMany({ where: { userId: c.user.id }, data: { isPrivate: true } });
    expect((await call("GET", "/law/social/suggestions", { token: a.token })).body.suggestions.map((s) => s.userId)).toEqual([b.user.id]);
  });
});
