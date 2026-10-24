// Phase 10: the Brain: learner memory lifecycle/isolation/opt-out, drills, classifier rules, tutor corrections, aggregates.
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
const { LawTutorBrain } = require("../../models/lawTutorBrain");
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
let replies = {};
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
  // the notice that discloses the memory (1.1.0) must be accepted before anything is collected
  await call("POST", "/law/auth/consent", { token: v.body.token, body: { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" } });
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
  replies = {};
  failWith = null;
  router.setClientFactory({
    gemini: () => ({ generate: async () => { throw new Error("gemini unused"); } }),
    deepseek: () => ({
      generate: async (req) => {
        aiCalls.push({ purpose: req.purpose, text: req.parts.map((p) => p.text).join("\n") });
        if (failWith) throw failWith;
        const j = replies[req.purpose] ?? reply;
        return { text: JSON.stringify(j), json: j, model: "fake", usage: { tokensIn: 100, tokensOut: 50 } };
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
  await LawBrain.drain(); // background classifier calls must not outlive the test database
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
const get = (s, u) => call("GET", u, { token: s.token });
const NOW = new Date("2026-10-12T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000);
const pairByLabel = async (label) => (await tmp.client.lawConfusionPair.findFirst({ where: { labelAr: { contains: label } } }));
const conceptBySlug = (slug) => tmp.client.lawConcept.findUnique({ where: { slug } });
let adminSeq = 0;
const adminUser = async () => { const a = await signUp("المشرف", `admin${++adminSeq}@example.ma`); await tmp.client.users.update({ where: { id: a.user.id }, data: { role: "admin" } }); return a; };
async function seedBrain() { await run(() => LawBrain.ensureTaxonomySeed()); }
const memories = (u) => tmp.client.lawLearnerMemory.findMany({ where: { userId: u.user.id }, include: { evidence: true } });

describe("learner memory over the real flows", () => {
  test("taxonomy seeds once, unreviewed, with no invented article references", async () => {
    await seedBrain();
    await seedBrain();
    expect(await tmp.client.lawConcept.count()).toBe(13);
    expect(await tmp.client.lawConfusionPair.count()).toBe(8);
    const cs = await tmp.client.lawConcept.findMany();
    expect(cs.every((c) => !c.reviewed && c.legalRefs === "[]")).toBe(true);
    expect((await tmp.client.lawConfusionPair.findMany()).every((p) => !p.reviewed && p.contrastMd === null)).toBe(true);
  });

  test("DB lifecycle: distractor -> ACTIVE; correct drills -> IMPROVING -> RESOLVED (>= 2 days); relapse -> ACTIVE; dismiss cooldown", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const pair = await pairByLabel("البطلان");
    const rec = (over) => run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, refId: "r", ...over }));
    expect((await rec({ source: "QUIZ_DISTRACTOR", at: daysAgo(10) })).status).toBe("ACTIVE");
    expect((await rec({ source: "DRILL_CORRECT", weight: 0, at: daysAgo(3) })).status).toBe("ACTIVE");
    expect((await rec({ source: "DRILL_CORRECT", weight: 0, at: daysAgo(2) })).status).toBe("IMPROVING");
    expect((await rec({ source: "DRILL_CORRECT", weight: 0, at: daysAgo(1) })).status).toBe("RESOLVED");
    expect((await rec({ source: "QUIZ_DISTRACTOR", at: daysAgo(0) })).status).toBe("ACTIVE");
    const [m] = await memories(a);
    expect(m.summaryAr).toContain("البطلان");
    expect(m.evidenceCount).toBe(5);
    // dismiss: the student says "not a weakness"; chat can't re-suspect it for 60 days
    expect((await call("PATCH", `/law/brain/me/${m.id}`, { token: a.token, body: { status: "DISMISSED" } })).status).toBe(200);
    expect((await rec({ source: "CHAT", at: new Date() })).status).toBe("DISMISSED");
    expect((await call("PATCH", `/law/brain/me/${m.id}`, { token: a.token, body: { status: "HACKED" } })).status).toBe(400);
  });

  test("classifier: closed taxonomy only, confidence >= 0.75, the STUDENT's own words, budget, chat-only stays SUSPECTED", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    const pair = await pairByLabel("البطلان");
    const q = "أظن أن البطلان والإبطال نفس الشيء في آثار العقد، ما أثر الفعل الضار عن بينة واختيار؟";
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    const bad = [
      { pairId: "not-in-taxonomy", confidence: 0.99, span: "البطلان والإبطال نفس الشيء" }, // outside the closed taxonomy
      { pairId: pair.id, confidence: 0.5, span: "البطلان والإبطال نفس الشيء" }, // not confident
      { pairId: pair.id, confidence: 0.99, span: "جملة لم يكتبها الطالب" }, // not the student's own words
      { pairId: pair.id, confidence: 0.99, span: "" },
    ];
    replies.brain_classify = { items: bad };
    expect((await ask(a.token, t.id, q)).status).toBe(201);
    await LawBrain.drain();
    expect(await tmp.client.lawLearnerMemory.count()).toBe(0);
    // a valid item is accepted: CHAT evidence weight 0.4 => SUSPECTED (chat only), excerpt = the student's words
    replies.brain_classify = { items: [{ pairId: pair.id, confidence: 0.9, span: "البطلان والإبطال نفس الشيء" }] };
    await ask(a.token, t.id, q);
    await LawBrain.drain();
    const [m] = await memories(a);
    expect(m.status).toBe("SUSPECTED");
    expect(m.evidence[0]).toMatchObject({ source: "CHAT", weight: 0.4, excerpt: "البطلان والإبطال نفس الشيء" });
    // the classifier never ran for the student's quota: only chat turns were charged
    expect((await run(() => require("../../utils/law/aiQuota").status(a.user.id))).used).toBe(2);
    // budget exhausted: the classifier is skipped, nothing breaks
    await tmp.client.lawSetting.upsert({ where: { key: "aiBrainDailyBudget" }, create: { key: "aiBrainDailyBudget", value: "0" }, update: { value: "0" } });
    const before = aiCalls.filter((c) => c.purpose === "brain_classify").length;
    expect((await ask(a.token, t.id, q)).status).toBe(201);
    await LawBrain.drain();
    expect(aiCalls.filter((c) => c.purpose === "brain_classify").length).toBe(before);
  });

  test("opt-out: nothing is collected and nothing is injected while memory is off; turning it on again works", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const pair = await pairByLabel("البطلان");
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r" }));
    expect((await call("PATCH", "/law/me/preferences", { token: a.token, body: { memoryEnabled: false } })).body.preferences.memoryEnabled).toBe(false);
    expect(await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r2" }))).toBeNull();
    expect((await get(a, "/law/brain/me")).body.enabled).toBe(false);
    expect((await get(a, "/law/brain/today")).body).toMatchObject({ enabled: false, memory: null });
    expect((await get(a, "/law/brain/drills")).body.drills).toEqual([]);
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    await tmp.client.lawConcept.update({ where: { slug: "nullite-absolue" }, data: { legalRefs: JSON.stringify([{ slug: "DOC", number: "77" }]) } });
    await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    await LawBrain.drain();
    expect(aiCalls.some((c) => c.purpose === "brain_classify")).toBe(false);
    expect(aiCalls.find((c) => c.purpose === "legal_chat").text).not.toContain("<learner_notes>");
    expect((await memories(a))[0].evidenceCount).toBe(1);
    await call("PATCH", "/law/me/preferences", { token: a.token, body: { memoryEnabled: true } });
    await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟ مرة أخرى");
    expect(aiCalls.filter((c) => c.purpose === "legal_chat").at(-1).text).toContain("<learner_notes>");
  });

  test("isolation: A's memories are in A's prompt and API only; transparency actions", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const b = await signUp("يوسف", "b@example.ma");
    const pair = await pairByLabel("البطلان");
    await tmp.client.lawConcept.update({ where: { slug: "nullite-absolue" }, data: { legalRefs: JSON.stringify([{ slug: "DOC", number: "77" }]) } });
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "q1", excerpt: "my words" }));
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    const ta = await mkThread(a.token, { codeSlugs: ["DOC"] });
    const tb = await mkThread(b.token, { codeSlugs: ["DOC"] });
    await ask(a.token, ta.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    await ask(b.token, tb.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    const chats = aiCalls.filter((c) => c.purpose === "legal_chat");
    expect(chats[0].text).toContain("<learner_notes>");
    expect(chats[0].text).toContain("البطلان");
    expect(chats[1].text).not.toContain("<learner_notes>");
    expect(chats[1].text).not.toContain("البطلان ↔");
    expect((await get(b, "/law/brain/me")).body.memories).toEqual([]);
    const mine = (await get(a, "/law/brain/me")).body.memories;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: "ACTIVE", evidence: [{ source: "QUIZ_DISTRACTOR", excerpt: "my words" }] });
    // other students can neither dismiss nor delete it
    expect((await call("PATCH", `/law/brain/me/${mine[0].id}`, { token: b.token, body: { status: "DISMISSED" } })).status).toBe(404);
    expect((await call("DELETE", `/law/brain/me/${mine[0].id}`, { token: b.token })).status).toBe(404);
    // export, delete one, reset all
    const exp = await get(a, "/law/brain/me/export");
    expect(exp.headers).toBeUndefined();
    expect(exp.body.memories).toHaveLength(1);
    expect((await call("DELETE", `/law/brain/me/${mine[0].id}`, { token: a.token })).status).toBe(200);
    expect(await tmp.client.lawLearnerEvidence.count()).toBe(0);
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "q2" }));
    expect((await call("DELETE", "/law/brain/me", { token: a.token })).status).toBe(200);
    expect(await tmp.client.lawLearnerMemory.count()).toBe(0);
    // admins have no route to individual memories
    const adm = await adminUser();
    expect((await get(adm, `/law/brain/me`)).body.memories).toEqual([]);
  });

  test("reviewed contrast tables reach the tutor; mastered concepts shorten explanations; the student is never named as a case", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const pair = await pairByLabel("البطلان");
    const cs = [await conceptBySlug("nullite-absolue"), await conceptBySlug("annulabilite")];
    await tmp.client.lawConcept.update({ where: { id: cs[0].id }, data: { legalRefs: JSON.stringify([{ slug: "DOC", number: "77" }]) } });
    await tmp.client.lawConfusionPair.update({ where: { id: pair.id }, data: { contrastMd: "| معيار | البطلان | الإبطال |", reviewed: true } });
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r" }));
    // a concept the student masters (>= 3 cards, >= 60% stable) in the scope
    const subj = await tmp.client.lawSubject.create({ data: { name: "م", userId: a.user.id } });
    const prescription = await conceptBySlug("prescription");
    await tmp.client.lawConcept.update({ where: { id: prescription.id }, data: { legalRefs: JSON.stringify([{ slug: "DOC", number: "78" }]) } });
    for (let i = 0; i < 3; i++) await tmp.client.lawFlashcard.create({ data: { subjectId: subj.id, origin: "manual", front: `f${i}`, back: "b", userId: a.user.id, state: "review", stability: 40, conceptIds: JSON.stringify([prescription.id]) } });
    reply = { answer: "[DOC:77]", citations: [{ canonicalId: "DOC:77" }] };
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    const text = aiCalls.find((c) => c.purpose === "legal_chat").text;
    expect(text).toContain("| معيار | البطلان | الإبطال |");
    expect(text).toContain("مفاهيم متقنة");
    expect(text).toContain("التقادم");
    expect(text).not.toContain("سلمى");
    // learner notes cap at 5 memories
    for (const label of ["الدعوى العمومية", "التقادم", "سحب", "المسؤولية العقدية", "الجناية ↔ الجنحة", "الجنحة ↔ المخالفة"]) {
      const p = await pairByLabel(label);
      await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: p.id, source: "QUIZ_DISTRACTOR", refId: "r" }));
    }
    const all = await tmp.client.lawConcept.findMany();
    for (const c of all) await tmp.client.lawConcept.update({ where: { id: c.id }, data: { legalRefs: JSON.stringify([{ slug: "DOC", number: "77" }]) } });
    const notes = await run(() => LawBrain.learnerNotes(a.user.id, ["DOC"]));
    expect(notes.memoryIds).toHaveLength(5);
  });
});

