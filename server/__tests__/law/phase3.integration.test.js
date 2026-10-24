// Phase 3: per-student preferences and public profile/privacy fields (server/models/lawPreferences.js).
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


describe("preferences", () => {
  test("defaults, partial PATCH, validation, per-user isolation", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    const g = await call("GET", "/law/me/preferences", { token: a.token });
    expect(g.status).toBe(200);
    expect(g.body.preferences).toMatchObject({ theme: "system", locale: "ar", soundEnabled: true, animationsOn: true, dailyGoalMin: 20, reminderTime: null });

    const p = await call("PATCH", "/law/me/preferences", { token: a.token, body: { theme: "dark", locale: "fr", dailyGoalMin: 30, reminderTime: "21:30" } });
    expect(p.status).toBe(200);
    expect(p.body.preferences).toMatchObject({ theme: "dark", locale: "fr", dailyGoalMin: 30, reminderTime: "21:30", soundEnabled: true });

    for (const bad of [{ theme: "neon" }, { locale: "de" }, { dailyGoalMin: 7 }, { reminderTime: "25:00" }, { soundEnabled: "yes" }, {}]) {
      expect((await call("PATCH", "/law/me/preferences", { token: a.token, body: bad })).status).toBe(400);
    }
    expect((await call("PATCH", "/law/me/preferences", { token: a.token, body: { reminderTime: null } })).body.preferences.reminderTime).toBeNull();
    // B is untouched.
    expect((await call("GET", "/law/me/preferences", { token: b.token })).body.preferences.theme).toBe("system");
    expect((await call("GET", "/law/me/preferences")).status).toBe(401);
  });
});

describe("public profile and privacy", () => {
  test("handle rules, uniqueness, avatar config, privacy flags", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    const ok = await call("PATCH", "/law/me/profile", { token: a.token, body: { handle: "Salma.L", avatarConfig: { base: "a", headwear: "tarboosh", outfit: "robe" }, isPrivate: true, discoverable: false } });
    expect(ok.status).toBe(200);
    expect(ok.body.profile).toMatchObject({ handle: "salma.l", isPrivate: true, discoverable: false, avatarConfig: { headwear: "tarboosh" } });
    // Unique (case-insensitive) and well-formed.
    expect((await call("PATCH", "/law/me/profile", { token: b.token, body: { handle: "SALMA.l" } })).status).toBe(409);
    for (const h of ["ab", "has space", "x".repeat(21), "عربي", "a@b"]) expect((await call("PATCH", "/law/me/profile", { token: b.token, body: { handle: h } })).status).toBe(400);
    // Avatar config: closed vocabulary, bounded size.
    expect((await call("PATCH", "/law/me/profile", { token: b.token, body: { avatarConfig: { headwear: "crown" } } })).status).toBe(400);
    expect((await call("PATCH", "/law/me/profile", { token: b.token, body: { avatarConfig: { base: "x".repeat(500) } } })).status).toBe(400);
    for (const k of ["constructor", "toString", "__proto__"]) expect((await call("PATCH", "/law/me/profile", { token: b.token, body: { avatarConfig: JSON.parse(`{"${k}":"x"}`) } })).status).toBe(400);
    // Setting the same handle again is fine; clearing is allowed.
    expect((await call("PATCH", "/law/me/profile", { token: a.token, body: { handle: "salma.l" } })).status).toBe(200);
    expect((await call("PATCH", "/law/me/profile", { token: a.token, body: { handle: null } })).body.profile.handle).toBeNull();
    expect((await call("GET", "/law/me/profile", { token: b.token })).body.profile.isPrivate).toBe(false);
  });
});
