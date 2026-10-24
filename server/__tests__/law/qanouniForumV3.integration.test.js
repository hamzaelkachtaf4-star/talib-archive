// Talib v3 forum: subject visibility and colour, document-type tabs, pending edit-request counter, public projects strip,
// shared exams. Through the real /api/law routes in multi-user mode.
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
const { LawSquad } = require("../../models/lawSquad");
const { closeFts } = require("../../utils/law/fts");

jest.setTimeout(90000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };
let tmp;
let server;
let base;

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

let counter = 0;
/** A student account, signed in, with the legal notice accepted unless told otherwise. */
async function student(name, { consent = true } = {}) {
  const email = `s${++counter}@example.ma`;
  const r = await LawAccount.register({ fullName: name, email, password: PASSWORD });
  expect(r.error).toBeNull();
  const login = await call("POST", "/law/auth/login", { body: { email, password: PASSWORD } });
  const s = { token: login.body.token, id: login.body.user.id, name };
  if (consent) expect((await call("POST", "/law/auth/consent", { token: s.token, body: CONSENT })).status).toBe(200);
  return s;
}

beforeEach(async () => {
  process.env = { ...ENV, JWT_SECRET: "test-secret-for-qanouni" };
  delete process.env.AUTH_TOKEN;
  tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;
  resetRateLimits();
  // Synthetic corpus fixture (not real statute text) for article pins.
  const { import: imp } = await LawCorpus.createImport({
    codeSlug: "DOC",
    validFrom: "1913-08-12",
    text: "الفصل 77\nنص تجريبي عن المسؤولية عن الفعل الشخصي.\nالفصل 78\nنص تجريبي عن الخطأ.",
  });
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
  await new Promise((r) => server.close(r));
  closeFts();
  await tmp.cleanup();
  globalThis.__lawTestPrisma = null;
  process.env = ENV;
});


const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function scoped(name, scope = SCOPE, opts = {}) {
  const s = await student(name, opts);
  await tmp.client.lawUserProfile.update({ where: { userId: s.id }, data: scope });
  return s;
}
const modulesOf = async (s) => (await call("GET", "/law/modules?semester=S3", { token: s.token })).body.modules;

describe("subject visibility and colour", () => {
  test("isPublic and colour persist, are validated, and show in the module list", async () => {
    const a = await scoped("سلمى");
    const m = (await modulesOf(a))[0];
    expect(m).toMatchObject({ isPublic: false, color: null });
    const put = await call("PUT", `/law/modules/${m.id}/profile`, { token: a.token, body: { isPublic: true, color: "violet" } });
    expect(put.body.profile).toMatchObject({ isPublic: true, color: "violet" });
    expect((await modulesOf(a)).find((x) => x.id === m.id)).toMatchObject({ isPublic: true, color: "violet" });
    for (const body of [{ isPublic: "yes" }, { color: "#ff0000" }, { color: 3 }, { isPublic: null }]) {
      expect((await call("PUT", `/law/modules/${m.id}/profile`, { token: a.token, body })).status).toBe(400);
    }
    expect((await call("PUT", `/law/modules/${m.id}/profile`, { token: a.token, body: { color: null } })).body.profile.color).toBeNull();
  });
});

describe("public projects strip", () => {
  test("lists other students' public subjects of the same faculty and semester, never private or foreign ones", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    const far = await scoped("بعيد", { ...SCOPE, facultyCode: "FSJES-CASA" });
    const [ma, mb, mf] = [await modulesOf(a), await modulesOf(b), await modulesOf(far)];
    await call("PUT", `/law/modules/${ma[0].id}/profile`, { token: a.token, body: { isPublic: true, color: "orange", formats: ["tree", "qa"] } });
    await call("PUT", `/law/modules/${ma[1].id}/profile`, { token: a.token, body: { isPublic: false } });
    await call("PUT", `/law/modules/${mf[0].id}/profile`, { token: far.token, body: { isPublic: true } });
    const seen = (await call("GET", "/law/hub/projects", { token: b.token })).body.projects;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ title: ma[0].title, color: "orange", formats: ["tree", "qa"], author: { userId: a.id, name: "سلمى" }, pendingRequests: 0 });
    expect(JSON.stringify(seen)).not.toContain("email");
    expect((await call("GET", "/law/hub/projects", { token: a.token })).body.projects).toHaveLength(0); // my own are not "colleagues'"
    expect(mb.length).toBeGreaterThan(0);
  });
});

