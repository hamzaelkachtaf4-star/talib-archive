// Qanouni accounts upgrade: email-verified sign-up (6-digit codes, lockout, resend cooldown), password policy
// and reset, QR quick login, profile XP / levels / study buddies, and the AI timetable import. All through the
// real /api/law routes with upstream's validatedRequest in multi-user mode.
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

describe("email-verified sign-up", () => {
  test("nothing is created before the code; the code creates the account once", async () => {
    const r = await call("POST", "/law/auth/register", {
      body: { fullName: "سلمى", email: "Salma@Example.ma", password: PASSWORD },
    });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ verification: "email", email: "salma@example.ma", resendInSec: 60 });
    expect(r.body.devCode).toBeUndefined();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("salma@example.ma");
    expect(await tmp.client.lawUserProfile.count()).toBe(0);
    // Only an HMAC is stored, never the code or the password.
    const row = await tmp.client.lawEmailCode.findFirst();
    expect(row.codeHash).not.toContain(lastCode());
    expect(row.payload).not.toContain(PASSWORD);

    const code = lastCode();
    const ok = await call("POST", "/law/auth/register/verify", { body: { email: "salma@example.ma", code } });
    expect(ok.status).toBe(201);
    expect(ok.body.user).toMatchObject({ email: "salma@example.ma", fullName: "سلمى", role: "default" });
    const login = await call("POST", "/law/auth/login", { body: { email: "salma@example.ma", password: PASSWORD } });
    expect(login.status).toBe(200);
    // Single use.
    expect((await call("POST", "/law/auth/register/verify", { body: { email: "salma@example.ma", code } })).status).toBe(400);
  });

  test("5 wrong codes lock the email for 15 minutes, even for the right code", async () => {
    await call("POST", "/law/auth/register", { body: { fullName: "x", email: "a@example.ma", password: PASSWORD } });
    const code = lastCode();
    const left = [];
    for (let i = 0; i < 4; i++) {
      const r = await call("POST", "/law/auth/register/verify", { body: { email: "a@example.ma", code: wrong(code) } });
      expect(r.status).toBe(400);
      left.push(r.body.attemptsLeft);
    }
    expect(left).toEqual([4, 3, 2, 1]);
    const fifth = await call("POST", "/law/auth/register/verify", { body: { email: "a@example.ma", code: wrong(code) } });
    expect(fifth.status).toBe(423);
    expect(fifth.body.retryAfterSec).toBeGreaterThan(14 * 60);
    expect((await call("POST", "/law/auth/register/verify", { body: { email: "a@example.ma", code } })).status).toBe(423);
    expect((await call("POST", "/law/auth/register/resend", { body: { email: "a@example.ma" } })).status).toBe(423);
    // After the lock: a fresh code works.
    await tmp.client.lawEmailCode.updateMany({
      data: { lockedUntil: new Date(Date.now() - 1000), lastSentAt: new Date(Date.now() - 120_000) },
    });
    expect((await call("POST", "/law/auth/register/resend", { body: { email: "a@example.ma" } })).status).toBe(202);
    expect((await call("POST", "/law/auth/register/verify", { body: { email: "a@example.ma", code: lastCode() } })).status).toBe(201);
  });

  test("parallel guesses never exceed 5 comparisons", async () => {
    await call("POST", "/law/auth/register", { body: { fullName: "x", email: "p@example.ma", password: PASSWORD } });
    const code = lastCode();
    const guesses = Array.from({ length: 8 }, (_, i) => String((Number(code) + 1 + i) % 1e6).padStart(6, "0"));
    // SQLite may refuse some concurrent writes ("locked"); none of them may ever succeed.
    const results = await Promise.allSettled(
      guesses.map((g) => LawEmailCode.verify({ purpose: "register", email: "p@example.ma", code: g }))
    );
    expect(results.some((r) => r.status === "fulfilled" && !r.value.error)).toBe(false);
    const compared = results.filter((r) => r.status === "fulfilled" && r.value.error === "invalid_code");
    expect(compared.length).toBeLessThanOrEqual(5);
    // Whatever landed counts: keep guessing until the lock, then even the right code is refused.
    let r;
    for (let i = 0; i < 6 && r?.error !== "locked"; i++)
      r = await LawEmailCode.verify({ purpose: "register", email: "p@example.ma", code: wrong(code) });
    expect(r.error).toBe("locked");
    expect((await LawEmailCode.verify({ purpose: "register", email: "p@example.ma", code })).error).toBe("locked");
  });

  test("resend cooldown of 60 s; a new code replaces the old one; expired codes", async () => {
    await call("POST", "/law/auth/register", { body: { fullName: "x", email: "c@example.ma", password: PASSWORD } });
    const first = lastCode();
    const early = await call("POST", "/law/auth/register/resend", { body: { email: "c@example.ma" } });
    expect(early.status).toBe(429);
    expect(early.body).toMatchObject({ error: "cooldown" });
    expect(early.body.retryAfterSec).toBeGreaterThan(50);
    await tmp.client.lawEmailCode.updateMany({ data: { lastSentAt: new Date(Date.now() - 61_000) } });
    expect((await call("POST", "/law/auth/register/resend", { body: { email: "c@example.ma" } })).status).toBe(202);
    const second = lastCode();
    if (second !== first)
      expect((await call("POST", "/law/auth/register/verify", { body: { email: "c@example.ma", code: first } })).status).toBe(400);
    await tmp.client.lawEmailCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call("POST", "/law/auth/register/verify", { body: { email: "c@example.ma", code: second } })).status).toBe(410);
    // Resend for an email with no pending sign-up is refused.
    expect((await call("POST", "/law/auth/register/resend", { body: { email: "nobody@example.ma" } })).status).toBe(400);
  });

  test("code requests are rate limited per email", async () => {
    await call("POST", "/law/auth/register", { body: { fullName: "x", email: "r@example.ma", password: PASSWORD } });
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      await tmp.client.lawEmailCode.updateMany({ data: { lastSentAt: new Date(Date.now() - 61_000) } });
      statuses.push((await call("POST", "/law/auth/register/resend", { body: { email: "r@example.ma" } })).body.error || "ok");
    }
    expect(statuses.slice(0, 4)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(statuses.slice(4)).toEqual(["too_many_attempts", "too_many_attempts"]);
  });

  test("password policy: weak passwords are refused before any code is sent", async () => {
    for (const pw of ["Short1!", "alllowercase1!", "ALLUPPERCASE1!", "NoDigits!!", "NoSpecial123", "A1!" + "a".repeat(62)]) {
      const r = await call("POST", "/law/auth/register", { body: { fullName: "x", email: "w@example.ma", password: pw } });
      expect([r.status, r.body.error]).toEqual([400, "weak_password"]);
    }
    expect(mails).toHaveLength(0);
    // The owner setup and password change follow the same policy.
    const s = await signUp("ب", "b@example.ma");
    const change = await call("POST", "/law/auth/password", {
      token: s.token,
      body: { currentPassword: PASSWORD, newPassword: "weakpassword" },
    });
    expect([change.status, change.body.error]).toEqual([400, "weak_password"]);
  });

  test("registration closed, taken email", async () => {
    await signUp("أ", "taken@example.ma");
    expect((await call("POST", "/law/auth/register", { body: { fullName: "x", email: "TAKEN@example.ma", password: PASSWORD } })).status).toBe(409);
    await LawSetting.update({ registrationOpen: false });
    expect((await call("POST", "/law/auth/register", { body: { fullName: "x", email: "n@example.ma", password: PASSWORD } })).status).toBe(403);
  });
});

