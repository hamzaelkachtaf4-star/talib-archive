// Qanouni Collab Phase C: referrals (creation at sign-up, anti-farming activation through real study,
// rewards: XP, badge, squad seats) and the AI multi-source synthesis of a session, through /api/law.
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
const { LawCorpus } = require("../../models/lawCorpus");
const { LawSetting } = require("../../models/lawSetting");
const { setMailTransport } = require("../../utils/law/mailer");
const router = require("../../utils/law/ai/router");
const { closeFts } = require("../../utils/law/fts");

jest.setTimeout(120000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };
let tmp;
let server;
let base;
let mails;
let aiReply;
let aiCalls;
let counter = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json };
}

/** Full email sign-up (code from the captured mail), optionally with an invite code; consent accepted. */
async function signUp(name, { referralCode } = {}) {
  const email = `r${++counter}@example.ma`;
  const r = await call("POST", "/law/auth/register", { body: { fullName: name, email, password: PASSWORD, ...(referralCode ? { referralCode } : {}) } });
  expect(r.status).toBe(202);
  const code = mails.at(-1).text.match(/\b(\d{6})\b/)[1];
  const v = await call("POST", "/law/auth/register/verify", { body: { email, code } });
  expect(v.status).toBe(201);
  const s = { token: v.body.token, id: v.body.user.id, name };
  await call("POST", "/law/auth/consent", { token: s.token, body: CONSENT });
  return s;
}

async function cards(s, n) {
  const subject = (await call("POST", "/law/subjects", { token: s.token, body: { name: "مادة" } })).body.subject;
  const out = [];
  for (let i = 0; i < n; i++)
    out.push((await call("POST", "/law/cards", { token: s.token, body: { subjectId: subject.id, origin: "manual", front: `س${i}`, back: `ج${i}` } })).body.card);
  return { subject, cards: out };
}

let reviewSeq = 0;
const reviews = (cardIds, count, { durationMs = 4000, at = new Date() } = {}) =>
  Array.from({ length: count }, (_, i) => ({
    clientReviewId: `review-${++reviewSeq}-${Date.now()}`,
    cardId: cardIds[i % cardIds.length],
    rating: 3,
    reviewedAt: new Date(at.getTime() - (count - i) * 60_000).toISOString(),
    durationMs,
  }));

