// Qanouni (docs/plans/qanouni.md): accounts, Google sign-in, and strict per-user isolation, tested through
// the real /api/law routes with upstream's validatedRequest in multi-user mode.
jest.mock("../../utils/prisma", () => {
  // Upstream models (validatedRequest → User, SystemSettings) hold the shared client; point it at the
  // temp DB of the running test.
  return new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] });
});

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { lawEndpoints } = require("../../endpoints/law");
const { resetRateLimits } = require("../../endpoints/law/auth");
const { LawAccount } = require("../../models/lawAccount");
const { LawSubject } = require("../../models/lawSubject");
const { setGoogleVerifier } = require("../../utils/law/googleAuth");
const { setMailTransport } = require("../../utils/law/mailer");
const {
  setTestFallbackUser,
  asUser,
  LawTenantError,
} = require("../../utils/law/tenant");
const { db } = require("../../utils/law/dbClient");
const { closeFts } = require("../../utils/law/fts");

jest.setTimeout(60000);
const ENV = process.env;
let tmp;
let server;
let base;
let mails = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json, text };
}

// Sign-up is two steps: the form, then the 6-digit code that was emailed.
async function register(name, email, password = "Motdepasse-solide-1") {
  const r = await call("POST", "/law/auth/register", {
    body: { fullName: name, email, password },
  });
  expect(r.status).toBe(202);
  const code = mails.at(-1).text.match(/\b(\d{6})\b/)[1];
  const v = await call("POST", "/law/auth/register/verify", {
    body: { email, code },
  });
  expect(v.status).toBe(201);
  return v.body;
}

