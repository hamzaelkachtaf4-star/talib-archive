// Phase 8: Hub change requests (fast-forward, 3-way merge, conflict + rebase), co-authors, XP, reports and moderation.
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


const P = (...b) => b.join("\n\n");
const BASE = P("# المبحث الأول: الخطأ", "الفقرة الأولى عن الخطأ.", "الفقرة الثانية عن الضرر.", "الفقرة الثالثة عن العلاقة السببية.", "الفقرة الرابعة خاتمة.");
const get = (t, u) => call("GET", u, { token: t.token });

async function publicNote(owner, members = []) {
  const ws = await squad(owner, members);
  const r = await newNote(owner, ws, { content: BASE, visibility: "public" });
  expect(r.status).toBe(201);
  return r.body.note;
}
const propose = (s, id, content, title = "تحسين") => call("POST", `/law/hub/notes/${id}/change-requests`, { token: s.token, body: { title, content } });
const noteRow = (id) => tmp.client.lawMasterNote.findUnique({ where: { id } });

describe("change requests", () => {
  test("fast-forward merge: only the owner merges; proposer becomes co-author, both are notified, XP is earned", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const note = await publicNote(a);
    const next = BASE.replace("الفقرة الثانية عن الضرر.", "الفقرة الثانية عن الضرر وأنواعه.");
    expect((await propose(a, note.id, next)).status).toBe(400); // own note
    expect((await propose(b, note.id, BASE)).body.error.code).toBe("no_changes");
    expect((await propose(b, note.id, "")).status).toBe(400);
    const cr = await propose(b, note.id, next, "إضافة أنواع الضرر");
    expect(cr.status).toBe(201);
    const id = cr.body.changeRequest.id;
    expect((await get(a, "/law/hub/change-requests")).body.changeRequests.map((c) => c.id)).toEqual([id]);
    expect((await get(b, "/law/hub/change-requests?role=author")).body.changeRequests.map((c) => c.id)).toEqual([id]);
    expect((await get(a, "/law/notifications")).body.items[0]).toMatchObject({ type: "HUB_CHANGE_REQUEST" });

    const view = (await get(a, `/law/hub/change-requests/${id}`)).body;
    expect(view.diff.filter((d) => d.type !== "same").map((d) => d.type)).toEqual(["del", "add"]);
    expect(view.headChanged).toBe(false);
    // not the proposer, not the owner => invisible; the proposer cannot merge their own request
    const c = await student("جمال");
    expect((await get(c, `/law/hub/change-requests/${id}`)).status).toBe(404);
    expect((await call("POST", `/law/hub/change-requests/${id}/merge`, { token: b.token })).status).toBe(404);

    const merged = await call("POST", `/law/hub/change-requests/${id}/merge`, { token: a.token });
    expect(merged.body).toMatchObject({ merged: true, fastForward: true });
    expect((await noteRow(note.id)).content).toBe(next);
    expect((await call("POST", `/law/hub/change-requests/${id}/merge`, { token: a.token })).status).toBe(409); // already merged
    const pub = (await get(c, `/law/hub/notes/${note.id}`)).body.note;
    expect(pub.coAuthors.map((x) => x.userId)).toEqual([b.id]);
    expect((await get(b, "/law/notifications")).body.items[0]).toMatchObject({ type: "HUB_MERGED" });
    expect((await get(a, "/law/notifications")).body.items.map((i) => i.type)).toContain("HUB_MERGED");
    // the changed section is attributed to the proposer (Law Blame), and XP counts the merged request
    expect((await get(b, "/law/profile")).body.progress.xp).toBe(40);
    const revs = (await get(c, `/law/hub/notes/${note.id}/revisions`)).body.revisions;
    expect(revs.length).toBeGreaterThanOrEqual(2);
  });

  test("clean three-way merge when the head moved; conflicting edits are refused, rebased and then merged", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const c = await student("جمال");
    const d = await student("دعاء");
    const note = await publicNote(a);
    const bEdit = BASE.replace("الفقرة الأولى عن الخطأ.", "الفقرة الأولى عن الخطأ بتفصيل.");
    const cEdit = BASE.replace("الفقرة الرابعة خاتمة.", "الفقرة الرابعة خاتمة موسعة.");
    const dEdit = BASE.replace("الفقرة الأولى عن الخطأ.", "الفقرة الأولى بصيغة د.");
    const crB = (await propose(b, note.id, bEdit)).body.changeRequest.id;
    const crC = (await propose(c, note.id, cEdit)).body.changeRequest.id;
    const crD = (await propose(d, note.id, dEdit)).body.changeRequest.id;
    expect((await call("POST", `/law/hub/change-requests/${crB}/merge`, { token: a.token })).body.fastForward).toBe(true);
    // C's base is stale but its edit is elsewhere: clean 3-way merge keeps both edits
    const view = (await get(c, `/law/hub/change-requests/${crC}`)).body;
    expect(view).toMatchObject({ headChanged: true, mergeable: true });
    expect((await call("POST", `/law/hub/change-requests/${crC}/merge`, { token: a.token })).body).toMatchObject({ merged: true, fastForward: false });
    const content = (await noteRow(note.id)).content;
    expect(content).toContain("بتفصيل");
    expect(content).toContain("خاتمة موسعة");
    expect((await tmp.client.lawNoteCoAuthor.findMany()).map((x) => x.userId).sort()).toEqual([b.id, c.id].sort());
    // D edited the same paragraph as B: conflict
    const conflict = await call("POST", `/law/hub/change-requests/${crD}/merge`, { token: a.token });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("conflict");
    expect(conflict.body.error.details.conflicts[0]).toMatchObject({ ours: ["الفقرة الأولى عن الخطأ بتفصيل."], theirs: ["الفقرة الأولى بصيغة د."] });
    expect((await tmp.client.lawChangeRequest.findUnique({ where: { id: crD } })).status).toBe("CONFLICT");
    expect((await noteRow(note.id)).content).toBe(content); // nothing applied
    expect((await call("POST", `/law/hub/change-requests/${crD}/merge`, { token: a.token })).status).toBe(409); // must rebase first
    // only the proposer can rebase, onto the current head
    expect((await call("POST", `/law/hub/change-requests/${crD}/rebase`, { token: a.token, body: { content: content + "\n\nإضافة" } })).status).toBe(404);
    const resolved = content.replace("الفقرة الأولى عن الخطأ بتفصيل.", "الفقرة الأولى بتفصيل وصيغة د.");
    expect((await call("POST", `/law/hub/change-requests/${crD}/rebase`, { token: d.token, body: { content: resolved } })).body.changeRequest.status).toBe("OPEN");
    expect((await call("POST", `/law/hub/change-requests/${crD}/merge`, { token: a.token })).body).toMatchObject({ merged: true, fastForward: true });
    expect((await noteRow(note.id)).content).toBe(resolved);
    expect((await noteRow(note.id)).version).toBeGreaterThanOrEqual(4);
  });

  test("reject / withdraw, limits and content rules", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const note = await publicNote(a);
    const e = (n) => BASE.replace("الفقرة الثانية عن الضرر.", `الفقرة الثانية رقم ${n}.`);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await propose(b, note.id, e(i))).body.changeRequest.id);
    expect((await propose(b, note.id, e(99))).body.error.code).toBe("too_many_open");
    expect((await call("POST", `/law/hub/change-requests/${ids[0]}/withdraw`, { token: a.token })).status).toBe(404); // only the author
    expect((await call("POST", `/law/hub/change-requests/${ids[0]}/withdraw`, { token: b.token })).status).toBe(200);
    expect((await call("POST", `/law/hub/change-requests/${ids[1]}/reject`, { token: b.token })).status).toBe(404); // only the owner
    expect((await call("POST", `/law/hub/change-requests/${ids[1]}/reject`, { token: a.token, body: { reviewNote: "غير دقيق" } })).status).toBe(200);
    expect((await get(b, "/law/notifications")).body.items[0]).toMatchObject({ type: "HUB_CHANGE_REJECTED" });
    expect((await call("POST", `/law/hub/change-requests/${ids[1]}/merge`, { token: a.token })).status).toBe(409);
    expect((await propose(b, note.id, BASE + "\n\n![x](/api/law/assets/abc)")).body.error.code).toBe("media_not_allowed");
    // a private/squad note cannot receive requests
    const ws2 = await squad(a, [], { name: "ب", moduleName: "مادة أخرى" });
    const priv = (await newNote(a, ws2, { content: BASE })).body.note;
    expect((await propose(b, priv.id, e(1))).status).toBe(404);
  });
});