describe("consent and abuse limits", () => {
  test("a subject cannot be made public before the notice is accepted, and a stale public one is never listed", async () => {
    const a = await scoped("سلمى", SCOPE, { consent: false });
    const b = await scoped("يوسف");
    const m = (await modulesOf(a))[0];
    const r = await call("PUT", `/law/modules/${m.id}/profile`, { token: a.token, body: { isPublic: true } });
    expect([r.status, r.body.error?.code || r.body.error]).toEqual([403, "consent_required"]);
    expect((await call("PUT", `/law/modules/${m.id}/profile`, { token: a.token, body: { isPublic: false, color: "rose" } })).status).toBe(200); // private changes need no consent
    await tmp.client.lawModuleProfile.update({ where: { userId_moduleId: { userId: a.id, moduleId: m.id } }, data: { isPublic: true } }); // simulate a row made public earlier
    expect((await call("GET", "/law/hub/projects", { token: b.token })).body.projects).toHaveLength(0);
  });

  test("trying a shared exam respects the open-drill limit, and nobody votes for or counts tries on their own exam", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    const items = [{ question: "س", options: ["أ", "ب", "ج", "د"], correctIndex: 0, explanation: "ش" }];
    const mk = async (s) => (await tmp.client.lawDrillAttempt.create({ data: { userId: s.id, moduleId: (await modulesOf(s))[0].id, type: "qcm", promptJson: JSON.stringify({ items }) } }));
    const e = (await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: (await mk(a)).id } })).body.exam;
    expect((await call("POST", `/law/exam/shared/${e.id}/helpful`, { token: a.token })).status).toBe(400);
    await call("POST", `/law/exam/shared/${e.id}/try`, { token: a.token, body: { moduleId: (await modulesOf(a))[0].id } });
    expect((await call("GET", "/law/exam/shared", { token: a.token })).body.exams[0].tries).toBe(0);
    const mid = (await modulesOf(b))[0].id;
    for (let i = 0; i < 20; i++) await tmp.client.lawDrillAttempt.create({ data: { userId: b.id, moduleId: mid, type: "qcm", promptJson: JSON.stringify({ items }) } });
    const r = await call("POST", `/law/exam/shared/${e.id}/try`, { token: b.token, body: { moduleId: mid } });
    expect([r.status, r.body.error?.code]).toEqual([409, "too_many_open"]);
  });
});

describe("document types and pending edit requests on public notes", () => {
  async function publicNote(owner, docType, title, moduleName = "المسؤولية المدنية") {
    let sq = (await call("GET", "/law/squads/my", { token: owner.token })).body.squad;
    if (!sq) sq = (await call("POST", "/law/squads/create", { token: owner.token, body: { name: "فرقة", cohortTag: "S3-G1" } })).body.squad;
    let ws = (await call("GET", "/law/squads/workspaces", { token: owner.token })).body.workspaces.find((w) => w.moduleName === moduleName);
    if (!ws) ws = (await call("POST", "/law/squads/workspaces", { token: owner.token, body: { moduleName, professorName: "ذ. بناني" } })).body.workspace;
    const r = await call("POST", `/law/squads/workspaces/${ws.id}/notes`, { token: owner.token, body: { title, sessionNumber: Math.floor(Math.random() * 150) + 1, content: "## المبحث الأول\nنص", visibility: "public", ...(docType ? { docType } : {}) } });
    return r;
  }

  test("a note carries a validated docType, the hub filters by it, and untyped notes only show under all", async () => {
    const a = await scoped("سلمى");
    expect((await publicNote(a, "bogus", "x")).status).toBe(400);
    const full = await publicNote(a, "full_course", "مادة كاملة");
    expect(full.status).toBe(201);
    expect(full.body.note.docType).toBe("full_course");
    await publicNote(a, "case", "نازلة");
    await publicNote(a, null, "بدون نوع");
    const all = (await call("GET", "/law/hub/notes?cohort=S3-G1", { token: a.token })).body.notes;
    expect(all.map((n) => n.title).sort()).toEqual(["بدون نوع", "مادة كاملة", "نازلة"].sort());
    expect(all.find((n) => n.title === "نازلة").docType).toBe("case");
    const cases = (await call("GET", "/law/hub/notes?cohort=S3-G1&type=case", { token: a.token })).body.notes;
    expect(cases.map((n) => n.title)).toEqual(["نازلة"]);
    expect((await call("GET", "/law/hub/notes?cohort=S3-G1&type=bogus", { token: a.token })).body.notes).toHaveLength(3); // unknown filter = no filter
  });

  test("docType can be changed by an update", async () => {
    const a = await scoped("سلمى");
    const n = (await publicNote(a, "summary", "ملخص")).body.note;
    const up = await call("PATCH", `/law/squads/notes/${n.id}`, { token: a.token, body: { docType: "reference", version: n.version } });
    expect(up.status).toBe(200);
    expect(up.body.note.docType).toBe("reference");
  });

  test("the card counts only OPEN change requests", async () => {
    const a = await scoped("سلمى");
    const n = (await publicNote(a, "summary", "ملخص")).body.note;
    const mk = (status) => tmp.client.lawChangeRequest.create({ data: { noteId: n.id, baseRevisionId: "r0", proposedRevisionId: "r1", authorId: a.id, title: "t", status } });
    await mk("OPEN"); await mk("OPEN"); await mk("MERGED"); await mk("REJECTED"); await mk("WITHDRAWN");
    const got = (await call("GET", "/law/hub/notes?cohort=S3-G1", { token: a.token })).body.notes[0];
    expect(got.pendingRequests).toBe(2);
  });
});