describe("forgotten password", () => {
  test("same answer for unknown emails; code + strong password resets and signs in", async () => {
    await signUp("د", "d@example.ma");
    mails = [];
    const unknown = await call("POST", "/law/auth/password/forgot", { body: { email: "ghost@example.ma" } });
    expect(unknown.status).toBe(202);
    expect(mails).toHaveLength(0);
    const known = await call("POST", "/law/auth/password/forgot", { body: { email: "d@example.ma" } });
    expect(known.status).toBe(202);
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).concat(["delivered"]).sort());
    const code = lastCode();
    // A weak new password does not burn an attempt.
    const weak = await call("POST", "/law/auth/password/reset", { body: { email: "d@example.ma", code, newPassword: "weak" } });
    expect(weak.body.error).toBe("weak_password");
    expect((await tmp.client.lawEmailCode.findFirst()).attempts).toBe(0);
    const ok = await call("POST", "/law/auth/password/reset", {
      body: { email: "d@example.ma", code, newPassword: "Nouveau-Secret-9" },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect((await call("POST", "/law/auth/login", { body: { email: "d@example.ma", password: PASSWORD } })).status).toBe(401);
    expect((await call("POST", "/law/auth/login", { body: { email: "d@example.ma", password: "Nouveau-Secret-9" } })).status).toBe(200);
  });
});