beforeEach(async () => {
  process.env = {
    ...ENV,
    JWT_SECRET: "test-secret-for-qanouni",
    GOOGLE_OAUTH_CLIENT_IDS: "web-client.apps.googleusercontent.com",
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
  const app = express();
  app.use(bodyParser.json());
  const router = express.Router();
  lawEndpoints(router);
  app.use("/api", router);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  setGoogleVerifier(null);
  setMailTransport(null);
  await new Promise((r) => server.close(r));
  closeFts();
  await tmp.cleanup();
  globalThis.__lawTestPrisma = null;
  process.env = ENV;
});

describe("first-run setup and email + password accounts", () => {
  test("owner setup once → multi-user; register, login, no password ever returned", async () => {
    expect((await call("GET", "/law/auth/config")).body).toMatchObject({
      setupRequired: true,
      multiUser: false,
    });
    const setup = await call("POST", "/law/auth/setup", {
      body: {
        fullName: "الطيب",
        email: "Owner@Example.ma",
        password: "Owner-pass-123",
      },
    });
    expect(setup.status).toBe(200);
    expect(setup.body.user).toMatchObject({
      id: tmp.ownerId,
      role: "admin",
      email: "owner@example.ma",
      university: "FSJES Aïn Chock",
      section: "S3 Droit privé G01",
    });
    expect(await LawAccount.isMultiUserMode()).toBe(true);
    // Once only.
    const again = await call("POST", "/law/auth/setup", {
      body: {
        fullName: "x",
        email: "x@example.ma",
        password: "Another-pass-1",
      },
    });
    expect(again.status).not.toBe(200);

    const config = (await call("GET", "/law/auth/config")).body;
    expect(config).toMatchObject({
      multiUser: true,
      registrationOpen: true,
      googleClientId: "web-client.apps.googleusercontent.com",
    });

    const student = await register("طالبة", "Student@Example.ma");
    expect(student.user).toMatchObject({
      role: "default",
      email: "student@example.ma",
    });
    const dup = await call("POST", "/law/auth/register", {
      body: {
        fullName: "x",
        email: "student@example.ma",
        password: "Whatever-123",
      },
    });
    expect(dup.status).toBe(409);

    const ok = await call("POST", "/law/auth/login", {
      body: { email: "STUDENT@example.ma", password: "Motdepasse-solide-1" },
    });
    expect(ok.status).toBe(200);
    const wrong = await call("POST", "/law/auth/login", {
      body: { email: "student@example.ma", password: "nope-nope-nope" },
    });
    const unknown = await call("POST", "/law/auth/login", {
      body: { email: "nobody@example.ma", password: "nope-nope-nope" },
    });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body); // no account probing

    const me = await call("GET", "/law/auth/me", { token: ok.body.token });
    expect(me.body.user.email).toBe("student@example.ma");
    const admins = await call("GET", "/law/admin/users", {
      token: setup.body.token,
    });
    expect(admins.body.users).toHaveLength(2);
    for (const r of [setup, ok, me, admins, student])
      expect(JSON.stringify(r.body ?? r)).not.toMatch(/"password"|\$2[aby]\$/);
    // bcrypt with ≥ 10 rounds
    const row = await tmp.client.users.findFirst({
      where: { role: "default" },
    });
    expect(Number(row.password.split("$")[2])).toBeGreaterThanOrEqual(10);
  });

  test("validation, weak passwords, rate limit", async () => {
    await LawAccount.enableMultiUserMode();
    expect(
      (
        await call("POST", "/law/auth/register", {
          body: {
            fullName: "x",
            email: "not-an-email",
            password: "longenough1",
          },
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call("POST", "/law/auth/register", {
          body: { fullName: "x", email: "a@example.ma", password: "short" },
        })
      ).status
    ).toBe(400);
    await register("أ", "a@example.ma");
    const statuses = [];
    for (let i = 0; i < 12; i++)
      statuses.push(
        (
          await call("POST", "/law/auth/login", {
            body: { email: "a@example.ma", password: `wrong-${i}-xxxx` },
          })
        ).status
      );
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // Successful sign-ins never count toward the limit.
    await register("د", "d@example.ma");
    for (let i = 0; i < 15; i++)
      expect(
        (await call("POST", "/law/auth/login", {
          body: { email: "d@example.ma", password: "Motdepasse-solide-1" },
        })).status
      ).toBe(200);
  });

  test("suspended students are locked out", async () => {
    await LawAccount.enableMultiUserMode();
    const s = await register("ب", "b@example.ma");
    await tmp.client.users.update({
      where: { id: s.user.id },
      data: { suspended: 1 },
    });
    expect(
      (await call("GET", "/law/subjects", { token: s.token })).status
    ).toBe(401);
    const login = await call("POST", "/law/auth/login", {
      body: { email: "b@example.ma", password: "Motdepasse-solide-1" },
    });
    expect(login.status).toBe(403);
  });
});

describe("Google sign-in", () => {
  beforeEach(async () => {
    await LawAccount.enableMultiUserMode();
    setGoogleVerifier(async (token, audience) => {
      expect(audience).toEqual(["web-client.apps.googleusercontent.com"]);
      return JSON.parse(Buffer.from(token, "base64url").toString());
    });
  });
  const cred = (p) =>
    Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        email_verified: true,
        ...p,
      })
    ).toString("base64url");

  test("new email → student account; same Google account → same user", async () => {
    const first = await call("POST", "/law/auth/google", {
      body: {
        credential: cred({ sub: "g-1", email: "New@Gmail.com", name: "سلمى" }),
      },
    });
    expect(first.status).toBe(201);
    expect(first.body.user).toMatchObject({
      role: "default",
      email: "new@gmail.com",
      fullName: "سلمى",
      googleLinked: true,
    });
    const second = await call("POST", "/law/auth/google", {
      body: { credential: cred({ sub: "g-1", email: "new@gmail.com" }) },
    });
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(
      (await call("GET", "/law/subjects", { token: second.body.token })).status
    ).toBe(200);
  });

  test("existing password account is linked; other Google account on it is refused", async () => {
    const s = await register("ج", "c@gmail.com");
    const linked = await call("POST", "/law/auth/google", {
      body: { credential: cred({ sub: "g-c", email: "c@gmail.com" }) },
    });
    expect(linked.status).toBe(200);
    expect(linked.body.user.id).toBe(s.user.id);
    const other = await call("POST", "/law/auth/google", {
      body: { credential: cred({ sub: "g-attacker", email: "c@gmail.com" }) },
    });
    expect(other.status).toBe(409);
  });

  test("unverified email, bad token, unconfigured, closed registration", async () => {
    expect(
      (
        await call("POST", "/law/auth/google", {
          body: {
            credential: cred({
              sub: "g-2",
              email: "u@gmail.com",
              email_verified: false,
            }),
          },
        })
      ).status
    ).toBe(403);
    setGoogleVerifier(async () => {
      throw new Error("Wrong recipient");
    });
    expect(
      (
        await call("POST", "/law/auth/google", {
          body: { credential: "x".repeat(40) },
        })
      ).status
    ).toBe(401);
    delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
    expect(
      (
        await call("POST", "/law/auth/google", {
          body: { credential: "x".repeat(40) },
        })
      ).status
    ).toBe(501);
    expect(
      (await call("GET", "/law/auth/config")).body.googleClientId
    ).toBeNull();
  });
});