describe("shared exams", () => {
  const items = [0, 1, 2].map((i) => ({ question: `سؤال ${i}`, options: ["أ", "ب", "ج", "د"], correctIndex: i, explanation: "شرح", cite: { label: "S1", ref: "DOC:77", title: "ف. 77" } }));
  async function drill(s, extra = {}) {
    const m = (await modulesOf(s))[0];
    const row = await tmp.client.lawDrillAttempt.create({ data: { userId: s.id, moduleId: m.id, type: "qcm", promptJson: JSON.stringify({ items, context: [{ label: "S1", text: "نص خاص بمحاضرة الطالبة" }], locale: "ar", meta: {} }), ...extra } });
    return { id: row.id, module: m };
  }

  test("publishing shares the questions only (never the source notes) and rejects other types and other people's drills", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    const d = await drill(a);
    const r = await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: d.id } });
    expect(r.status).toBe(201);
    expect(r.body.exam).toMatchObject({ moduleTitle: d.module.title, semester: "S3", type: "qcm", questionCount: 3, tries: 0, helpful: 0, mine: true });
    const stored = await tmp.client.lawSharedExam.findFirst();
    expect(stored.promptJson).not.toContain("نص خاص بمحاضرة");
    expect(stored.promptJson).not.toContain("DOC:77"); // the author's source labels never travel
    expect(stored.promptJson).not.toContain("ف. 77");
    expect((await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: d.id } })).body.exam.id).toBe(r.body.exam.id); // idempotent per drill
    expect(await tmp.client.lawSharedExam.count()).toBe(1);
    expect((await call("POST", "/law/exam/shared", { token: b.token, body: { drillId: d.id } })).status).toBe(404);
    const caseDrill = await tmp.client.lawDrillAttempt.create({ data: { userId: a.id, moduleId: d.module.id, type: "case", promptJson: "{}" } });
    expect((await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: caseDrill.id } })).status).toBe(422);
    expect((await call("POST", "/law/exam/shared", { token: a.token, body: {} })).status).toBe(400);
  });

  test("the list is per faculty, pins the most tried, and exposes no answers", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    const far = await scoped("بعيد", { ...SCOPE, facultyCode: "FSJES-CASA" });
    const e1 = (await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: (await drill(a)).id } })).body.exam;
    const e2 = (await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: (await drill(a)).id } })).body.exam;
    await call("POST", `/law/exam/shared/${e2.id}/try`, { token: b.token, body: { moduleId: (await modulesOf(b))[0].id } });
    const seen = (await call("GET", "/law/exam/shared", { token: b.token })).body;
    expect(seen.exams.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
    expect(seen.pinnedId).toBe(e2.id);
    expect(JSON.stringify(seen)).not.toContain("correctIndex");
    expect((await call("GET", "/law/exam/shared", { token: far.token })).body.exams).toHaveLength(0);
    expect((await call("POST", `/law/exam/shared/${e1.id}/try`, { token: far.token, body: { moduleId: (await modulesOf(far))[0].id } })).status).toBe(404);
  });

  test("trying clones the questions into my own module as a fresh QCM and counts once per student; helpful too", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    const e = (await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: (await drill(a)).id } })).body.exam;
    const mid = (await modulesOf(b))[0].id;
    const t1 = await call("POST", `/law/exam/shared/${e.id}/try`, { token: b.token, body: { moduleId: mid } });
    expect(t1.status).toBe(201);
    expect(t1.body.drill).toMatchObject({ type: "qcm", moduleId: mid, status: "open" });
    expect(t1.body.drill.prompt.items).toHaveLength(3);
    expect(JSON.stringify(t1.body.drill.prompt)).not.toContain("correctIndex");
    await call("POST", `/law/exam/shared/${e.id}/try`, { token: b.token, body: { moduleId: mid } });
    expect((await call("GET", "/law/exam/shared", { token: b.token })).body.exams[0]).toMatchObject({ tries: 1, iTried: true });
    expect((await call("POST", `/law/exam/shared/${e.id}/try`, { token: b.token, body: { moduleId: "nope" } })).status).toBe(404);
    const h1 = await call("POST", `/law/exam/shared/${e.id}/helpful`, { token: b.token });
    await call("POST", `/law/exam/shared/${e.id}/helpful`, { token: b.token });
    expect(h1.body.exam).toMatchObject({ helpful: 1, iHelpful: true });
    expect((await call("GET", "/law/exam/shared", { token: a.token })).body.exams[0]).toMatchObject({ tries: 1, helpful: 1, mine: true });
  });

  test("an open final exam cannot be shared until it is submitted", async () => {
    const a = await scoped("سلمى");
    const m = (await modulesOf(a))[0];
    const row = await tmp.client.lawDrillAttempt.create({ data: { userId: a.id, moduleId: m.id, type: "qcm", promptJson: JSON.stringify({ items, mode: "final" }) } });
    const r = await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: row.id } });
    expect([r.status, r.body.error?.code || r.body.error]).toEqual([409, "finish_first"]);
    await tmp.client.lawDrillAttempt.update({ where: { id: row.id }, data: { status: "submitted" } });
    expect((await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: row.id } })).status).toBe(201);
  });

  test("only the author can remove a shared exam", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    const e = (await call("POST", "/law/exam/shared", { token: a.token, body: { drillId: (await drill(a)).id } })).body.exam;
    expect((await call("DELETE", `/law/exam/shared/${e.id}`, { token: b.token })).status).toBe(404);
    expect((await call("DELETE", `/law/exam/shared/${e.id}`, { token: a.token })).status).toBe(200);
    expect((await call("GET", "/law/exam/shared", { token: b.token })).body.exams).toHaveLength(0);
  });
});

