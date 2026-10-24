// Shared integration harness for endpoint tests (temp SQLite DB, fake mail, fake AI, real Express app).
// The test file must declare, before requiring this module:
//   jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const { createTempDb } = require("./tempDb");
const { lawEndpoints } = require("../../../endpoints/law");
const { resetRateLimits } = require("../../../endpoints/law/auth");
const { LawAccount } = require("../../../models/lawAccount");
const { LawSetting } = require("../../../models/lawSetting");
const { setMailTransport } = require("../mailer");
const router = require("../ai/router");
const { closeFts } = require("../fts");

const PASSWORD = "Motdepasse-solide-1";

async function startHarness() {
  const ENV = process.env;
  process.env = { ...ENV, JWT_SECRET: "test-secret-for-harness", GEMINI_API_KEY: "k", GEMINI_MODEL_MULTIMODAL: "gemini-flash" };
  delete process.env.AUTH_TOKEN;
  const tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;
  resetRateLimits();
  const h = { tmp, mails: [], aiCalls: [], aiReply: null };
  setMailTransport(async (m) => { h.mails.push(m); return { delivered: true }; });
  router.setClientFactory({
    gemini: () => ({ generate: async (req) => { h.aiCalls.push(req); return { text: JSON.stringify(h.aiReply), json: h.aiReply, model: "fake", usage: { tokensIn: 10, tokensOut: 10 } }; } }),
    deepseek: () => ({ generate: async (req) => { h.aiCalls.push(req); return { text: JSON.stringify(h.aiReply), json: h.aiReply, model: "fake", usage: { tokensIn: 10, tokensOut: 10 } }; } }),
  });
  await LawSetting.update({ aiBudgetGeminiUsd: 5 });
  await LawAccount.enableMultiUserMode();
  const app = express();
  app.use(bodyParser.json({ limit: "20mb" }));
  const r = express.Router();
  lawEndpoints(r);
  app.use("/api", r);
  h.server = http.createServer(app);
  await new Promise((res) => h.server.listen(0, "127.0.0.1", res));
  h.base = `http://127.0.0.1:${h.server.address().port}`;

  h.call = async (method, path, { token, body, headers = {} } = {}) => {
    const res = await fetch(`${h.base}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, body: json };
  };
  h.signUp = async (name, email) => {
    const r1 = await h.call("POST", "/law/auth/register", { body: { fullName: name, email, password: PASSWORD } });
    if (r1.status !== 202) throw new Error(`register failed ${r1.status}`);
    const code = h.mails.at(-1).text.match(/\b(\d{6})\b/)[1];
    const v = await h.call("POST", "/law/auth/register/verify", { body: { email, code } });
    if (v.status !== 201) throw new Error(`verify failed ${v.status}`);
    return v.body;
  };
  h.stop = async () => {
    setMailTransport(null);
    await new Promise((r2) => h.server.close(r2));
    closeFts();
    await tmp.cleanup();
    globalThis.__lawTestPrisma = null;
    process.env = ENV;
  };
  return h;
}

module.exports = { startHarness, PASSWORD };