describe("signals: FSRS lapses and drills", () => {
  test("a lapse on a concept-tagged card is a GAP (+0.5); lapses on both sides of a pair within 14 days are a CONFUSION", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const [c1, c2] = [await conceptBySlug("prescription"), await conceptBySlug("decheance")];
    const subj = await tmp.client.lawSubject.create({ data: { name: "م", userId: a.user.id } });
    const mk = (c, n) => tmp.client.lawFlashcard.create({ data: { subjectId: subj.id, origin: "manual", front: `c${n}`, back: "b", userId: a.user.id, conceptIds: JSON.stringify([c.id]) } });
    const [k1, k2] = [await mk(c1, 1), await mk(c2, 2)];
    const review = (card, n) => call("POST", "/law/reviews/batch", { token: a.token, body: { logs: [{ clientReviewId: `review-${n}-abcdef`, cardId: card.id, rating: 1, reviewedAt: new Date().toISOString(), durationMs: 1000 }] } });
    expect((await review(k1, 1)).status).toBe(200);
    let ms = await memories(a);
    expect(ms.map((m) => [m.kind, m.status, m.strength])).toEqual([["GAP", "SUSPECTED", 0.5]]);
    expect((await review(k2, 2)).status).toBe(200);
    ms = await memories(a);
    expect(ms.filter((m) => m.kind === "CONFUSION")).toHaveLength(1); // both sides lapsed
    expect(ms.filter((m) => m.kind === "GAP")).toHaveLength(2);
    // a plain "good" review adds nothing; an untagged card adds nothing
    const before = (await tmp.client.lawLearnerEvidence.count());
    await call("POST", "/law/reviews/batch", { token: a.token, body: { logs: [{ clientReviewId: "review-9-abcdef", cardId: k1.id, rating: 3, reviewedAt: new Date().toISOString(), durationMs: 1000 }] } });
    expect(await tmp.client.lawLearnerEvidence.count()).toBe(before);
  });

  test("drills: the bank first, correct answers are never leaked, wrong answers become evidence + a flashcard, correct ones remediate", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const adm = await adminUser();
    const pair = await pairByLabel("البطلان");
    const item = { pairId: pair.id, kind: "WHICH_APPLIES", prompt: "عقد أبرمه قاصر دون إذن وليه: أي وصف؟", options: [{ text: "بطلان", correct: false }, { text: "إبطال", correct: true }, { text: "سقوط", correct: false }], explanation: "الأهلية." };
    expect((await call("POST", "/law/admin/drill-items", { token: a.token, body: item })).status).toBe(403);
    expect((await call("POST", "/law/admin/drill-items", { token: adm.token, body: { ...item, options: [{ text: "x", correct: true }, { text: "y", correct: true }] } })).status).toBe(400);
    expect((await call("POST", "/law/admin/drill-items", { token: adm.token, body: { ...item, citedIds: ["DOC:999"] } })).status).toBe(400); // unknown article
    const made = await call("POST", "/law/admin/drill-items", { token: adm.token, body: { ...item, citedIds: ["DOC:77"], reviewed: true } });
    expect(made.status).toBe(201);
    expect((await get(a, "/law/brain/drills")).body.drills).toEqual([]); // nothing to remediate yet
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "FSRS_LAPSE", refId: "x", weight: 0.5 }));
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "FSRS_LAPSE", refId: "y", weight: 0.5 }));
    const drills = (await get(a, "/law/brain/drills")).body.drills;
    expect(drills).toHaveLength(1);
    expect(JSON.stringify(drills)).not.toContain("correct"); // the answer key never leaves the server
    expect(drills[0].options).toEqual([{ text: "بطلان" }, { text: "إبطال" }, { text: "سقوط" }]);
    const wrong = await call("POST", `/law/brain/drills/${drills[0].id}/answer`, { token: a.token, body: { optionIndex: 0 } });
    expect(wrong.body).toMatchObject({ correct: false, correctIndex: 1, explanation: "الأهلية." });
    expect(await tmp.client.lawFlashcard.count({ where: { userId: a.user.id, front: item.prompt } })).toBe(1); // the miss enters FSRS
    await call("POST", `/law/brain/drills/${drills[0].id}/answer`, { token: a.token, body: { optionIndex: 0 } });
    expect(await tmp.client.lawFlashcard.count({ where: { userId: a.user.id } })).toBe(1); // no duplicate card
    expect((await call("POST", `/law/brain/drills/${drills[0].id}/answer`, { token: a.token, body: { optionIndex: 9 } })).status).toBe(404);
    const ok = await call("POST", `/law/brain/drills/${drills[0].id}/answer`, { token: a.token, body: { optionIndex: 1 } });
    expect(ok.body.correct).toBe(true);
    const ev = (await memories(a))[0].evidence.map((e) => e.source).sort();
    expect(ev).toEqual(["DRILL_CORRECT", "FSRS_LAPSE", "FSRS_LAPSE", "QUIZ_DISTRACTOR", "QUIZ_DISTRACTOR"]);
  });

  test("AI drill generation: needs corpus-backed concepts, only cites the provided articles, is flagged AI + unreviewed", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const pair = await pairByLabel("البطلان");
    expect((await call("POST", "/law/brain/drills/generate", { token: a.token, body: { pairId: pair.id } })).status).toBe(404); // no weakness on this pair: nothing to generate for
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "q0", at: daysAgo(9) }));
    expect((await call("POST", "/law/brain/drills/generate", { token: a.token, body: { pairId: pair.id } })).status).toBe(409); // no refs yet
    for (const slug of ["nullite-absolue", "annulabilite"]) await tmp.client.lawConcept.update({ where: { slug }, data: { legalRefs: JSON.stringify([{ slug: "DOC", number: "77" }]) } });
    replies.brain_drill = { kind: "WHICH_APPLIES", prompt: "أي وصف يناسب؟", options: [{ text: "أ", correct: true }, { text: "ب", correct: false }], explanation: "شرح", citedIds: ["DOC:999"] };
    expect((await call("POST", "/law/brain/drills/generate", { token: a.token, body: { pairId: pair.id } })).status).toBe(502); // cited outside the provided articles
    replies.brain_drill.citedIds = ["DOC:77"];
    const r = await call("POST", "/law/brain/drills/generate", { token: a.token, body: { pairId: pair.id } });
    expect(r.status).toBe(201);
    expect(r.body.item).toMatchObject({ aiGenerated: true });
    expect(JSON.stringify(r.body)).not.toContain('"correct"');
    expect(aiCalls.find((c) => c.purpose === "brain_drill").text).toContain("[DOC:77]");
    const row = await tmp.client.lawDrillItem.findFirst();
    expect(row).toMatchObject({ source: "AI", reviewed: false });
    // private to its owner until reviewed: other students never get it, and a wrong pick never counts against anyone
    expect(row.ownerUserId).toBe(a.user.id);
    const b = await signUp("يوسف", "b@example.ma");
    await run(() => LawBrain.record(b.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "qb" }));
    expect((await get(b, "/law/brain/drills")).body.drills).toEqual([]);
    expect((await call("POST", `/law/brain/drills/${row.id}/answer`, { token: b.token, body: { optionIndex: 0 } })).status).toBe(404);
    const before = (await memories(a))[0].evidenceCount;
    await run(() => LawBrain.answerDrill(a.user.id, row.id, 1, daysAgo(5))); // the wrong key option: no evidence
    expect((await memories(a))[0].evidenceCount).toBe(before);
    expect(await tmp.client.lawFlashcard.count({ where: { userId: a.user.id } })).toBe(0); // and no flashcard from an unreviewed key
    // right answers improve but can never resolve (unreviewed)
    for (let d = 4; d >= 1; d--) await run(() => LawBrain.answerDrill(a.user.id, row.id, 0, daysAgo(d)));
    expect((await memories(a))[0].status).toBe("IMPROVING");
    // reports: one per student; three distinct students pull a REVIEWED item back; the reporter stops seeing it at once
    await tmp.client.lawDrillItem.update({ where: { id: row.id }, data: { reviewed: true, ownerUserId: null } });
    const reporters = [a, b, await signUp("ج", "c@example.ma")];
    for (const r of reporters) await run(() => LawBrain.record(r.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "qq" }));
    expect((await get(b, "/law/brain/drills")).body.drills).toHaveLength(1);
    expect((await call("POST", `/law/brain/drills/${row.id}/report`, { token: b.token })).status).toBe(200);
    await call("POST", `/law/brain/drills/${row.id}/report`, { token: b.token }); // repeating counts once
    expect((await get(b, "/law/brain/drills")).body.drills).toEqual([]);
    expect((await tmp.client.lawDrillItem.findUnique({ where: { id: row.id } })).reviewed).toBe(true);
    for (const r of [reporters[0], reporters[2]]) await call("POST", `/law/brain/drills/${row.id}/report`, { token: r.token });
    expect((await tmp.client.lawDrillItem.findUnique({ where: { id: row.id } })).reviewed).toBe(false);
    // generation is rate limited per student
    await tmp.client.lawRateCounter.deleteMany({});
    let last;
    for (let i = 0; i < 6; i++) last = await call("POST", "/law/brain/drills/generate", { token: a.token, body: { pairId: pair.id } });
    expect(last.status).toBe(429);
  });
});