describe("notification settings are effective", () => {
  const note = (userId, type) => tmp.client.lawNotification.create({ data: { userId, type, payload: "{}" } });
  test("a switched-off category disappears from the list and the unread count; safety notices never do", async () => {
    const a = await scoped("سلمى");
    for (const t of ["CAMPUS_REPLY", "SQUAD_DOC_NEW", "HUB_MERGED", "FRIEND_ACCEPTED", "BRAIN_REMINDER", "CAMPUS_POST_HIDDEN", "AI_CORRECTION_VERIFIED"]) await note(a.id, t);
    const types = async () => (await call("GET", "/law/notifications", { token: a.token })).body;
    expect((await types()).items).toHaveLength(7);
    expect((await call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyForum: false } })).body.preferences.notifyForum).toBe(false);
    let n = await types();
    expect(n.items.map((i) => i.type).sort()).toEqual(["AI_CORRECTION_VERIFIED", "BRAIN_REMINDER", "CAMPUS_POST_HIDDEN", "FRIEND_ACCEPTED", "HUB_MERGED"]);
    expect(n.unread).toBe(5);
    await call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyFriends: false, notifyHub: false, notifyReminders: false } });
    n = await types();
    expect(n.items.map((i) => i.type).sort()).toEqual(["AI_CORRECTION_VERIFIED", "CAMPUS_POST_HIDDEN"]);
    await call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyForum: true, notifyFriends: true, notifyHub: true, notifyReminders: true } });
    expect((await types()).items).toHaveLength(7);
    expect((await call("PATCH", "/law/me/preferences", { token: a.token, body: { notifyForum: "no" } })).status).toBe(400);
  });
  test("someone else's switches do not hide my notifications", async () => {
    const a = await scoped("سلمى");
    const b = await scoped("يوسف");
    await note(a.id, "CAMPUS_REPLY");
    await call("PATCH", "/law/me/preferences", { token: b.token, body: { notifyForum: false } });
    expect((await call("GET", "/law/notifications", { token: a.token })).body.items).toHaveLength(1);
  });
});
