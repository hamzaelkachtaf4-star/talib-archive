// Phase 6: grounded legal chat over HTTP (scoped retrieval, citation verification, quota, attachments, isolation).
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
const fsx = require("fs");
const osx = require("os");
const pathx = require("path");
const { LawCorpus } = require("../../models/lawCorpus");
const { LawBrain } = require("../../models/lawBrain");
const { ProviderError } = require("../../utils/law/ai/errors");

jest.setTimeout(60000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
let tmp;
let server;
let base;
let mails;
let aiReply;
let aiCalls;
let storageDir;
let reply;
let failWith;

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
    DEEPSEEK_API_KEY: "k",
    DEEPSEEK_BASE_URL: "http://x",
    DEEPSEEK_MODEL_REASONING: "r",
    STORAGE_DIR: (storageDir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), "lawos-chat-"))),
  };
  delete process.env.GEMINI_API_KEY;
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
  reply = null;
  failWith = null;
  router.setClientFactory({
    gemini: () => ({ generate: async () => { throw new Error("gemini unused"); } }),
    deepseek: () => ({
      generate: async (req) => {
        if (req.purpose === "brain_classify") return { text: "{}", json: { items: [] }, model: "fake", usage: { tokensIn: 1, tokensOut: 1 } }; // background Brain call: not part of these assertions
        aiCalls.push({ purpose: req.purpose, text: req.parts.map((p) => p.text).join("\n") });
        if (failWith) throw failWith;
        return { text: JSON.stringify(reply), json: reply, model: "fake", usage: { tokensIn: 100, tokensOut: 50 } };
      },
    }),
  });
  await tmp.client.lawSetting.upsert({ where: { key: "aiBudgetDeepseekUsd" }, create: { key: "aiBudgetDeepseekUsd", value: "5" }, update: { value: "5" } });
  // Synthetic statute text (fixtures, not real law).
  await asSystem(async () => {
    for (const [slug, text] of [
      ["DOC", "الفصل 77\nكل فعل ارتكبه الانسان عن بينة واختيار نص تجريبي يلزم بالتعويض.\nالفصل 78\nنص تجريبي عن الخطأ."],
      ["CP", "الفصل 3\nنص تجريبي لا جريمة ولا عقوبة إلا بنص قانوني.\nالفصل 4\nنص تجريبي آخر."],
      ["CCOM", "المادة 1\nنص تجريبي افتتاحي حول المصادر التجارية.\nالمادة 2\nنص تجريبي ثان حول الاعراف.\nالمادة 3\nنص تجريبي ثالث."],
    ]) {
      const { import: imp } = await LawCorpus.createImport({ codeSlug: slug, validFrom: "1913-08-12", text });
      await LawCorpus.commitImport(imp.id);
    }
  });
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
  await require("../../models/lawBrain").LawBrain.drain(); // no background Brain call may outlive the test database
  setMailTransport(null);
  await new Promise((r) => server.close(r));
  closeFts();
  await tmp.cleanup();
  fsx.rmSync(storageDir, { recursive: true, force: true });
  globalThis.__lawTestPrisma = null;
  process.env = ENV;
});




const run = (fn) => asSystem(fn);
const mkThread = async (token, scope) => (await call("POST", "/law/chat/threads", { token, body: { scope } })).body.thread;
// the background Brain classifier writes to SQLite: wait for it so the next request never overlaps its writes
const ask = async (token, id, text, extra = {}) => { const r = await call("POST", `/law/chat/threads/${id}/messages`, { token, body: { text, ...extra } }); await LawBrain.drain(); return r; };

