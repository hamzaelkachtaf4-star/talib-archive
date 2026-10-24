// Phase 9: course path (modules from the published timetable, semester isolation, unlock logic, crowns, export).
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
const { closeFts } = require("../../utils/law/fts");

jest.setTimeout(120000);
const ENV = process.env;
const PASSWORD = "Motdepasse-solide-1";
const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };
let tmp;
let server;
let base;
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

async function student(name) {
  const email = `h${++counter}@example.ma`;
  await LawAccount.register({ fullName: name, email, password: PASSWORD });
  const login = await call("POST", "/law/auth/login", { body: { email, password: PASSWORD } });
  const s = { token: login.body.token, id: login.body.user.id, name };
  await call("POST", "/law/auth/consent", { token: s.token, body: CONSENT });
  return s;
}

/** A squad (owner + members) with one workspace. */
async function squad(owner, members, { name = "ف", cohortTag, moduleName = "المسؤولية المدنية", professorName = "د. س" } = {}) {
  const c = await call("POST", "/law/squads/create", { token: owner.token, body: { name, ...(cohortTag ? { cohortTag } : {}) } });
  for (const m of members) await call("POST", "/law/squads/join", { token: m.token, body: { code: c.body.squad.inviteCode } });
  const ws = (await call("POST", "/law/squads/workspaces", { token: owner.token, body: { moduleName, professorName } })).body.workspace;
  return ws;
}

const newNote = (s, ws, body) =>
  call("POST", `/law/squads/workspaces/${ws.id}/notes`, {
    token: s.token,
    body: { sessionNumber: 1, title: "المحاضرة الأولى", content: "# المبحث الأول: الخطأ\nالإخلال بالتزام سابق.", ...body },
  });