describe("tutor corrections", () => {
  async function reported() {
    const a = await signUp("سلمى", "a@example.ma");
    const t = await mkThread(a.token, { codeSlugs: ["DOC"] });
    reply = { answer: "التعويض واجب بمقتضى [DOC:77] ويسقط بعد سنة.", citations: [{ canonicalId: "DOC:77" }] };
    const bot = (await ask(a.token, t.id, "ما أثر الفعل الضار عن بينة واختيار؟")).body.messages.find((m) => m.role === "assistant");
    return { a, t, bot };
  }

  test("reporting needs a quote from the message and a corpus article; it stays USER-scoped and changes only the reporter's prompts until an admin verifies", async () => {
    const { a, bot } = await reported();
    const b = await signUp("يوسف", "b@example.ma");
    const post = (token, body, id = bot.id) => call("POST", `/law/ai/messages/${id}/corrections`, { token, body });
    expect((await post(b.token, { claim: "ويسقط بعد سنة", correction: "تصحيح مختصر لكن كاف", citations: [{ slug: "DOC", number: "77" }] })).status).toBe(404); // not their message
    expect((await post(a.token, { claim: "جملة غير موجودة تماما", correction: "تصحيح مختصر لكن كاف", citations: [{ slug: "DOC", number: "77" }] })).body.error.code).toBe("claim_not_in_message");
    expect((await post(a.token, { claim: "ويسقط بعد سنة", correction: "تصحيح مختصر لكن كاف", citations: [] })).body.error.code).toBe("citation_required");
    expect((await post(a.token, { claim: "ويسقط بعد سنة", correction: "تصحيح مختصر لكن كاف", citations: [{ slug: "DOC", number: "999" }] })).body.error.code).toBe("unknown_article");
    const ok = await post(a.token, { claim: "ويسقط بعد سنة", correction: "لا يسقط التعويض بعد سنة بل يخضع للنص", citations: [{ slug: "DOC", number: "77" }] });
    expect(ok.status).toBe(201);
    expect(ok.body.correction).toMatchObject({ status: "PENDING", scope: "USER" });
    // the reporter's next answer on that topic carries the dispute; another student's does not
    const t2 = await mkThread(a.token, { codeSlugs: ["DOC"] });
    const tb = await mkThread(b.token, { codeSlugs: ["DOC"] });
    await ask(a.token, t2.id, "ما أثر الفعل الضار عن بينة واختيار؟ مرة ثانية");
    await ask(b.token, tb.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    const chats = aiCalls.filter((c) => c.purpose === "legal_chat");
    expect(chats[1].text).toContain("<user_disputes>");
    expect(chats[1].text).toContain("أعد التحقق");
    expect(chats[2].text).not.toContain("<user_disputes>");
    expect(chats[2].text).not.toContain("<verified_corrections>");
  });

  test("admin verification: MODEL_ERROR becomes global for everyone; other causes do not; eval case + XP + notification; decisions are final", async () => {
    const { a, bot } = await reported();
    const b = await signUp("يوسف", "b@example.ma");
    const adm = await adminUser();
    const mk = async () => (await call("POST", `/law/ai/messages/${bot.id}/corrections`, { token: a.token, body: { claim: "ويسقط بعد سنة", correction: "لا يسقط بعد سنة", citations: [{ slug: "DOC", number: "77" }] } })).body.correction.id;
    const id1 = await mk();
    expect((await call("POST", `/law/admin/corrections/${id1}/decide`, { token: a.token, body: { decision: "verify", rootCause: "MODEL_ERROR" } })).status).toBe(403);
    expect((await call("POST", `/law/admin/corrections/${id1}/decide`, { token: adm.token, body: { decision: "verify" } })).status).toBe(400); // root cause required
    const evalDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "evals-"));
    process.env.LAWOS_EVAL_DIR = evalDir;
    const dec = await call("POST", `/law/admin/corrections/${id1}/decide`, { token: adm.token, body: { decision: "verify", rootCause: "MODEL_ERROR", evalQuestion: "ما أثر الفعل الضار عن بينة واختيار؟" } });
    expect(dec.status).toBe(200);
    expect(dec.body.correction).toMatchObject({ status: "VERIFIED", scope: "GLOBAL", rootCause: "MODEL_ERROR" });
    expect(dec.body.evalCase).not.toHaveProperty("studentMessage");
    expect(dec.body.evalCase).toMatchObject({ question: "ما أثر الفعل الضار عن بينة واختيار؟", mustCite: ["DOC:77"], mustNotSay: ["ويسقط بعد سنة"], scope: { codeSlugs: ["DOC"] } });
    expect(JSON.parse(require("fs").readFileSync(require("path").join(evalDir, `${id1}.json`), "utf8")).id).toBe(id1);
    delete process.env.LAWOS_EVAL_DIR;
    expect((await call("POST", `/law/admin/corrections/${id1}/decide`, { token: adm.token, body: { decision: "reject" } })).status).toBe(409);
    expect((await get(a, "/law/notifications")).body.items.map((n) => n.type)).toContain("AI_CORRECTION_VERIFIED");
    expect((await get(a, "/law/profile")).body.progress.xp).toBe(25);
    // everyone now gets the verified correction on matching topics
    const tb = await mkThread(b.token, { codeSlugs: ["DOC"] });
    await ask(b.token, tb.id, "ما أثر الفعل الضار عن بينة واختيار؟");
    const last = aiCalls.filter((c) => c.purpose === "legal_chat").at(-1).text;
    expect(last).toContain("<verified_corrections>");
    expect(last).toContain("لا يسقط بعد سنة");
    expect(last).not.toContain("<user_disputes>");
    // a corpus/prompt cause is verified but stays out of the global prompt block
    const id2 = await mk();
    process.env.LAWOS_EVAL_DIR = evalDir;
    const d2 = await call("POST", `/law/admin/corrections/${id2}/decide`, { token: adm.token, body: { decision: "verify", rootCause: "CORPUS_PARSE" } });
    delete process.env.LAWOS_EVAL_DIR;
    expect(d2.body.correction).toMatchObject({ scope: "USER", rootCause: "CORPUS_PARSE" });
    const listed = await get(adm, "/law/admin/corrections?status=VERIFIED");
    expect(listed.body.corrections).toHaveLength(2);
    // reject path
    const id3 = await mk();
    expect((await call("POST", `/law/admin/corrections/${id3}/decide`, { token: adm.token, body: { decision: "reject" } })).status).toBe(200);
    expect((await get(a, "/law/ai/corrections")).body.corrections.map((c) => c.status).sort()).toEqual(["REJECTED", "VERIFIED", "VERIFIED"]);
  });
});