beforeEach(async () => {
  process.env = { ...ENV, JWT_SECRET: "test-secret-for-qanouni", DEEPSEEK_API_KEY: "k", DEEPSEEK_BASE_URL: "http://x", DEEPSEEK_MODEL_REASONING: "r" };
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
  const gen = (provider) => async (req) => {
    aiCalls.push({ provider, ...req });
    return { text: JSON.stringify(aiReply), json: aiReply, model: "fake", usage: { tokensIn: 10, tokensOut: 10 } };
  };
  router.setClientFactory({ gemini: () => ({ generate: gen("gemini") }), deepseek: () => ({ generate: gen("deepseek") }) });
  await LawSetting.update({ aiBudgetDeepseekUsd: 5 });
  // Synthetic corpus fixture (not real statute text).
  const { import: imp } = await LawCorpus.createImport({ codeSlug: "DOC", validFrom: "1913-08-12", text: "الفصل 77\nنص تجريبي.\nالفصل 78\nنص تجريبي آخر." });
  await LawCorpus.commitImport(imp.id);
  await LawAccount.enableMultiUserMode();
  const app = express();
  app.use(bodyParser.json());
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

describe("referrals", () => {
  test("invite code, referral created at sign-up; unknown codes never block a sign-up", async () => {
    const amb = await signUp("سفيرة");
    const mine = (await call("GET", "/law/referrals", { token: amb.token })).body;
    expect(mine.code).toMatch(/^INV-[A-HJ-NP-Z2-9]{6}$/);
    expect(mine).toMatchObject({ referrals: [], activated: 0, ambassador: false, rules: { minSessions: 3, minReviews: 20, rewardXp: 250, maxSeats: 8 } });
    // Stable code.
    expect((await call("GET", "/law/referrals", { token: amb.token })).body.code).toBe(mine.code);

    const invited = await signUp("مدعوّ", { referralCode: mine.code.toLowerCase() });
    const row = await tmp.client.lawReferral.findUnique({ where: { referredUserId: invited.id } });
    expect(row).toMatchObject({ referrerId: amb.id, code: mine.code, status: "pending", activatedAt: null });
    const nobody = await signUp("بدون", { referralCode: "INV-ZZZZZZ" });
    expect(await tmp.client.lawReferral.findUnique({ where: { referredUserId: nobody.id } })).toBeNull();
    const list = (await call("GET", "/law/referrals", { token: amb.token })).body;
    expect(list.referrals).toEqual([expect.objectContaining({ name: "مدعوّ", status: "pending", progress: { sessions: 0, reviews: 0 } })]);
  });

  test("anti-farming: quick taps and one-card spam do not count; 20 real reviews on 5 cards activate", async () => {
    const amb = await signUp("سفيرة");
    const code = (await call("GET", "/law/referrals", { token: amb.token })).body.code;
    const inv = await signUp("مدعوّة", { referralCode: code });
    const { cards: cs } = await cards(inv, 6);
    const ids = cs.map((c) => c.id);
    const today = new Date();
    // 30 reviews under 1 s each: ignored.
    await call("POST", "/law/reviews/batch", { token: inv.token, body: { logs: reviews(ids, 30, { durationMs: 300, at: today }) } });
    // 25 real reviews, all on one card: not enough distinct cards (and only one study day).
    await call("POST", "/law/reviews/batch", { token: inv.token, body: { logs: reviews([ids[0]], 25, { at: today }) } });
    expect((await tmp.client.lawReferral.findFirst()).status).toBe("pending");
    expect((await call("GET", "/law/referrals", { token: amb.token })).body.referrals[0].progress).toEqual({ sessions: 1, reviews: 25 });
    // 20 real reviews across 5 cards: the review sync itself activates the referral.
    await call("POST", "/law/reviews/batch", { token: inv.token, body: { logs: reviews(ids.slice(1, 6), 20, { at: today }) } });
    const r = await tmp.client.lawReferral.findFirst();
    expect(r.status).toBe("activated");
    expect(r.activatedAt).not.toBeNull();
  });

  test("three study sessions (distinct days) activate too; rewards: +250 XP, badge, squad seats up to 8", async () => {
    const amb = await signUp("سفيرة");
    const code = (await call("GET", "/law/referrals", { token: amb.token })).body.code;
    const before = (await call("GET", "/law/profile", { token: amb.token })).body.progress.xp;

    const invitees = [];
    for (let i = 0; i < 3; i++) invitees.push(await signUp(`مدعو ${i}`, { referralCode: code }));
    const { subject } = await cards(invitees[0], 0);
    for (const date of ["2026-10-01", "2026-10-02"])
      await call("POST", "/law/sessions", { token: invitees[0].token, body: { subjectId: subject.id, date } });
    expect((await tmp.client.lawReferral.findUnique({ where: { referredUserId: invitees[0].id } })).status).toBe("pending");
    await call("POST", "/law/sessions", { token: invitees[0].token, body: { subjectId: subject.id, date: "2026-10-03" } });
    expect((await tmp.client.lawReferral.findUnique({ where: { referredUserId: invitees[0].id } })).status).toBe("activated");

    const prog = (await call("GET", "/law/profile", { token: amb.token })).body.progress;
    expect(prog.xp - before).toBe(250);
    expect(prog.weeklyXp).toBeGreaterThanOrEqual(250);
    expect(prog.ambassador).toBe(true);
    await call("PATCH", "/law/profile/public", { token: amb.token, body: { publicProfile: true } });
    expect((await call("GET", `/law/students/${amb.id}`, { token: invitees[1].token })).body.profile.badges).toContainEqual({ type: "ambassador" });

    // Squad seats: 6 + one per activated referral of a member → 7 now.
    const squad = (await call("POST", "/law/squads/create", { token: amb.token, body: { name: "فرقة السفيرة" } })).body.squad;
    expect(squad.maxMembers).toBe(7);
    const joiners = [];
    for (let i = 0; i < 7; i++) joiners.push(await signUp(`عضو ${i}`));
    const statuses = [];
    for (const j of joiners) statuses.push((await call("POST", "/law/squads/join", { token: j.token, body: { code: squad.inviteCode } })).body.error || "ok");
    expect(statuses).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "squad_full"]);
    // Two more activations would allow 9, but the cap is 8.
    for (const inv of invitees.slice(1))
      await tmp.client.lawReferral.update({ where: { referredUserId: inv.id }, data: { status: "activated", activatedAt: new Date() } });
    expect((await call("GET", "/law/squads/my", { token: amb.token })).body.squad.maxMembers).toBe(8);
    expect((await call("POST", "/law/squads/join", { token: joiners[6].token, body: { code: squad.inviteCode } })).status).toBe(200);
  });
});

