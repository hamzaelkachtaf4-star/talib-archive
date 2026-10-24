// Phase 6: AI fair-use quota (utils/law/aiQuota.js) over HTTP + direct concurrency checks.
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
const quota = require("../../utils/law/aiQuota");
const { asSystem } = require("../../utils/law/tenant");

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



const at = (dateStr, hhmm) => {
  // a UTC instant that is hh:mm local (Africa/Casablanca) on dateStr
  const { localDate, localTime } = require("../../utils/law/time");
  const base = new Date(`${dateStr}T${hhmm}:00Z`);
  for (let h = -14; h <= 14; h++) {
    const t = new Date(base.getTime() + h * 3600000);
    if (localDate(t) === dateStr && localTime(t) === hhmm) return t;
  }
  throw new Error("no instant");
};
const run = (fn) => asSystem(fn);
const setLimit = (n) => tmp.client.lawSetting.upsert({ where: { key: "aiDailyLimit" }, create: { key: "aiDailyLimit", value: JSON.stringify(n) }, update: { value: JSON.stringify(n) } });

describe("quota", () => {
  test("limit resolution: default 25, global setting, per-student override", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    expect((await run(() => quota.limitFor(a.user.id)))).toBe(25);
    await setLimit(3);
    expect((await run(() => quota.limitFor(a.user.id)))).toBe(3);
    await tmp.client.lawUserProfile.updateMany({ where: { userId: a.user.id }, data: { aiDailyLimitOverride: 7 } });
    expect((await run(() => quota.limitFor(a.user.id)))).toBe(7);
    await tmp.client.lawUserProfile.updateMany({ where: { userId: a.user.id }, data: { aiDailyLimitOverride: 0 } }); // 0 = blocked, not "unset"
    expect((await run(() => quota.limitFor(a.user.id)))).toBe(0);
  });

  test("reserve stops at the limit with AI_QUOTA_EXCEEDED + resetAt (next local midnight)", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    await setLimit(2);
    const now = at("2026-10-12", "10:00");
    await run(() => quota.reserve(a.user.id, now));
    await run(() => quota.reserve(a.user.id, now));
    const err = await run(() => quota.reserve(a.user.id, now)).catch((e) => e);
    expect(err).toMatchObject({ code: "AI_QUOTA_EXCEEDED", limit: 2 });
    expect(err.resetAt.toISOString()).toBe(at("2026-10-13", "00:00").toISOString());
    expect(await run(() => quota.status(a.user.id, now))).toMatchObject({ used: 2, limit: 2, remaining: 0 });
  });

  test("5 parallel requests at limit-1: exactly one wins", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    await setLimit(5);
    const now = at("2026-10-12", "10:00");
    for (let i = 0; i < 4; i++) await run(() => quota.reserve(a.user.id, now));
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => run(() => quota.reserve(a.user.id, now))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && r.reason.code === "AI_QUOTA_EXCEEDED")).toHaveLength(4);
    expect((await run(() => quota.status(a.user.id, now))).used).toBe(5);
  });

  test("50 concurrent requests against a limit of 10: exactly 10 win, count is 10", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    await setLimit(10);
    const now = at("2026-10-12", "10:00");
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => run(() => quota.reserve(a.user.id, now))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected" && r.reason.code === "AI_QUOTA_EXCEEDED")).toHaveLength(40);
    expect((await run(() => quota.status(a.user.id, now))).used).toBe(10);
  });

  test("refund returns a turn (never below zero) and day rollover resets in Africa/Casablanca", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    await setLimit(1);
    const late = at("2026-10-12", "23:59");
    const receipt = await run(() => quota.reserve(a.user.id, late));
    await expect(run(() => quota.reserve(a.user.id, late))).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED" });
    await run(() => quota.refund(receipt));
    await run(() => quota.refund(receipt)); // double refund is clamped at 0
    expect((await run(() => quota.status(a.user.id, late))).used).toBe(0);
    await run(() => quota.reserve(a.user.id, late));
    // one minute later it is a new local day: a fresh allowance
    const next = at("2026-10-13", "00:01");
    await expect(run(() => quota.reserve(a.user.id, next))).resolves.toBeTruthy();
  });

  test("admins are exempt unless AI_QUOTA_ADMIN_EXEMPT=false", async () => {
    const a = await signUp("المشرف", "admin@example.ma");
    await tmp.client.users.update({ where: { id: a.user.id }, data: { role: "admin" } });
    await setLimit(1);
    const now = at("2026-10-12", "10:00");
    for (let i = 0; i < 3; i++) await run(() => quota.reserve(a.user.id, now));
    expect(await run(() => quota.status(a.user.id, now))).toMatchObject({ unlimited: true, remaining: null });
    process.env.AI_QUOTA_ADMIN_EXEMPT = "false";
    await run(() => quota.reserve(a.user.id, now));
    await expect(run(() => quota.reserve(a.user.id, now))).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED" });
  });
});