describe("consent, Today, path, aggregates", () => {
  test("nothing is collected before the 1.1.0 notice is accepted", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const pair = await pairByLabel("البطلان");
    await tmp.client.lawUserConsent.update({ where: { userId: a.user.id }, data: { version: "1.0.0" } });
    expect(await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r" }))).toBeNull();
    expect((await get(a, "/law/brain/today")).body).toMatchObject({ enabled: false });
    await call("POST", "/law/auth/consent", { token: a.token, body: { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" } });
    expect((await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r" }))).status).toBe("ACTIVE");
  });

  test("the consent version was bumped: students on 1.0.0 are asked again; the notice mentions the memory and its off switch", async () => {
    const a = await signUp("سلمى", "a@example.ma");
    await tmp.client.lawUserConsent.update({ where: { userId: a.user.id }, data: { version: "1.0.0" } });
    expect((await get(a, "/law/auth/consent")).body).toMatchObject({ accepted: false, version: "1.1.0", acceptedVersion: "1.0.0" });
    const notice = require("fs").readFileSync(require("path").join(__dirname, "../../../frontend/src/components/LawOS/Legal/notice.jsx"), "utf8");
    expect(notice).toContain('NOTICE_VERSION = "1.1.0"');
    expect(notice).toContain("ذاكرتي");
    expect(notice).toContain("Ma mémoire");
  });

  test("Today: the strongest active weakness with a drill; the nudge reminds once a day after 3 idle days and respects preferences", async () => {
    await seedBrain();
    const a = await signUp("سلمى", "a@example.ma");
    const adm = await adminUser();
    const pair = await pairByLabel("البطلان");
    expect((await get(a, "/law/brain/today")).body).toMatchObject({ enabled: true, memory: null, drill: null });
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r", at: daysAgo(0.001) }));
    await call("POST", "/law/admin/drill-items", { token: adm.token, body: { pairId: pair.id, kind: "TRUE_FALSE", prompt: "صحيح؟", options: [{ text: "نعم", correct: true }, { text: "لا", correct: false }], reviewed: true } });
    const today = (await get(a, "/law/brain/today")).body;
    expect(today.memory).toMatchObject({ status: "ACTIVE", pairId: pair.id });
    expect(today.drill.prompt).toBe("صحيح؟");
    // fresh weakness: no nudge. Idle for 4 days: one nudge, and only one per day.
    expect(await run(() => LawBrain.nudgeAll(NOW))).toBe(0);
    const idle = new Date(Date.now() + 4 * 86400000);
    expect(await run(() => LawBrain.nudgeAll(idle))).toBe(1);
    expect(await run(() => LawBrain.nudgeAll(idle))).toBe(0);
    expect((await get(a, "/law/notifications")).body.items[0].type).toBe("BRAIN_REMINDER");
    // reminders off => none
    await tmp.client.lawNotification.deleteMany({});
    await call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyReminders: false } });
    expect(await run(() => LawBrain.nudgeAll(new Date(Date.now() + 9 * 86400000)))).toBe(0);
  });

  test("path nodes teaching a concept the student is weak on are flagged", async () => {
    await seedBrain();
    const adm = await adminUser();
    const a = await signUp("سلمى", "a@example.ma");
    await tmp.client.lawUserProfile.updateMany({ where: { userId: a.user.id }, data: { facultyCode: "FSJES_AIN_CHOCK", track: "PRIVE", studyLang: "AR" } });
    const csv = "semester,track,language,groupCode,dayOfWeek,startTime,endTime,subject,kind,room,professor\nS3,PRIVE,AR,G01,1,11:00,13:15,المسؤولية المدنية,COURS,2,X\n";
    const imp = await call("POST", "/law/admin/timetable/import-csv", { token: adm.token, body: { season: "AUTOMNE", csv } });
    await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: adm.token });
    const mod = (await get(a, "/law/path/semesters/S3/modules")).body.modules[0];
    const concept = await conceptBySlug("responsabilite-contractuelle");
    const node = await tmp.client.lawPathNode.findFirst({ where: { moduleId: mod.id }, orderBy: { ordinal: "asc" } });
    await tmp.client.lawPathNode.update({ where: { id: node.id }, data: { conceptIds: JSON.stringify([concept.id]) } });
    expect((await get(a, `/law/path/modules/${mod.id}/graph`)).body.nodes[0].weak).toBe(false);
    const pair = await pairByLabel("المسؤولية العقدية");
    await run(() => LawBrain.record(a.user.id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "r" }));
    expect((await get(a, `/law/path/modules/${mod.id}/graph`)).body.nodes[0].weak).toBe(true);
    await call("PATCH", "/law/me/preferences", { token: a.token, body: { memoryEnabled: false } });
    expect((await get(a, `/law/path/modules/${mod.id}/graph`)).body.nodes[0].weak).toBe(false);
  });

  test("admin aggregates: exact cohort hidden, cells need >= 20 who have it AND >= 20 who don't, 10% buckets, seasoned accounts + 2 pieces of evidence only", async () => {
    await seedBrain();
    const adm = await adminUser();
    const a = await signUp("سلمى", "a@example.ma");
    const pair = await pairByLabel("البطلان");
    const other = await pairByLabel("التقادم");
    expect((await get(a, "/law/admin/brain/aggregates?semester=S3")).status).toBe(403);
    const old = new Date(Date.now() - 20 * 86400000);
    const mk = async (n) => { const ids = []; for (let i = 0; i < n; i++) { const u = await tmp.client.users.create({ data: { username: `agg${Math.random().toString(36).slice(2, 9)}`, password: "x", role: "default", createdAt: old } }); await tmp.client.lawUserProfile.create({ data: { userId: u.id, email: `agg${u.id}@example.ma`, fullName: "ط", semester: "S3" } }); await tmp.client.lawUserConsent.create({ data: { userId: u.id, termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" } }); ids.push(u.id); } return ids; };
    const weak = (id, p) => Promise.all([0, 1].map((i) => run(() => LawBrain.record(id, { kind: "CONFUSION", pairId: p.id, source: "QUIZ_DISTRACTOR", refId: `r${i}` }))));
    // 30 seasoned students: too few to split 20 / 20, even though 25 are weak
    const first = await mk(30);
    for (const id of first.slice(0, 25)) await weak(id, pair);
    expect((await get(adm, "/law/admin/brain/aggregates?semester=S3")).body).toEqual({ semester: "S3", cohort: "<40", rows: [] });
    // 45 students: 22 weak on pair 1 (shown), 3 on pair 2 (suppressed), and an everyone-has-it cell would be suppressed too
    const more = await mk(15);
    const all = [...first, ...more];
    await tmp.client.lawLearnerMemory.deleteMany({});
    for (const id of all.slice(0, 22)) await weak(id, pair);
    for (const id of all.slice(0, 3)) await weak(id, other);
    const r = (await get(adm, "/law/admin/brain/aggregates?semester=S3")).body;
    expect(r.cohort).toBe(">=40"); // never the exact size
    expect(r.rows).toEqual([{ pairId: pair.id, labelAr: pair.labelAr, percent: 50 }]); // 22/45 = 48.9% -> 50
    // "all but a few" cells are hidden (homogeneity): 30 of 45 have it => 15 do not => suppressed
    for (const id of all.slice(22, 30)) await weak(id, pair);
    expect((await get(adm, "/law/admin/brain/aggregates?semester=S3")).body.rows).toEqual([]);
    // brand-new accounts (Sybil padding) and single-evidence memories do not count
    await tmp.client.lawLearnerMemory.deleteMany({});
    for (const id of all.slice(0, 22)) await run(() => LawBrain.record(id, { kind: "CONFUSION", pairId: pair.id, source: "QUIZ_DISTRACTOR", refId: "only-one" }));
    expect((await get(adm, "/law/admin/brain/aggregates?semester=S3")).body.rows).toEqual([]);
    await tmp.client.users.updateMany({ where: { id: { in: all.slice(0, 22) } }, data: { createdAt: new Date() } });
    for (const id of all.slice(0, 22)) await weak(id, pair);
    expect((await get(adm, "/law/admin/brain/aggregates?semester=S3")).body.cohort).toBe("<40"); // fresh accounts left the cohort too
  });
});