describe("scope and grounding", () => {
  test("a thread needs references; unknown references are refused; a suggestion is offered", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    expect((await call("POST", "/law/chat/threads", { token: a.token, body: { scope: { codeSlugs: ["NOPE"] } } })).status).toBe(400);
    const t = await mkThread(a.token, {});
    const r = await ask(a.token, t.id, "ما هو الفصل 77؟");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("scope_required");
    expect(aiCalls).toHaveLength(0);
  });

  test("answers only from the selected references; out-of-scope and invented citations are removed and flagged", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    reply = {
      answer: "التعويض واجب بمقتضى [DOC:77]. وفي الجنائي [CP:3] وكذلك [DOC:999] وأيضا الفصل 555.",
      citations: [{ canonicalId: "DOC:77", quote: "عن بينة واختيار" }, { canonicalId: "CP:3" }, { canonicalId: "DOC:999" }],
    };
    const r = await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    expect(r.status).toBe(201);
    const bot = r.body.messages.find((m) => m.role === "assistant");
    expect(bot.content).toContain("[DOC:77]");
    expect(bot.content).not.toMatch(/CP:3|DOC:999|555/);
    expect(bot.citations.verified).toEqual(["DOC:77"]);
    expect(bot.citations.unverified).toEqual(expect.arrayContaining(["CP:3", "DOC:999"]));
    expect(bot.citations.banner).toBe(true);
    expect(bot.citations.citations.map((c) => c.canonicalId)).toEqual(["DOC:77"]);
    // the model only ever saw DOC articles
    expect(aiCalls[0].text).toContain("[DOC:77]");
    expect(aiCalls[0].text).not.toContain("[CP:3]");
    expect(r.body.quota).toMatchObject({ used: 1, limit: 25 });
  });

  test("commercial scope injects the Commercial Code's opening provisions from the corpus", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["CCOM"] });
    reply = { answer: "حسب [CCOM:2] تُراعى الأعراف.", citations: [{ canonicalId: "CCOM:2" }] };
    const r = await ask(a.token, t.id, "ما ترتيب مصادر القانون التجاري؟");
    expect(r.status).toBe(201);
    for (const n of [1, 2, 3]) expect(aiCalls[0].text).toContain(`[CCOM:${n}]`);
  });

  test("RC2 2.2: the branch module for the scoped code is in the prompt (commercial hierarchy = Art. 2 of the Code de Commerce)", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["CCOM"] });
    reply = { answer: "حسب [CCOM:2] تُراعى الأعراف.", citations: [{ canonicalId: "CCOM:2" }] };
    await ask(a.token, t.id, "ما ترتيب مصادر القانون التجاري؟");
    expect(aiCalls[0].text).toMatch(/<branch_rules>[\s\S]*المادة 2 من مدونة التجارة[\s\S]*<\/branch_rules>/);
    expect(aiCalls[0].text).not.toMatch(/<student_material>/); // no material, no fence
  });

  test("RC2 2.1: the tutor prompt fences user data, labels French law comparative-only and forbids guessing", () => {
    const p = require("../../utils/law/prompts").loadPrompt("legal_tutor", 3).text;
    expect(p).toMatch(/<student_material>/);
    expect(p).toMatch(/ليس[^\n]*تعليمات/);
    expect(p).toMatch(/القانون المقارن/);
    expect(p).toMatch(/لا تخمّن/);
  });

  test("nothing retrieved: honest no-context answer, no model call, no charge", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    const r = await ask(a.token, t.id, "zzzz qqqq");
    expect(r.status).toBe(201);
    expect(r.body.messages.find((m) => m.role === "assistant").citations.noContext).toBe(true);
    expect(aiCalls).toHaveLength(0);
    expect(r.body.quota.used).toBe(0);
  });

  test("provider failure: 503 and the turn is refunded; nothing stored", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    failWith = new ProviderError("down", 503);
    const r = await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("ai_unavailable");
    expect((await call("GET", "/law/chat/quota", { token: a.token })).body.used).toBe(0);
    expect((await call("GET", `/law/chat/threads/${t.id}`, { token: a.token })).body.messages).toHaveLength(0);
  });
});