describe("reports and moderation", () => {
  const backdate = (users, days) => tmp.client.users.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { createdAt: new Date(Date.now() - days * 86400000) } });
  const report = (s, id, reason = "SPAM_ADS") => call("POST", `/law/hub/notes/${id}/report`, { token: s.token, body: { reason } });

  test("5 distinct SEASONED reporters hide a note (new accounts do not count: anti-brigading); owner is notified, can appeal; admin decides", async () => {
    const a = await student("أمين");
    const note = await publicNote(a);
    const fans = [];
    for (let i = 0; i < 6; i++) fans.push(await student(`ق${i}`));
    expect((await report(a, note.id)).status).toBe(400); // own note
    expect((await call("POST", `/law/hub/notes/${note.id}/report`, { token: fans[0].token, body: { reason: "NOPE" } })).status).toBe(400);
    for (const f of fans.slice(0, 5)) expect((await report(f, note.id)).body.hidden).toBe(false); // accounts are brand new
    expect((await report(fans[0], note.id)).status).toBe(409); // one report per person
    expect((await noteRow(note.id)).moderationStatus).toBe("ACTIVE");
    await backdate(fans, 10);
    // the 6th report triggers re-evaluation: 6 seasoned reporters now
    const last = await report(fans[5], note.id, "MISLEADING_LEGAL");
    expect(last.body.hidden).toBe(true);
    const row = await noteRow(note.id);
    expect(row).toMatchObject({ moderationStatus: "HIDDEN" });
    expect((await get(a, "/law/notifications")).body.items.find((n) => n.type === "HUB_REPORT_ACTION").payload).toMatchObject({ action: "hidden" });

    // hidden notes leave listings and 404 for others; the owner still sees them with the reason
    const c = await student("جمال");
    expect((await get(c, `/law/hub/notes/${note.id}`)).status).toBe(404);
    expect((await get(c, "/law/hub/notes")).body.notes.map((n) => n.id)).not.toContain(note.id);
    expect((await call("POST", `/law/notes/${note.id}/endorse`, { token: c.token })).status).toBe(404);
    expect((await get(a, `/law/hub/notes/${note.id}`)).body.note).toMatchObject({ moderationStatus: "HIDDEN" });
    expect((await propose(c, note.id, BASE + "\n\nx")).status).toBe(404);

    // appeal + admin queue
    expect((await call("POST", `/law/hub/notes/${note.id}/appeal`, { token: c.token })).status).toBe(404);
    expect((await call("POST", `/law/hub/notes/${note.id}/appeal`, { token: a.token })).status).toBe(200);
    const admin = await student("المشرف");
    await tmp.client.users.update({ where: { id: admin.id }, data: { role: "admin" } });
    expect((await get(c, "/law/admin/moderation/queue")).status).toBe(403);
    const q = (await get(admin, "/law/admin/moderation/queue")).body.queue;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ noteId: note.id, appealed: true });
    expect(q[0].reports).toHaveLength(6);
    expect((await call("POST", `/law/admin/moderation/${note.id}/decide`, { token: c.token, body: { decision: "restore" } })).status).toBe(403);
    expect((await call("POST", `/law/admin/moderation/${note.id}/decide`, { token: admin.token, body: { decision: "maybe" } })).status).toBe(400);
    expect((await call("POST", `/law/admin/moderation/${note.id}/decide`, { token: admin.token, body: { decision: "restore" } })).status).toBe(200);
    expect(await noteRow(note.id)).toMatchObject({ moderationStatus: "ACTIVE", appealedAt: null });
    expect((await get(c, `/law/hub/notes/${note.id}`)).status).toBe(200);
    expect((await tmp.client.lawNoteReport.findMany()).every((r) => r.status === "DISMISSED")).toBe(true);
    // upholding removes it for good
    for (const f of fans) await tmp.client.lawNoteReport.deleteMany({ where: { reporterId: f.id } });
    for (const f of fans.slice(0, 5)) await report(f, note.id);
    expect((await noteRow(note.id)).moderationStatus).toBe("HIDDEN");
    expect((await call("POST", `/law/admin/moderation/${note.id}/decide`, { token: admin.token, body: { decision: "uphold" } })).status).toBe(200);
    expect((await noteRow(note.id)).moderationStatus).toBe("REMOVED");
    expect((await get(a, "/law/notifications")).body.items.some((n) => n.payload.action === "removed")).toBe(true);
  });

  test("3 COPYRIGHT reports from SEASONED accounts hide a note (fresh sign-ups cannot); thresholds come from settings", async () => {
    const a = await student("أمين");
    const note = await publicNote(a);
    const fans = [await student("ق1"), await student("ق2"), await student("ق3")];
    for (const f of fans) expect((await report(f, note.id, "COPYRIGHT")).body.hidden).toBe(false); // brand-new accounts: no effect
    expect((await noteRow(note.id)).moderationStatus).toBe("ACTIVE");
    await backdate(fans, 10);
    await tmp.client.lawNoteReport.deleteMany({});
    expect((await report(fans[0], note.id, "COPYRIGHT")).body.hidden).toBe(false);
    expect((await report(fans[1], note.id, "COPYRIGHT")).body.hidden).toBe(false);
    expect((await report(fans[2], note.id, "COPYRIGHT")).body.hidden).toBe(true);
    expect((await noteRow(note.id)).hiddenReason).toBe("COPYRIGHT");
    // a lower threshold from AppSetting-style meta applies
    const b = await student("بشرى");
    const n2 = await publicNote(b);
    await tmp.client.lawSetting.upsert({ where: { key: "meta:hubModeration" }, create: { key: "meta:hubModeration", value: JSON.stringify({ reporters: 2, minAgeDays: 0 }) }, update: {} });
    await report(fans[0], n2.id);
    expect((await report(fans[1], n2.id)).body.hidden).toBe(true);
  });
});