describe("AI multi-source synthesis", () => {
  async function setup() {
    const a = await signUp("أمين");
    const b = await signUp("بشرى");
    const created = (await call("POST", "/law/squads/create", { token: a.token, body: { name: "ف" } })).body.squad;
    await call("POST", "/law/squads/join", { token: b.token, body: { code: created.inviteCode } });
    const ws = (await call("POST", "/law/squads/workspaces", { token: a.token, body: { moduleName: "المسؤولية المدنية", professorName: "د. س" } })).body.workspace;
    return { a, b, ws, url: `/law/squads/workspaces/${ws.id}/sessions/3` };
  }

  test("sources stay private to their author; own transcripts can be imported; limits", async () => {
    const { a, b, ws, url } = await setup();
    const sa = await call("POST", `${url}/sources`, { token: a.token, body: { kind: "text", label: "ملاحظاتي", content: "الخطأ إخلال بالتزام سابق." } });
    expect(sa.status).toBe(201);
    // A's own OCR derivative is imported (JSON pages flattened); B cannot import A's.
    const d = await tmp.client.lawDerivative.create({ data: { userId: a.id, kind: "ocr_text", content: JSON.stringify({ pages: [{ text: "السبورة: أركان المسؤولية" }, { text: "الضرر" }] }) } });
    const imp = await call("POST", `${url}/sources`, { token: a.token, body: { derivativeId: d.id } });
    expect(imp.body.source).toMatchObject({ kind: "board_ocr", content: "السبورة: أركان المسؤولية\nالضرر", label: "صورة السبورة" });
    expect((await call("POST", `${url}/sources`, { token: b.token, body: { derivativeId: d.id } })).status).toBe(404);

    const forB = (await call("GET", `${url}/sources`, { token: b.token })).body.sources;
    expect(forB).toHaveLength(2);
    expect(forB.every((s) => !s.mine && s.content === undefined && s.author === "أمين" && s.chars > 0)).toBe(true);
    expect(JSON.stringify(forB)).not.toContain("إخلال");
    expect((await call("DELETE", `/law/squads/sources/${sa.body.source.id}`, { token: b.token })).status).toBe(404);
    for (let i = 0; i < 3; i++) await call("POST", `${url}/sources`, { token: a.token, body: { kind: "text", label: `x${i}`, content: "y" } });
    expect((await call("POST", `${url}/sources`, { token: a.token, body: { kind: "text", label: "6th", content: "y" } })).body.error).toBe("too_many_sources");
    expect((await call("POST", `${url}/sources`, { token: b.token, body: { kind: "video", label: "x", content: "y" } })).body.error).toBe("invalid kind");
    // Outsiders see nothing.
    const out = await signUp("غريب");
    await call("POST", "/law/squads/create", { token: out.token, body: { name: "أخرى" } });
    expect((await call("GET", `/law/squads/workspaces/${ws.id}/sessions/3/sources`, { token: out.token })).status).toBe(404);
  });

  test("synthesis: needs two sources; structured draft with source pins; unknown articles stripped; nothing saved", async () => {
    const { a, b, url } = await setup();
    await call("POST", `${url}/sources`, { token: a.token, body: { kind: "transcript", label: "تفريغ أمين", content: "الأستاذ: الخطأ هو الإخلال بالتزام. الفصل 77." } });
    expect((await call("POST", `${url}/synthesize`, { token: a.token })).body.error).toBe("need_two_sources");
    await call("POST", `${url}/sources`, { token: b.token, body: { kind: "board_ocr", label: "سبورة بشرى", content: "أركان: خطأ، ضرر، علاقة سببية" } });

    aiReply = {
      title: "أركان المسؤولية التقصيرية",
      sections: [
        { heading: "## المبحث الأول: الخطأ", level: 2, body: "يتمثل الخطأ في الإخلال بالتزام سابق [DOC:77] [DOC:999].", sourceIds: ["S1"], articleRefs: ["doc:77", "DOC:999"] },
        { heading: "المطلب الأول: العنصر المادي", level: 3, body: "فعل أو امتناع.", sourceIds: ["S1", "S2", "S9"], articleRefs: [] },
        { heading: "المبحث الثاني: الضرر والعلاقة السببية", level: 7, body: "كما ورد في السبورة.", sourceIds: ["S2"] },
      ],
      gaps: ["لم يُذكر الضرر المعنوي بوضوح"],
    };
    const r = await call("POST", `${url}/synthesize`, { token: b.token });
    expect(r.status).toBe(200);
    const d = r.body.draft;
    expect(d.title).toBe("أركان المسؤولية التقصيرية");
    expect(d.content.split("\n").filter((l) => l.startsWith("#"))).toEqual([
      "## المبحث الأول: الخطأ",
      "### المطلب الأول: العنصر المادي",
      "#### المبحث الثاني: الضرر والعلاقة السببية",
    ]);
    // A section's sources are pinned first, then its articles; numbering follows first appearance.
    expect(d.sourcePins).toEqual([
      { id: "pin-1", type: "document", ref: "تفريغ صوتي · تفريغ أمين", label: null },
      { id: "pin-2", type: "ref", ref: "DOC:77", label: null },
      { id: "pin-3", type: "document", ref: "صورة السبورة · سبورة بشرى", label: null },
    ]);
    expect(d.content).toContain("[^pin-2]");
    expect(d.content).not.toContain("999");
    expect(d.strippedRefs).toEqual(["DOC:999"]);
    expect(d.gaps).toEqual(["لم يُذكر الضرر المعنوي بوضوح"]);
    expect(d).toMatchObject({ sessionNumber: 3, sourceCount: 2, sourcesUsed: 2 });
    // The model saw both members' sources, labelled S1/S2, through the router (DeepSeek first).
    const call0 = aiCalls[0];
    expect(call0.provider).toBe("deepseek");
    expect(call0.purpose).toBe("master_note_synthesis");
    const sent = call0.parts.map((p) => p.text).join("\n");
    expect(sent).toContain("<<<S1 | تفريغ صوتي | تفريغ أمين>>>");
    expect(sent).toContain("أركان: خطأ، ضرر، علاقة سببية");
    expect(await tmp.client.lawMasterNote.count()).toBe(0);
    // The draft saves as an ordinary master note.
    const saved = await call("POST", url.replace(/\/sessions\/3$/, "/notes"), {
      token: b.token,
      body: { sessionNumber: 3, title: d.title, content: d.content, sourcePins: d.sourcePins },
    });
    expect(saved.status).toBe(201);
    expect(saved.body.note.sourcePins.find((p) => p.ref === "DOC:77").resolved).toBe(true);
  });
});