describe("isolation between students (zero leak)", () => {
  let A;
  let B;
  let adminToken;
  beforeEach(async () => {
    const setup = await call("POST", "/law/auth/setup", {
      body: {
        fullName: "المالك",
        email: "owner@example.ma",
        password: "Owner-pass-123",
      },
    });
    adminToken = setup.body.token;
    A = await register("أمينة", "amina@example.ma");
    B = await register("بلال", "bilal@example.ma");
    // From here on the fallback must not mask anything: every query needs a real context.
    setTestFallbackUser(null);
  });

  test("B can neither see nor change A's subjects, cards, reviews, cases, dissertations", async () => {
    const t = A.token;
    const subject = (
      await call("POST", "/law/subjects", {
        token: t,
        body: { name: "الالتزامات" },
      })
    ).body.subject;
    const card = (
      await call("POST", "/law/cards", {
        token: t,
        body: {
          subjectId: subject.id,
          origin: "manual",
          front: "ما الالتزام؟",
          back: "رابطة قانونية",
        },
      })
    ).body.card;
    const exercise = (
      await call("POST", "/law/cases", {
        token: t,
        body: { title: "نازلة", factsAr: "وقائع النازلة التجريبية" },
      })
    ).body.exercise;
    const attempt = (
      await call("POST", `/law/cases/${exercise.id}/attempts`, {
        token: t,
        body: {},
      })
    ).body.attempt;
    const diss = (
      await call("POST", "/law/dissertations", {
        token: t,
        body: { topic: "موضوع" },
      })
    ).body.dissertation;
    expect({
      subject: !!subject,
      card: !!card,
      exercise: !!exercise,
      attempt: !!attempt,
      diss: !!diss,
    }).toEqual({
      subject: true,
      card: true,
      exercise: true,
      attempt: true,
      diss: true,
    });

    const u = B.token;
    expect(
      (await call("GET", "/law/subjects", { token: u })).body.subjects
    ).toEqual([]);
    expect(
      (await call("GET", `/law/subjects/${subject.id}`, { token: u })).status
    ).toBe(404);
    expect(
      (
        await call("PATCH", `/law/subjects/${subject.id}`, {
          token: u,
          body: { name: "hack" },
        })
      ).status
    ).toBe(404);
    expect(
      (await call("GET", "/law/cards", { token: u })).body.cards || []
    ).toEqual([]);
    expect(
      (await call("GET", "/law/cards/offline-pack", { token: u })).text
    ).not.toContain(card.id);
    expect(
      (
        await call("PATCH", `/law/cards/${card.id}`, {
          token: u,
          body: { front: "x" },
        })
      ).status
    ).toBe(404);
    expect(
      (await call("DELETE", `/law/cards/${card.id}`, { token: u })).status
    ).toBe(404);
    expect(
      (await call("GET", `/law/cases/${exercise.id}`, { token: u })).status
    ).toBe(404);
    expect(
      (await call("GET", `/law/attempts/${attempt.id}`, { token: u })).status
    ).toBe(404);
    expect(
      (
        await call("PATCH", `/law/attempts/${attempt.id}`, {
          token: u,
          body: { phases: {} },
        })
      ).status
    ).toBe(404);
    expect(
      (await call("GET", `/law/dissertations/${diss.id}`, { token: u })).status
    ).toBe(404);
    expect(
      (
        await call("PATCH", `/law/dissertations/${diss.id}`, {
          token: u,
          body: { topic: "x" },
        })
      ).status
    ).toBe(404);

    // Writing into A's subject or reviewing A's card is refused.
    const inject = await call("POST", "/law/cards", {
      token: u,
      body: { subjectId: subject.id, origin: "manual", front: "x", back: "y" },
    });
    expect(inject.status).toBeGreaterThanOrEqual(400);
    const review = await call("POST", "/law/reviews/batch", {
      token: u,
      body: {
        logs: [
          {
            clientReviewId: "b-review-0001",
            cardId: card.id,
            rating: 3,
            reviewedAt: new Date().toISOString(),
            durationMs: 1000,
          },
        ],
      },
    });
    expect(review.body.accepted || []).toEqual([]);

    // A still sees everything, unchanged.
    const mine = await call("GET", `/law/subjects/${subject.id}`, { token: t });
    expect(mine.body.subject.name).toBe("الالتزامات");
    expect(
      (await tmp.client.lawFlashcard.findUnique({ where: { id: card.id } }))
        .front
    ).toBe("ما الالتزام؟");
    expect(await tmp.client.lawFlashcard.count()).toBe(1);
    expect(await tmp.client.lawReviewLog.count()).toBe(0);
  });

  test("preferences, streak, push subscriptions and recaps are per user", async () => {
    await call("PATCH", "/law/settings", {
      token: A.token,
      body: { newCardsPerDay: 33 },
    });
    expect(
      (await call("GET", "/law/settings", { token: A.token })).body.settings
        .newCardsPerDay
    ).toBe(33);
    expect(
      (await call("GET", "/law/settings", { token: B.token })).body.settings
        .newCardsPerDay
    ).toBe(15);
    const sub = {
      endpoint: "https://push.example/device-1",
      keys: { p256dh: "p", auth: "a" },
    };
    await call("POST", "/law/push/subscribe", {
      token: A.token,
      body: { subscription: sub },
    });
    // Same phone, B signs in: the endpoint moves to B, A no longer owns it.
    await call("POST", "/law/push/subscribe", {
      token: B.token,
      body: { subscription: sub },
    });
    const rows = await tmp.client.lawPushSubscription.findMany();
    expect(rows.map((r) => r.userId)).toEqual([B.user.id]);
    expect((await call("GET", "/law/streak", { token: A.token })).status).toBe(
      200
    );
    expect((await call("GET", "/law/streak", { token: B.token })).status).toBe(
      200
    );
    expect(await tmp.client.lawStreak.count()).toBe(2);
  });

  test("students cannot reach admin routes or see AI configuration", async () => {
    const s = B.token;
    expect((await call("GET", "/law/ai/usage", { token: s })).status).toBe(403);
    expect((await call("GET", "/law/admin/users", { token: s })).status).toBe(
      403
    );
    expect(
      (await call("POST", "/law/corpus/import", { token: s, body: {} })).status
    ).toBe(403);
    expect((await call("POST", "/law/sources/scan", { token: s })).status).toBe(
      403
    );
    expect(
      (
        await call("POST", "/law/reforms", {
          token: s,
          body: { title: "x", status: "draft" },
        })
      ).status
    ).toBe(403);
    expect(
      (
        await call("PATCH", "/law/settings", {
          token: s,
          body: { aiBudgetGeminiUsd: 99 },
        })
      ).status
    ).toBe(403);
    const settings = (await call("GET", "/law/settings", { token: s })).body;
    expect(settings.config.ai).toBeUndefined();
    expect(settings.settings.aiBudgetGeminiUsd).toBeUndefined();
    expect(JSON.stringify(settings)).not.toMatch(/gemini|deepseek/i);
    // The admin keeps all of it.
    expect(
      (await call("GET", "/law/ai/usage", { token: adminToken })).status
    ).toBe(200);
    expect(
      (await call("GET", "/law/settings", { token: adminToken })).body.config.ai
    ).toBeDefined();
  });

  test("provider details are stripped from student responses", async () => {
    await asUser(B.user.id, async () => {
      await db().lawJob.create({
        data: {
          type: "ocr_photo_batch",
          status: "failed",
          provider: "gemini",
          model: "gemini-x",
          tokensIn: 5,
          estimatedCostUsd: 0.1,
        },
      });
    });
    const inbox = await call("GET", "/law/inbox", { token: B.token });
    expect(inbox.body.failedJobs).toHaveLength(1);
    expect(inbox.text).not.toMatch(
      /"provider"|"model"|"tokensIn"|"estimatedCostUsd"|gemini/
    );
    const jobs = await call("GET", "/law/jobs", { token: B.token });
    expect(jobs.text).not.toMatch(/gemini/);
    // A does not see B's job at all.
    expect(
      (await call("GET", "/law/inbox", { token: A.token })).body.failedJobs
    ).toHaveLength(0);
  });

  test("no context → refused; foreign ids refused at the model layer", async () => {
    await expect(LawSubject.list()).rejects.toThrow(LawTenantError);
    const a = await asUser(A.user.id, () =>
      LawSubject.create({ name: "مادة أ" })
    );
    await expect(
      asUser(B.user.id, () =>
        db().lawFlashcard.create({
          data: {
            subjectId: a.subject.id,
            origin: "manual",
            front: "x",
            back: "y",
          },
        })
      )
    ).rejects.toThrow(LawTenantError);
    await expect(
      asUser(B.user.id, () =>
        db().lawSubject.create({ data: { name: "x", userId: A.user.id } })
      )
    ).rejects.toThrow(LawTenantError);
    expect(
      await asUser(B.user.id, () =>
        db().lawSubject.findUnique({ where: { id: a.subject.id } })
      )
    ).toBeNull();
    expect(
      (
        await asUser(B.user.id, () =>
          db().lawSubject.updateMany({ where: {}, data: { name: "hacked" } })
        )
      ).count
    ).toBe(0);
    expect(
      (await asUser(B.user.id, () => db().lawSubject.deleteMany({}))).count
    ).toBe(0);
    expect(
      (await tmp.client.lawSubject.findUnique({ where: { id: a.subject.id } }))
        .name
    ).toBe("مادة أ");
  });
});