describe("audit regressions", () => {
  test("a proposer loses access once the note is no longer public/active; blocks stop proposals, rebases and reports; tiny edits are refused; history lists accepted revisions only", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const note = await publicNote(a);
    const e = BASE.replace("الفقرة الثانية عن الضرر.", "الفقرة الثانية عن الضرر وأنواعه وشروطه.");
    expect((await propose(b, note.id, BASE.replace("الفقرة الأولى عن الخطأ.", "الفقرة الأولى عن الخطأ!"))).body.error.code).toBe("change_too_small");
    const crId = (await propose(b, note.id, e)).body.changeRequest.id;
    // proposals are not part of the public history
    const revs = (await get(b, `/law/hub/notes/${note.id}/revisions`)).body.revisions;
    expect(revs.map((r) => r.message)).toEqual(["initial"]);
    expect(revs[0].author).toBe("أمين"); // the owner is named
    // hide the note: the proposer can no longer read the request (nor the squad's current content)
    await tmp.client.lawMasterNote.update({ where: { id: note.id }, data: { moderationStatus: "HIDDEN" } });
    expect((await get(b, `/law/hub/change-requests/${crId}`)).status).toBe(404);
    expect((await get(a, `/law/hub/change-requests/${crId}`)).status).toBe(200);
    await tmp.client.lawMasterNote.update({ where: { id: note.id }, data: { moderationStatus: "ACTIVE", visibility: "squad" } });
    expect((await get(b, `/law/hub/change-requests/${crId}`)).status).toBe(404);
    await tmp.client.lawMasterNote.update({ where: { id: note.id }, data: { visibility: "public" } });
    expect((await get(b, `/law/hub/change-requests/${crId}`)).status).toBe(200);
    // a block closes every door
    await call("POST", `/law/social/block/${b.id}`, { token: a.token });
    expect((await propose(b, note.id, e + "\n\nفقرة أخرى طويلة بما يكفي")).status).toBe(404);
    expect((await call("POST", `/law/hub/change-requests/${crId}/rebase`, { token: b.token, body: { content: e + "\n\nفقرة أخرى طويلة بما يكفي" } })).status).toBe(404);
    expect((await call("POST", `/law/hub/notes/${note.id}/report`, { token: b.token, body: { reason: "OTHER" } })).status).toBe(404);
  });

  test("XP counts one merged request per note (splitting edits earns nothing extra); CR creation is rate limited", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const note = await publicNote(a);
    let content = BASE;
    for (let i = 0; i < 2; i++) {
      content = content + `\n\nفقرة إضافية رقم ${i} بنص كاف لتجاوز الحد الأدنى للتغيير.`;
      const id = (await propose(b, note.id, content)).body.changeRequest.id;
      expect((await call("POST", `/law/hub/change-requests/${id}/merge`, { token: a.token })).status).toBe(200);
    }
    expect((await get(b, "/law/profile")).body.progress.xp).toBe(40);
    // 10 per day, then 429 (createCR + withdraw loops included)
    await tmp.client.lawRateCounter.deleteMany({});
    let last;
    for (let i = 0; i < 11; i++) {
      last = await propose(b, note.id, content + `\n\nمقترح مستقل رقم ${i} بنص طويل كاف جدا.`);
      if (last.status === 201) await call("POST", `/law/hub/change-requests/${last.body.changeRequest.id}/withdraw`, { token: b.token });
    }
    expect(last.status).toBe(429);
  });
});