beforeEach(async () => {
  process.env = { ...ENV, JWT_SECRET: "test-secret-for-qanouni" };
  delete process.env.AUTH_TOKEN;
  tmp = await createTempDb();
  globalThis.__lawTestPrisma = tmp.client;
  resetRateLimits();
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



const H = "semester,track,language,groupCode,dayOfWeek,startTime,endTime,subject,kind,room,professor\n";
const S3 = H + [
  "S3,PRIVE,AR,G01,1,11:00,13:15,القانون الجنائي الخاص,COURS,2,X", "S3,PRIVE,AR,G01,1,13:30,15:45,قانون الأسرة,COURS,7,X", "S3,PRIVE,AR,G01,2,13:30,15:45,المسؤولية المدنية,COURS,7,X",
  "S3,PRIVE,AR,G02,1,11:00,13:15,القانون الجنائي الخاص,COURS,2,X", // same subject in another group: one module
].join("\n") + "\n";
const S1 = H + "S1,PRIVE,AR,G01,1,11:00,13:15,المدخل لدراسة القانون,COURS,2,X\n";
const S3PUB = H + "S3,PUBLIC,AR,G01,1,11:00,13:15,القانون الدستوري,COURS,2,X\n";

async function adminUser() {
  const a = await student("المشرف");
  await tmp.client.users.update({ where: { id: a.id }, data: { role: "admin" } });
  return a;
}
async function publishCsv(admin, csv) {
  const imp = await call("POST", "/law/admin/timetable/import-csv", { token: admin.token, body: { season: "AUTOMNE", csv } });
  expect([200, 201]).toContain(imp.status);
  expect((await call("POST", `/law/admin/timetable/staging/${imp.body.source.id}/publish`, { token: admin.token })).status).toBe(200);
}
const setAcademic = (s, data = {}) => tmp.client.lawUserProfile.updateMany({ where: { userId: s.id }, data: { facultyCode: "FSJES_AIN_CHOCK", track: "PRIVE", studyLang: "AR", ...data } });
const get = (s, u) => call("GET", u, { token: s.token });
const complete = (s, nodeId) => call("POST", `/law/path/nodes/${nodeId}/progress`, { token: s.token, body: { state: "COMPLETED" } });

describe("modules", () => {
  test("derived from the published timetable, one semester at a time, scoped to the student's track/language", async () => {
    const admin = await adminUser();
    const a = await student("أمين");
    expect((await get(a, "/law/path/semesters/S3/modules")).body.error.code).toBe("academic_profile_required");
    await setAcademic(a);
    // nothing published yet: an honest empty state, no invented curriculum
    expect((await get(a, "/law/path/semesters/S3/modules")).body.modules).toEqual([]);
    await publishCsv(admin, S3);
    await publishCsv(admin, S1);
    await publishCsv(admin, S3PUB);
    const s3 = (await get(a, "/law/path/semesters/S3/modules")).body;
    expect(s3.modules.map((m) => m.title)).toEqual(["القانون الجنائي الخاص", "قانون الأسرة", "المسؤولية المدنية"]);
    expect(s3.modules.map((m) => m.ordinal)).toEqual([1, 2, 3]);
    expect(s3.modules.every((m) => m.total === 9 && m.completed === 0)).toBe(true);
    // semester isolation: S1 never leaks S3 modules (and vice versa); S2 has nothing
    const s1 = (await get(a, "/law/path/semesters/S1/modules")).body.modules.map((m) => m.title);
    expect(s1).toEqual(["المدخل لدراسة القانون"]);
    expect((await get(a, "/law/path/semesters/S2/modules")).body.modules).toEqual([]);
    expect((await get(a, "/law/path/semesters/S9/modules")).status).toBe(400);
    // idempotent: asking again does not duplicate modules
    await get(a, "/law/path/semesters/S3/modules");
    expect(await tmp.client.lawCourseModule.count({ where: { semester: "S3", track: "PRIVE" } })).toBe(3);
    // a public-law student gets their own modules and cannot open private-law ones
    const b = await student("بشرى");
    await setAcademic(b, { track: "PUBLIC" });
    expect((await get(b, "/law/path/semesters/S3/modules")).body.modules.map((m) => m.title)).toEqual(["القانون الدستوري"]);
    expect((await get(b, `/law/path/modules/${s3.modules[0].id}/graph`)).status).toBe(404);
    expect((await get(a, "/law/path/semesters/S3/modules" )).status).toBe(200);
    expect((await call("GET", "/law/path/semesters/S3/modules")).status).toBe(401);
  });
});

describe("graph, unlock logic, crowns, XP", () => {
  async function setup() {
    const admin = await adminUser();
    const a = await student("أمين");
    await setAcademic(a);
    await publishCsv(admin, S3);
    const mod = (await get(a, "/law/path/semesters/S3/modules")).body.modules[0];
    const g = (await get(a, `/law/path/modules/${mod.id}/graph`)).body;
    return { admin, a, mod, g };
  }

  test("linear unlock; locked nodes refuse; completion is permanent; module done; XP 15 per node", async () => {
    const { a, g } = await setup();
    expect(g.nodes.map((n) => n.state)).toEqual(["AVAILABLE", ...Array(8).fill("LOCKED")]);
    expect(g.nodes.map((n) => n.kind)).toEqual(["LESSON", "PRACTICE", "CHECKPOINT", "LESSON", "METHOD", "PRACTICE", "CHECKPOINT", "LESSON", "BOSS"]);
    expect(g.currentNodeId).toBe(g.nodes[0].id);
    expect((await complete(a, g.nodes[1].id)).status).toBe(409); // locked
    expect((await call("POST", `/law/path/nodes/${g.nodes[0].id}/progress`, { token: a.token, body: { state: "LOCKED" } })).status).toBe(400);
    const first = await complete(a, g.nodes[0].id);
    expect(first.body).toMatchObject({ state: "COMPLETED", unlocked: [g.nodes[1].id], moduleDone: false });
    expect((await complete(a, g.nodes[0].id)).body.unchanged).toBe(true);
    expect((await call("POST", `/law/path/nodes/${g.nodes[0].id}/progress`, { token: a.token, body: { state: "IN_PROGRESS" } })).body.state).toBe("COMPLETED"); // cannot be undone
    expect((await call("POST", `/law/path/nodes/${g.nodes[1].id}/progress`, { token: a.token, body: { state: "IN_PROGRESS" } })).body.state).toBe("IN_PROGRESS");
    expect((await get(a, `/law/path/modules/${g.module.id}/graph`)).body.nodes[1].state).toBe("IN_PROGRESS");
    for (const n of g.nodes.slice(1)) expect((await complete(a, n.id)).status).toBe(200);
    const done = (await get(a, `/law/path/modules/${g.module.id}/graph`)).body;
    expect(done.nodes.every((n) => n.state === "COMPLETED")).toBe(true);
    expect(done.currentNodeId).toBeNull();
    expect((await get(a, "/law/profile")).body.progress.xp).toBe(6 * 15); // 9 nodes done, but XP stops at 6 a day (completion is self-reported)
    expect((await get(a, "/law/path/semesters/S3/modules")).body.modules[0]).toMatchObject({ total: 9, completed: 9 });
    // another student's progress is separate
    const b = await student("بشرى");
    await setAcademic(b);
    expect((await get(b, `/law/path/modules/${g.module.id}/graph`)).body.nodes[0].state).toBe("AVAILABLE");
    expect((await complete(b, g.nodes[0].id)).status).toBe(200);
    expect((await get(a, `/law/path/modules/${g.module.id}/graph`)).body.nodes.every((n) => n.state === "COMPLETED")).toBe(true);
  });

  test("crowns follow FSRS mastery of the student's own subject; the practice node links to it", async () => {
    const { a, g } = await setup();
    expect(g.crowns).toBe(0);
    expect(g.nodes[1].practice).toBeNull();
    const subj = await tmp.client.lawSubject.create({ data: { name: "القانون الجنائي الخاص", userId: a.id } });
    const mk = (n, over) => Array.from({ length: n }, (_, i) => tmp.client.lawFlashcard.create({ data: { subjectId: subj.id, origin: "manual", front: `q${i}${over.state}${over.stability}`, back: "a", userId: a.id, ...over } }));
    await Promise.all([...mk(2, { state: "review", stability: 30 }), ...mk(8, { state: "learning", stability: 1 })]);
    let r = (await get(a, `/law/path/modules/${g.module.id}/graph`)).body;
    expect(r).toMatchObject({ crowns: 0, cardCount: 10 }); // 20% mastered
    expect(r.nodes[1].practice).toEqual({ subjectId: subj.id });
    await tmp.client.lawFlashcard.updateMany({ where: { userId: a.id, state: "learning" }, data: { state: "review", stability: 40 } });
    r = (await get(a, `/law/path/modules/${g.module.id}/graph`)).body;
    expect(r.crowns).toBe(3);
  });

  test("pin community notes to a node (public + active only, max 5, per student)", async () => {
    const { a, g } = await setup();
    const owner = await student("صاحب");
    const ws = await squad(owner, []);
    const pub = (await newNote(owner, ws, { content: "# المبحث\nنص", visibility: "public" })).body.note;
    const ws2 = await squad(owner, [], { name: "ب", moduleName: "م2" });
    const priv = (await newNote(owner, ws2, { content: "# المبحث\nنص" })).body.note;
    const node = g.nodes[0].id;
    const pin = (token, noteId) => call("POST", `/law/path/nodes/${node}/attach-hub-doc`, { token, body: { noteId } });
    expect((await pin(a.token, priv.id)).status).toBe(404);
    expect((await pin(a.token, pub.id)).status).toBe(201);
    expect((await pin(a.token, pub.id)).status).toBe(201); // idempotent
    expect((await get(a, `/law/path/modules/${g.module.id}/graph`)).body.nodes[0].pins).toEqual([{ noteId: pub.id, title: pub.title }]);
    const other = await student("آخر"); // different scope: invisible
    await setAcademic(other);
    expect((await get(other, `/law/path/modules/${g.module.id}/graph`)).body.nodes[0].pins).toEqual([]);
    expect((await call("DELETE", `/law/path/nodes/${node}/attach-hub-doc/${pub.id}`, { token: a.token })).status).toBe(200);
    expect((await get(a, `/law/path/modules/${g.module.id}/graph`)).body.nodes[0].pins).toEqual([]);
    // a hidden note drops out of the path
    await pin(a.token, pub.id);
    await tmp.client.lawMasterNote.update({ where: { id: pub.id }, data: { moderationStatus: "HIDDEN" } });
    expect((await get(a, `/law/path/modules/${g.module.id}/graph`)).body.nodes[0].pins).toEqual([]);
  });
});

describe("export and admin editing", () => {
  test("DOCX: Arabic RTL (w:bidi), embedded font, cover + contents + chapters + cited articles appendix; PDF defers to print; scope-checked", async () => {
    const { a, g, admin } = await (async () => {
      const admin = await adminUser();
      const a = await student("أمين الطالب");
      await setAcademic(a);
      await publishCsv(admin, S3);
      const mod = (await get(a, "/law/path/semesters/S3/modules")).body.modules[0];
      return { admin, a, g: (await get(a, `/law/path/modules/${mod.id}/graph`)).body };
    })();
    // cite an article from the corpus on the first node (admin edit)
    const { asSystem } = require("../../utils/law/tenant");
    const { LawCorpus } = require("../../models/lawCorpus");
    await asSystem(async () => {
      const { import: imp } = await LawCorpus.createImport({ codeSlug: "CP", validFrom: "1962-11-26", text: "الفصل 3\nنص تجريبي للاستشهاد في الملحق." });
      await LawCorpus.commitImport(imp.id);
    });
    const nodes = g.nodes.map((n, i) => ({ kind: n.kind, title: n.title, section: n.section, ...(i === 0 ? { legalRefs: [{ slug: "CP", number: "3" }, { slug: "CP", number: "999" }] } : {}) }));
    expect((await call("PUT", `/law/admin/path/modules/${g.module.id}/nodes`, { token: a.token, body: { nodes } })).status).toBe(403);
    expect((await call("PUT", `/law/admin/path/modules/${g.module.id}/nodes`, { token: admin.token, body: { nodes } })).status).toBe(200);
    const g2 = (await get(a, `/law/path/modules/${g.module.id}/graph`)).body;
    expect(g2.nodes[0].legalRefs).toEqual([{ slug: "CP", number: "3", canonicalId: "CP:3", exists: true }, { slug: "CP", number: "999", canonicalId: "CP:999", exists: false }]);

    const res = await fetch(`${base}/api/law/path/modules/${g.module.id}/export?format=docx`, { headers: { Authorization: `Bearer ${a.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="module-S3-/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buf);
    const names = zip.getEntries().map((e) => e.entryName);
    const xml = zip.readAsText("word/document.xml");
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("<w:rtl/>");
    expect(xml).toContain("القانون الجنائي الخاص");
    expect(xml).toContain("أمين الطالب");
    expect(xml).toContain("نص تجريبي للاستشهاد في الملحق."); // appendix text comes from the corpus
    expect(xml.split("CP:999").length - 1).toBe(1); // unresolved refs are marked "؟" in the node list and never get an appendix entry
    expect(xml).toContain("؟ CP:999");
    expect(names.some((n) => /^word\/fonts\/.+\.odttf$/.test(n))).toBe(true); // Amiri embedded
    expect(zip.readAsText("word/fontTable.xml")).toContain("Amiri");

    const pdf = await call("GET", `/law/path/modules/${g.module.id}/export?format=pdf`, { token: a.token });
    expect(pdf.status).toBe(501);
    expect(pdf.body.error.details.printUrl).toBe(`/law/path/modules/${g.module.id}/print`);
    expect((await call("GET", `/law/path/modules/${g.module.id}/export?format=odt`, { token: a.token })).status).toBe(400);
    const b = await student("بشرى");
    await setAcademic(b, { track: "PUBLIC" });
    expect((await call("GET", `/law/path/modules/${g.module.id}/export`, { token: b.token })).status).toBe(404);
  });

  test("admin node editing validates kinds, forward references and shape; rename", async () => {
    const admin = await adminUser();
    const a = await student("أمين");
    await setAcademic(a);
    await publishCsv(admin, S3);
    const mod = (await get(a, "/law/path/semesters/S3/modules")).body.modules[0];
    const put = (nodes) => call("PUT", `/law/admin/path/modules/${mod.id}/nodes`, { token: admin.token, body: { nodes } });
    for (const bad of [[], "x", [{ kind: "NOPE", title: "t", section: "s" }], [{ kind: "LESSON", title: "", section: "s" }], [{ kind: "LESSON", title: "t", section: "s", prereq: [0] }], [{ kind: "LESSON", title: "t", section: "s" }, { kind: "LESSON", title: "u", section: "s", prereq: [1] }], [{ kind: "LESSON", title: "t", section: "s", legalRefs: [{ slug: 1 }] }]])
      expect((await put(bad)).status).toBe(400);
    expect((await put([{ kind: "LESSON", title: "أ", section: "ق" }, { kind: "BOSS", title: "ب", section: "ق" }])).status).toBe(200);
    const g = (await get(a, `/law/path/modules/${mod.id}/graph`)).body;
    expect(g.nodes.map((n) => n.state)).toEqual(["AVAILABLE", "LOCKED"]);
    expect((await call("PUT", `/law/admin/path/modules/${mod.id}`, { token: admin.token, body: { title: "عنوان جديد" } })).status).toBe(200);
    expect((await get(a, `/law/path/modules/${mod.id}/graph`)).body.module.title).toBe("عنوان جديد");
    expect((await call("PUT", `/law/admin/path/modules/${mod.id}`, { token: admin.token, body: { title: " " } })).status).toBe(400);
  });
});