describe("QR quick login", () => {
  async function generate() {
    const r = await call("POST", "/law/auth/qr/generate", {
      body: { origin: "https://qanouni.example" },
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0 Safari/537.36" },
    });
    expect(r.status).toBe(201);
    return r.body;
  }
  const poll = (qr, secret) =>
    call("GET", `/law/auth/qr/status/${qr.qrToken}`, { headers: { "x-qr-secret": secret ?? qr.pollSecret } });

  test("scan → approve → the waiting device gets one session for the approver", async () => {
    const phone = await signUp("هاتف", "phone@example.ma");
    const qr = await generate();
    expect(qr.link).toBe(`https://qanouni.example/law/qr/${qr.qrToken}`);
    expect(qr.svg).toContain("<svg");
    expect((await poll(qr)).body).toEqual({ status: "pending" });
    // The token alone (a photo of the QR) never yields a session.
    expect((await poll(qr, "x".repeat(32))).status).toBe(404);
    expect((await call("POST", "/law/auth/qr/inspect", { body: { qrToken: qr.qrToken } })).status).toBe(401);
    const info = await call("POST", "/law/auth/qr/inspect", { token: phone.token, body: { qrToken: qr.qrToken } });
    expect(info.body.requesterAgent).toBe("Chrome · macOS");
    expect((await call("POST", "/law/auth/qr/authorize", { token: phone.token, body: { qrToken: qr.qrToken } })).status).toBe(200);
    const done = await poll(qr);
    expect(done.body.status).toBe("approved");
    const me = await call("GET", "/law/auth/me", { token: done.body.token });
    expect(me.body.user.id).toBe(phone.user.id);
    // Single use, both ways.
    expect((await poll(qr)).status).toBe(404);
    expect((await call("POST", "/law/auth/qr/authorize", { token: phone.token, body: { qrToken: qr.qrToken } })).status).toBe(404);
  });

  test("denied and expired QRs", async () => {
    const phone = await signUp("هاتف", "phone2@example.ma");
    const a = await generate();
    await call("POST", "/law/auth/qr/authorize", { token: phone.token, body: { qrToken: a.qrToken, approve: false } });
    expect((await poll(a)).body).toEqual({ status: "denied" });
    const b = await generate();
    await tmp.client.lawQrLogin.updateMany({ where: { status: "pending" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await poll(b)).body).toEqual({ status: "expired" });
    expect((await call("POST", "/law/auth/qr/authorize", { token: phone.token, body: { qrToken: b.qrToken } })).status).toBe(404);
    // Only hashes are stored.
    const rows = await tmp.client.lawQrLogin.findMany();
    expect(JSON.stringify(rows)).not.toContain(b.qrToken);
    expect(JSON.stringify(rows)).not.toContain(b.pollSecret);
  });
});

describe("profile, XP and study buddies", () => {
  test("XP from real activity, levels, friend requests and the weekly leaderboard", async () => {
    const a = await signUp("أمين", "amine@example.ma");
    const b = await signUp("Badr", "badr@example.ma");
    const pa = await call("GET", "/law/profile", { token: a.token });
    expect(pa.status).toBe(200);
    expect(pa.body.progress).toMatchObject({ xp: 0, weeklyXp: 0, level: { level: 1, title: "طالب مبتدئ" } });
    expect(pa.body.progress.friendCode).toMatch(/^QAN-[A-Z0-9]{2,10}-\d{4}$/);
    const codeB = (await call("GET", "/law/profile", { token: b.token })).body.progress.friendCode;
    expect(codeB).toMatch(/^QAN-BADR-\d{4}$/);

    // B studies: a goal-met day today (+30) and a completed capture (+20).
    const today = require("../../utils/law/time").localDate();
    await tmp.client.lawStudyDay.create({ data: { userId: b.user.id, date: today, goalMet: true, retrievalMinutes: 90 } });
    await tmp.client.lawCaptureBatch.create({
      data: { userId: b.user.id, clientBatchId: "c1", kind: "audio_recording", status: "complete" },
    });
    await tmp.client.lawCaptureBatch.create({
      data: { userId: b.user.id, clientBatchId: "c2", kind: "audio_recording", status: "uploading" },
    });
    const pb = (await call("GET", "/law/profile", { token: b.token })).body.progress;
    expect(pb).toMatchObject({ xp: 50, weeklyXp: 50, studyHours: 1.5 });

    expect((await call("POST", "/law/friends", { token: a.token, body: { code: pa.body.progress.friendCode } })).body.error).toBe("cannot_add_self");
    expect((await call("POST", "/law/friends", { token: a.token, body: { code: "QAN-NOBODY-0000" } })).status).toBe(404);
    expect((await call("POST", "/law/friends", { token: a.token, body: { code: codeB.toLowerCase() } })).status).toBe(201);
    // Pending: A cannot see B's numbers yet.
    expect((await call("GET", "/law/friends", { token: a.token })).body.friends).toEqual([]);
    const inbox = (await call("GET", "/law/friends", { token: b.token })).body;
    expect(inbox.incoming).toEqual([expect.objectContaining({ name: "أمين" })]);
    // A cannot accept on B's behalf.
    expect((await call("POST", `/law/friends/${inbox.incoming[0].friendshipId}/respond`, { token: a.token, body: { accept: true } })).status).toBe(404);
    expect((await call("POST", `/law/friends/${inbox.incoming[0].friendshipId}/respond`, { token: b.token, body: { accept: true } })).status).toBe(200);

    const fa = (await call("GET", "/law/friends", { token: a.token })).body;
    expect(fa.friends).toEqual([expect.objectContaining({ name: "Badr", weeklyXp: 50, xp: 50 })]);
    expect(fa.leaderboard.map((p) => [p.rank, p.name, p.me])).toEqual([
      [1, "Badr", false],
      [2, "أمين", true],
    ]);
    // Either side can remove the friendship.
    expect((await call("DELETE", `/law/friends/${fa.friends[0].friendshipId}`, { token: a.token })).status).toBe(200);
    expect((await call("GET", "/law/friends", { token: b.token })).body.friends).toEqual([]);
  });

  test("friend-code guesses are rate limited", async () => {
    const a = await signUp("أ", "guess@example.ma");
    const statuses = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await call("POST", "/law/friends", { token: a.token, body: { code: `QAN-X-${1000 + i}` } })).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe("AI timetable import", () => {
  test("photo → validated candidate slots matched to subjects; nothing saved", async () => {
    const s = await signUp("ط", "tt@example.ma");
    const subj = await call("POST", "/law/subjects", { token: s.token, body: { name: "القانون المدني", nameFr: "Droit civil" } });
    expect(subj.status).toBe(201);
    aiReply = {
      slots: [
        { weekday: 1, startTime: "8h30", endTime: "10h", subjectName: "Droit civil", room: "Amphi 3", kind: "amphi" },
        { weekday: 1, startTime: "8h30", endTime: "10h", subjectName: "Droit civil", room: "Amphi 3", kind: "amphi" },
        { weekday: 3, startTime: "14:00", endTime: "15:30", subjectName: "Droit pénal", room: "Salle 12", kind: "TD" },
        { weekday: 9, startTime: "10:00", endTime: "11:00", subjectName: "?" },
        { weekday: 2, startTime: "12:00", endTime: "11:00", subjectName: "inversé" },
      ],
      notes: "سطر غير مقروء",
    };
    const before = await tmp.client.lawTimetableSlot.count();
    const r = await call("POST", "/law/schedule/parse-ai", {
      token: s.token,
      body: { image: `data:image/jpeg;base64,${Buffer.from("fake-jpeg").toString("base64")}` },
    });
    expect(r.status).toBe(200);
    expect(r.body.slots).toEqual([
      { weekday: 1, startTime: "08:30", endTime: "10:00", kind: "amphi", room: "Amphi 3", subjectName: "Droit civil", subjectId: subj.body.subject.id },
      { weekday: 3, startTime: "14:00", endTime: "15:30", kind: "TD", room: "Salle 12", subjectName: "Droit pénal", subjectId: null },
    ]);
    expect(r.body.notes).toBe("سطر غير مقروء");
    expect(aiCalls[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
    expect(aiCalls[0].schema.properties.slots).toBeTruthy();
    expect(await tmp.client.lawTimetableSlot.count()).toBe(before);
  });

  test("text input, bad input", async () => {
    const s = await signUp("ط", "tt2@example.ma");
    aiReply = { slots: [] };
    expect((await call("POST", "/law/schedule/parse-ai", { token: s.token, body: { text: "Lundi 8h30 Droit civil" } })).status).toBe(200);
    expect(aiCalls[0].parts[0].text).toContain("Lundi 8h30 Droit civil");
    expect((await call("POST", "/law/schedule/parse-ai", { token: s.token, body: {} })).body.error).toBe("nothing_to_parse");
    expect((await call("POST", "/law/schedule/parse-ai", { token: s.token, body: { image: "data:text/html;base64,PGI+" } })).body.error).toBe("unsupported_image");
    expect((await call("POST", "/law/schedule/parse-ai", { body: { text: "x" } })).status).toBe(401);
  });
});
