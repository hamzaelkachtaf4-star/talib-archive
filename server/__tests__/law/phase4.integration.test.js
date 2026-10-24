// Phase 4: faculties, academic profile and the resumable onboarding wizard (server/models/lawOnboarding.js).
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



describe("faculties", () => {
  test("seeded once; FSJES Aïn Chock is live, the others are not", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const r = await call("GET", "/law/faculties", { token: a.token });
    expect(r.status).toBe(200);
    const live = r.body.faculties.filter((f) => f.isLive);
    expect(live.map((f) => f.code)).toEqual(["FSJES_AIN_CHOCK"]);
    expect(r.body.faculties.length).toBeGreaterThan(5);
    const again = await call("GET", "/law/faculties", { token: a.token });
    expect(again.body.faculties.length).toBe(r.body.faculties.length); // idempotent seeding
    expect((await call("GET", "/law/faculties")).status).toBe(401);
  });
});

describe("academic profile", () => {
  test("validates the closed vocabulary and keeps the cohort fields in sync", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const ok = await call("PATCH", "/law/me/academic", { token: a.token, body: { facultyCode: "FSJES_AIN_CHOCK", track: "PUBLIC", language: "FR", semester: "S4", groupCode: "G07", examTrack: "AVOCAT" } });
    expect(ok.status).toBe(200);
    expect(ok.body.academic).toMatchObject({ facultyCode: "FSJES_AIN_CHOCK", track: "PUBLIC", language: "FR", semester: "S4", groupCode: "G07", examTrack: "AVOCAT" });
    const prof = await tmp.client.lawUserProfile.findFirst({ where: { email: "a@example.ma" } });
    expect(prof).toMatchObject({ semester: "S4", tdGroup: "G07", studyLang: "FR" });
    for (const bad of [{ facultyCode: "NOPE" }, { track: "X" }, { language: "EN" }, { semester: "S7" }, { groupCode: "7" }, { groupCode: "G123" }, { examTrack: "JUDGE" }, {}])
      expect((await call("PATCH", "/law/me/academic", { token: a.token, body: bad })).status).toBe(400);
    // clearing the optional exam track is allowed
    expect((await call("PATCH", "/law/me/academic", { token: a.token, body: { examTrack: null } })).body.academic.examTrack).toBeNull();
  });
});

describe("onboarding wizard", () => {
  test("new students start incomplete; partial progress resumes; completion needs the required steps", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    expect((await call("GET", "/law/me/profile", { token: a.token })).body.profile.onboardingCompletedAt).toBeNull();

    // step 3 (faculty) then a refresh: the draft is returned
    expect((await call("POST", "/law/onboarding/step", { token: a.token, body: { step: 3, data: { facultyCode: "FSJES_AIN_CHOCK" } } })).status).toBe(200);
    const st = await call("GET", "/law/onboarding", { token: a.token });
    expect(st.body).toMatchObject({ completed: false, step: 3, data: { facultyCode: "FSJES_AIN_CHOCK" } });

    // bad step / bad data are refused and do not clobber the draft
    expect((await call("POST", "/law/onboarding/step", { token: a.token, body: { step: 9, data: {} } })).status).toBe(400);
    expect((await call("POST", "/law/onboarding/step", { token: a.token, body: { step: 4, data: { semester: "S9" } } })).status).toBe(400);
    expect((await call("GET", "/law/onboarding", { token: a.token })).body.step).toBe(3);

    // completing too early fails and lists what is missing
    const early = await call("POST", "/law/onboarding/complete", { token: a.token });
    expect(early.status).toBe(400);
    expect(early.body.missing).toEqual(expect.arrayContaining(["track", "language", "semester", "groupCode"]));

    await call("POST", "/law/onboarding/step", { token: a.token, body: { step: 4, data: { track: "PRIVE", language: "AR", semester: "S3", groupCode: "G01" } } });
    await call("POST", "/law/onboarding/step", { token: a.token, body: { step: 5, data: { dailyGoalMin: 30 } } });
    const done = await call("POST", "/law/onboarding/complete", { token: a.token });
    expect(done.status).toBe(200);
    expect(done.body.completed).toBe(true);
    expect((await call("GET", "/law/me/academic", { token: a.token })).body.academic).toMatchObject({ facultyCode: "FSJES_AIN_CHOCK", track: "PRIVE", semester: "S3", groupCode: "G01" });
    expect((await call("GET", "/law/me/preferences", { token: a.token })).body.preferences.dailyGoalMin).toBe(30);
    expect((await call("GET", "/law/onboarding", { token: a.token })).body.completed).toBe(true);
    // B is untouched
    expect((await call("GET", "/law/onboarding", { token: b.token })).body).toMatchObject({ completed: false, step: 1 });
  });

  test("a student who already has an academic profile can run the condensed wizard (steps 3-5 only)", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    // Existing student: marked complete by the migration, but no normalized academic fields yet.
    await tmp.client.lawUserProfile.updateMany({ data: { onboardingCompletedAt: new Date() } });
    const st = await call("GET", "/law/onboarding", { token: a.token });
    expect(st.body).toMatchObject({ completed: true, academicMissing: true });
    await call("PATCH", "/law/me/academic", { token: a.token, body: { facultyCode: "FSJES_AIN_CHOCK", track: "PRIVE", language: "AR", semester: "S3", groupCode: "G01" } });
    expect((await call("GET", "/law/onboarding", { token: a.token })).body.academicMissing).toBe(false);
  });
});