describe("quota over HTTP", () => {
  test("429 AI_QUOTA_EXCEEDED with resetAt + Retry-After; admin can raise the limit; per-student override", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const admin = await signUp("المشرف", "admin@example.ma");
    await tmp.client.users.update({ where: { id: admin.user.id }, data: { role: "admin" } });
    await tmp.client.lawSetting.upsert({ where: { key: "aiDailyLimit" }, create: { key: "aiDailyLimit", value: "1" }, update: { value: "1" } });
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    expect((await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟")).status).toBe(201);
    const over = await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟ مرة أخرى");
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("AI_QUOTA_EXCEEDED");
    expect(new Date(over.body.error.details.resetAt).getTime()).toBeGreaterThan(Date.now());
    expect(aiCalls).toHaveLength(1);

    expect((await call("PUT", "/law/admin/ai-quota", { token: a.token, body: { limit: 50 } })).status).toBe(403);
    expect((await call("PUT", "/law/admin/ai-quota", { token: admin.token, body: { limit: -1 } })).status).toBe(400);
    expect((await call("PUT", "/law/admin/ai-quota", { token: admin.token, body: { limit: 2 } })).body.limit).toBe(2);
    expect((await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟ ثالثة")).status).toBe(201);
    expect((await call("PUT", `/law/admin/users/${a.user.id}/ai-limit`, { token: admin.token, body: { limit: 0 } })).status).toBe(200);
    expect((await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟ رابعة")).status).toBe(429);
    expect((await call("PUT", `/law/admin/users/${a.user.id}/ai-limit`, { token: admin.token, body: { limit: null } })).status).toBe(200);
    const top = await call("GET", "/law/admin/ai-quota", { token: admin.token });
    expect(top.body.top[0]).toMatchObject({ userId: a.user.id, count: 2 });
    expect((await call("GET", "/law/admin/ai-quota", { token: a.token })).status).toBe(403);
  });
});

describe("isolation", () => {
  test("another student can neither read, write, delete a thread nor use its attachments", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    expect((await call("GET", `/law/chat/threads/${t.id}`, { token: b.token })).status).toBe(404);
    expect((await ask(b.token, t.id, "هل أستطيع؟")).status).toBe(404);
    expect((await call("DELETE", `/law/chat/threads/${t.id}`, { token: b.token })).status).toBe(404);
    expect((await call("PATCH", `/law/chat/threads/${t.id}/scope`, { token: b.token, body: { scope: { codeSlugs: ["CP"] } } })).status).toBe(404);
    expect((await call("GET", "/law/chat/threads", { token: b.token })).body.threads).toEqual([]);
    expect((await call("GET", "/law/chat/threads")).status).toBe(401);
  });
});

describe("attachments", () => {
  const upload = (token, buf, type) => fetch(`${base}/api/law/chat/attachments`, { method: "POST", headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: buf });
  const pdf = () => fsx.readFileSync(pathx.join(__dirname, "../fixtures/fdc/s3_prive_ar.pdf"));

  test("allowlist, size cap, magic bytes; a text PDF is extracted without any AI call; audio is UNSUPPORTED without a provider", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    expect((await upload(a.token, Buffer.from("x"), "text/html")).status).toBe(415);
    expect((await upload(a.token, Buffer.from("not a pdf"), "application/pdf")).status).toBe(415);
    expect((await upload(a.token, Buffer.from("\xff\xd8" + "x".repeat(10)), "image/png")).status).toBe(415);
    expect((await upload(a.token, Buffer.alloc(11 * 1024 * 1024, 1), "audio/mpeg")).status).toBe(413);
    expect((await upload(a.token, Buffer.from("this is not audio at all"), "audio/mpeg")).status).toBe(415); // signature check
    expect((await upload(a.token, Buffer.from("ID3\u0003rest"), "audio/x-m4a")).status).toBe(201); // common mobile mime is accepted
    expect((await upload(null, pdf(), "application/pdf")).status).toBe(401);

    const ok = await upload(a.token, pdf(), "application/pdf");
    expect(ok.status).toBe(201);
    const att = (await ok.json()).attachment;
    expect(att).toMatchObject({ kind: "PDF", status: "EXTRACTED" });
    expect(aiCalls).toHaveLength(0);

    const audio = await (await upload(a.token, Buffer.from("ID3audio-bytes"), "audio/mpeg")).json();
    expect(audio.attachment.status).toBe("UNSUPPORTED");

    // the extracted text reaches the model as study material, labelled as not a legal source
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    const r = await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟", { attachmentIds: [att.id] });
    expect(r.status).toBe(201);
    expect(aiCalls[0].text).toContain("مادة دراسية للطالب وليست مصدرا قانونيا");
    expect(r.body.messages.find((m) => m.role === "user").attachments[0].id).toBe(att.id);
    // an attachment can be used in one message only, and never by someone else
    expect((await ask(a.token, t.id, "مرة ثانية؟", { attachmentIds: [att.id] })).status).toBe(400);
  });

  test("files are downloadable by their owner only", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    const att = (await (await upload(a.token, pdf(), "application/pdf")).json()).attachment;
    const mine = await fetch(`${base}/api/law/chat/attachments/${att.id}/file`, { headers: { Authorization: `Bearer ${a.token}` } });
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-disposition")).toBe("attachment");
    const theirs = await fetch(`${base}/api/law/chat/attachments/${att.id}/file`, { headers: { Authorization: `Bearer ${b.token}` } });
    expect(theirs.status).toBe(404);
    const t = await mkThread(b.token, { codeSlugs: ["DOC"] });
    expect((await ask(b.token, t.id, "هل؟", { attachmentIds: [att.id] })).status).toBe(400);
  });
});

describe("library", () => {
  test("codes carry the hierarchy of norms; a code exports as an offline pack", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const codes = (await call("GET", "/law/corpus/codes", { token: a.token })).body.codes;
    const bySlug = Object.fromEntries(codes.map((c) => [c.slug, c]));
    expect(bySlug["CONST-2011"]).toMatchObject({ normLevel: "CONSTITUTION", reviewed: false, articleCount: 0 });
    expect(bySlug["ORG-COMMUNES"].normLevel).toBe("ORGANIC");
    expect(bySlug.DOC).toMatchObject({ normLevel: "ORDINARY", domain: "CIVIL", articleCount: 2 });
    const pack = await call("GET", "/law/corpus/codes/DOC/export", { token: a.token });
    expect(pack.status).toBe(200);
    expect(pack.body.articles.map((x) => x.canonicalId)).toEqual(["DOC:77", "DOC:78"]);
    expect(pack.body.articles[0].text).toContain("عن بينة واختيار");
    expect((await call("GET", "/law/corpus/codes/NOPE/export", { token: a.token })).status).toBe(404);
    expect((await call("GET", "/law/corpus/codes/DOC/export")).status).toBe(401);
  });
});

describe("review fixes", () => {
  const { scrub } = require("../../utils/law/chatCitations");
  const allowed = new Set(["DOC:77"]);
  const KNOWN = ["DOC", "CP", "CCOM", "CT"];

  test.each([
    ["حسب [DOC:77] وأيضا المادة 77 من مدونة التجارة.", /المادة 77/, "المادة"],
    ["ينص الفصل 3 من القانون الجنائي [CP:3]", /\[CP:3\]/, "[CP:3]"],
    ["l'article 3 du Code pénal ; art. 999 ; Article 1 of the code", /999/, "art. 999"],
    ["voir CP:3 puis (CP:999) puis [ CP:4 ] puis 【CP:5】", /CP:/, "CP:3"],
    ["الفصلين 230 و231 والمواد 400-410", /230|231|400/, "الفصلين 230 و231"],
    ["الفصل رقم 999 والفصل77 والفصل ۹۹۹", /999|۹۹۹/, "الفصل رقم 999"],
    ["م. 999 و ف. 12", /999|12/, "م. 999"],
    ["المادة الثالثة وكذلك المادة العاشرة", /الثالثة|العاشرة/, "المادة الثالثة"],
    ["وفقا للمادة 999 من الكتاب الثاني والفصل 888 من القسم الأول", /999|888/, "999"],
  ])("scrubs %s", (text, mustNotMatch, flagged) => {
    const r = scrub(text, allowed, KNOWN);
    expect(r.text).not.toMatch(mustNotMatch);
    expect(r.stripped.join("|")).toContain(flagged.replace(/\[|\]/g, "").trim() === "CP:3" ? "CP:3" : flagged.split(" ")[0]);
  });

  test("allowed ids are kept and canonicalized; a bare mention hugging its bracket id survives", () => {
    const r = scrub("حسب الفصل 77 [doc:٧٧] و【DOC:77】", allowed, KNOWN);
    expect(r.text).toContain("الفصل 77 [DOC:77]");
    expect(r.verified).toEqual(["DOC:77"]);
    expect(r.stripped).toEqual([]);
    expect(scrub("لا شيء هنا 10:30 صباحا", allowed).text).toBe("لا شيء هنا 10:30 صباحا");
  });

  test.each([
    "Amende: 2000 dirhams et Délai: 30 jours.",
    "Q1: 3 conditions",
    "(2 conditions: 1) le dol",
    "http://example.com:8080/x",
    "الساعة 10:30 صباحا",
    "في الفصل 3 من السنة الجامعية",
    "درسنا الفصل الأول من الكتاب والفصل الثاني",
    "صدر سنة 1958 م. 3 شروط",
    "part 3 and smart 4",
  ])("ordinary text is left alone: %s", (text) => {
    const r = scrub(text, allowed, KNOWN);
    expect(r.text).toBe(text);
    expect(r.stripped).toEqual([]);
  });

  test("spacing around a rewritten id is preserved", () => {
    expect(scrub("voir DOC:77 et la suite", allowed, KNOWN).text).toBe("voir [DOC:77] et la suite");
    expect(scrub("voir CT:5 et la suite", allowed, KNOWN).text).toBe("voir et la suite");
  });

  test("the turn is not refunded after the model call succeeded; the refund can happen only once", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    // the thread vanishes while the model is answering: storing fails, but the model call was made and billed
    router.setClientFactory({
      gemini: () => ({ generate: async () => { throw new Error("unused"); } }),
      deepseek: () => ({ generate: async (req) => { aiCalls.push({ purpose: req.purpose, text: "" }); await tmp.client.lawChatThread.deleteMany({}); return { text: "{}", json: reply, model: "fake", usage: { tokensIn: 1, tokensOut: 1 } }; } }),
    });
    const r = await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    expect(r.status).toBe(500);
    expect(aiCalls).toHaveLength(1);
    expect((await run(() => quota.status(a.user.id))).used).toBe(1);
    const receipt = await run(() => quota.reserve(a.user.id));
    await run(() => quota.refund(receipt));
    await run(() => quota.refund(receipt));
    expect((await run(() => quota.status(a.user.id))).used).toBe(1);
  });

  test("uploads: capped, AI extraction costs a consultation (refunded if it fails), unattached ones are collected, thread deletion removes files", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    const upload = (buf, type) => fetch(`${base}/api/law/chat/attachments`, { method: "POST", headers: { "Content-Type": type, Authorization: `Bearer ${a.token}` }, body: buf });
    const png = Buffer.concat([Buffer.from("89504e47", "hex"), Buffer.alloc(20, 1)]);
    // no Gemini: images are UNSUPPORTED and free
    const first = await (await upload(png, "image/png")).json();
    expect(first.attachment.status).toBe("UNSUPPORTED");
    expect((await run(() => quota.status(a.user.id))).used).toBe(0);
    // with Gemini: the image costs one consultation
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_MODEL_MULTIMODAL = "gemini-flash";
    await tmp.client.lawSetting.upsert({ where: { key: "aiBudgetGeminiUsd" }, create: { key: "aiBudgetGeminiUsd", value: "5" }, update: { value: "5" } });
    router.setClientFactory({
      gemini: () => ({ generate: async () => ({ text: "{}", json: { pages: [{ index: 0, text: "نص مستخرج" }] }, model: "g", usage: { tokensIn: 1, tokensOut: 1 } }) }),
      deepseek: () => ({ generate: async () => { throw new Error("unused"); } }),
    });
    const ok = await (await upload(png, "image/png")).json();
    expect(ok.attachment.status).toBe("EXTRACTED");
    expect((await run(() => quota.status(a.user.id))).used).toBe(1);
    router.setClientFactory({
      gemini: () => ({ generate: async () => { throw new ProviderError("down", 503); } }),
      deepseek: () => ({ generate: async () => { throw new Error("unused"); } }),
    });
    expect((await (await upload(png, "image/png")).json()).attachment.status).toBe("FAILED");
    expect((await run(() => quota.status(a.user.id))).used).toBe(1); // failure refunded
    // pending cap: at most 10 unattached uploads
    let last;
    for (let i = 0; i < 12; i++) last = await upload(png, "image/png");
    expect(last.status).toBe(429);
    // stale unattached uploads are collected on the next upload
    await tmp.client.lawChatAttachment.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    expect((await upload(png, "image/png")).status).toBe(201);
    expect(await tmp.client.lawChatAttachment.count()).toBe(1);
    // a thread's attachments disappear (rows + files) with the thread
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    const att = (await (await upload(png, "image/png")).json()).attachment;
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    router.setClientFactory({
      gemini: () => ({ generate: async () => { throw new Error("unused"); } }),
      deepseek: () => ({ generate: async () => ({ text: "{}", json: reply, model: "d", usage: { tokensIn: 1, tokensOut: 1 } }) }),
    });
    expect((await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟", { attachmentIds: [att.id] })).status).toBe(201);
    const file = (await tmp.client.lawChatAttachment.findUnique({ where: { id: att.id } })).storagePath;
    expect(fsx.existsSync(pathx.join(storageDir, "law", file))).toBe(true);
    expect((await call("DELETE", `/law/chat/threads/${t.id}`, { token: a.token })).status).toBe(200);
    expect(fsx.existsSync(pathx.join(storageDir, "law", file))).toBe(false);
    expect(await tmp.client.lawChatAttachment.count({ where: { id: att.id } })).toBe(0);
  });

  test("offline packs list articles in natural order; unreviewed codes are flagged in the answer", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    await asSystem(async () => {
      const { import: imp } = await LawCorpus.createImport({ codeSlug: "CONST-2011", validFrom: "2011-07-29", text: "الفصل 2\nنص تجريبي دستوري.\nالفصل 10\nنص تجريبي آخر." });
      await LawCorpus.commitImport(imp.id);
    });
    const pack = (await call("GET", "/law/corpus/codes/CONST-2011/export", { token: a.token })).body;
    expect(pack.articles.map((x) => x.canonicalId)).toEqual(["CONST-2011:2", "CONST-2011:10"]);
    const t = await mkThread(a.token, { codeSlugs: ["CONST-2011"] });
    reply = { answer: "[CONST-2011:2]", citations: [{ canonicalId: "CONST-2011:2" }] };
    const r = await ask(a.token, t.id, "ما نص دستوري تجريبي؟");
    expect(r.body.messages.find((m) => m.role === "assistant").citations.unreviewed).toEqual(["CONST-2011"]);
  });
});
