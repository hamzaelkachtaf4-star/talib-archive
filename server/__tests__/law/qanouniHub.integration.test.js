// Qanouni Collab Phase B: three-tier visibility, Faculty Hub, forks, التوثيق and public profiles,
// through the real /api/law routes in multi-user mode.
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

describe("three-tier visibility", () => {
  test("private = creator only; squad by default; only the creator changes it; no media in public", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const ws = await squad(a, [b]);

    const priv = (await newNote(a, ws, { visibility: "private" })).body.note;
    expect(priv.visibility).toBe("private");
    expect((await call("GET", `/law/squads/workspaces/${ws.id}/notes`, { token: b.token })).body.notes).toEqual([]);
    expect((await call("GET", `/law/squads/notes/${priv.id}`, { token: b.token })).status).toBe(404);
    expect((await call("PATCH", `/law/squads/notes/${priv.id}`, { token: b.token, body: { version: 1, content: "x" } })).status).toBe(404);
    expect((await call("GET", `/law/squads/workspaces/${ws.id}/notes`, { token: a.token })).body.notes).toHaveLength(1);

    const shared = (await newNote(b, ws, { sessionNumber: 2 })).body.note;
    expect(shared.visibility).toBe("squad");
    // A edits B's note (allowed), but cannot change its visibility.
    const edit = await call("PATCH", `/law/squads/notes/${shared.id}`, { token: a.token, body: { version: 1, content: shared.content + "\n# المبحث الثاني\nإضافة" } });
    expect(edit.status).toBe(200);
    const take = await call("PATCH", `/law/squads/notes/${shared.id}`, { token: a.token, body: { version: 2, visibility: "public" } });
    expect([take.status, take.body.error]).toEqual([403, "creator_only"]);
    // B cannot hide it now that A wrote a section.
    const hide = await call("PATCH", `/law/squads/notes/${shared.id}`, { token: b.token, body: { version: 2, visibility: "private" } });
    expect([hide.status, hide.body.error]).toEqual([409, "has_contributors"]);

    // Public refused while the note links to app media or audio (text or pins).
    const leak = await call("PATCH", `/law/squads/notes/${shared.id}`, {
      token: b.token,
      body: { version: 2, visibility: "public", content: "تسجيل [هنا](/api/law/assets/abc/file)" },
    });
    expect([leak.status, leak.body.error]).toEqual([422, "media_not_allowed"]);
    const pinLeak = await call("PATCH", `/law/squads/notes/${shared.id}`, {
      token: b.token,
      body: { version: 2, visibility: "public", sourcePins: [{ id: "pin-1", type: "document", ref: "https://x.ma/cours.m4a" }] },
    });
    expect(pinLeak.body.error).toBe("media_not_allowed");
    const pub = await call("PATCH", `/law/squads/notes/${shared.id}`, { token: b.token, body: { version: 2, visibility: "public" } });
    expect(pub.status).toBe(200);
    expect(pub.body.note.visibility).toBe("public");
    expect(pub.body.note.publishedAt).toBeTruthy();
    // Once public, an edit cannot add media either.
    const later = await call("PATCH", `/law/squads/notes/${shared.id}`, { token: a.token, body: { version: 3, content: "audio.mp3 هنا" } });
    expect(later.body.error).toBe("media_not_allowed");
  });
});

describe("Faculty Hub", () => {
  test("lists public notes of the cohort with filters and search; squad/private never appear", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const c = await student("Chaimae");
    const ws = await squad(a, [b]);
    const wsOther = (await call("POST", "/law/squads/workspaces", { token: a.token, body: { moduleName: "القانون الجنائي", professorName: "د. ع" } })).body.workspace;
    await newNote(a, ws, { visibility: "public", content: "# المبحث الأول\nالمسؤولية التقصيرية والخطأ." });
    await newNote(a, ws, { sessionNumber: 2, title: "سرية", visibility: "squad" });
    await newNote(a, wsOther, { visibility: "public", title: "الجريمة", content: "الركن المادي" });
    // C is in another squad of the same cohort; D in another cohort.
    await squad(c, [], { name: "ج" });
    const d = await student("Driss");
    const wsD = await squad(d, [], { cohortTag: "FSJES-AinChock-S5-DP-G02" });
    await newNote(d, wsD, { visibility: "public", title: "S5 note" });

    const all = (await call("GET", "/law/hub/notes", { token: c.token })).body;
    expect(all.cohort).toBe("FSJES-AinChock-S3-DP-G01");
    expect(all.notes.map((n) => n.title).sort()).toEqual(["الجريمة", "المحاضرة الأولى"].sort());
    expect(all.notes[0]).toMatchObject({ author: { name: "أمين", publicProfile: false }, endorsementCount: 0, verified: false, mine: false });
    expect(all.notes.find((n) => n.title === "المحاضرة الأولى").excerpt).toContain("المسؤولية التقصيرية");

    const byModule = (await call("GET", `/law/hub/notes?module=${encodeURIComponent("القانون الجنائي")}`, { token: c.token })).body.notes;
    expect(byModule.map((n) => n.title)).toEqual(["الجريمة"]);
    const byProf = (await call("GET", `/law/hub/notes?professor=${encodeURIComponent("د. س")}`, { token: c.token })).body.notes;
    expect(byProf.map((n) => n.title)).toEqual(["المحاضرة الأولى"]);
    const search = (await call("GET", `/law/hub/notes?q=${encodeURIComponent("التقصيريه")}`, { token: c.token })).body.notes; // ه/ة normalised
    expect(search.map((n) => n.title)).toEqual(["المحاضرة الأولى"]);

    const facets = (await call("GET", "/law/hub/facets", { token: c.token })).body;
    expect(facets.modules).toEqual(["القانون الجنائي", "المسؤولية المدنية"].sort((x, y) => x.localeCompare(y)));
    expect(facets.cohorts).toContain("FSJES-AinChock-S5-DP-G02");
    const other = (await call("GET", "/law/hub/notes?cohort=FSJES-AinChock-S5-DP-G02", { token: c.token })).body.notes;
    expect(other.map((n) => n.title)).toEqual(["S5 note"]);
    // A student without a squad browses the default cohort.
    const loner = await student("وحيد");
    expect((await call("GET", "/law/hub/notes", { token: loner.token })).body.notes).toHaveLength(2);
    // Consent is required.
    const fresh = await LawAccount.register({ fullName: "x", email: "nc@example.ma", password: PASSWORD });
    const t = (await call("POST", "/law/auth/login", { body: { email: "nc@example.ma", password: PASSWORD } })).body.token;
    expect(fresh.error).toBeNull();
    expect((await call("GET", "/law/hub/notes", { token: t })).status).toBe(403);
  });

  test("public note view: creator named, squad-mates anonymous unless their profile is public", async () => {
    const a = await student("أمين");
    const b = await student("بشرى");
    const ws = await squad(a, [b]);
    const n = (await newNote(a, ws, { visibility: "public" })).body.note;
    await call("PATCH", `/law/squads/notes/${n.id}`, { token: b.token, body: { version: 1, content: n.content + "\n# المبحث الثاني\nفقرة من عضو آخر" } });
    const outsider = await student("غريب");
    const v = (await call("GET", `/law/hub/notes/${n.id}`, { token: outsider.token })).body.note;
    expect(v.createdBy.name).toBe("أمين");
    expect(v.sections.map((s) => s.author.name)).toEqual(["أمين", "عضو في الفرقة"]);
    expect(JSON.stringify(v)).not.toContain("بشرى");
    expect(v).not.toHaveProperty("version");
    expect(v).not.toHaveProperty("workspaceId");
    expect(v.canFork).toBe(false); // the outsider has no squad
    await call("PATCH", "/law/profile/public", { token: b.token, body: { publicProfile: true } });
    const v2 = (await call("GET", `/law/hub/notes/${n.id}`, { token: outsider.token })).body.note;
    expect(v2.sections[1].author).toMatchObject({ name: "بشرى", publicProfile: true });
    // Squad notes are never readable through the Hub.
    const s = (await newNote(a, ws, { sessionNumber: 2 })).body.note;
    expect((await call("GET", `/law/hub/notes/${s.id}`, { token: outsider.token })).status).toBe(404);
  });
});

describe("التوثيق (endorsements)", () => {
  test("toggle, never your own, 5+ = verified badge", async () => {
    const a = await student("أمين");
    const ws = await squad(a, []);
    const n = (await newNote(a, ws, { visibility: "public" })).body.note;
    expect((await call("POST", `/law/notes/${n.id}/endorse`, { token: a.token })).body.error).toBe("cannot_endorse_own");
    const fans = [];
    for (let i = 0; i < 5; i++) fans.push(await student(`موثق ${i}`));
    const first = await call("POST", `/law/notes/${n.id}/endorse`, { token: fans[0].token });
    expect(first.body).toEqual({ endorsed: true, endorsementCount: 1, verified: false });
    const undo = await call("POST", `/law/notes/${n.id}/endorse`, { token: fans[0].token });
    expect(undo.body).toEqual({ endorsed: false, endorsementCount: 0, verified: false });
    let last;
    for (const f of fans) last = await call("POST", `/law/notes/${n.id}/endorse`, { token: f.token });
    expect(last.body).toEqual({ endorsed: true, endorsementCount: 5, verified: true });
    const listed = (await call("GET", "/law/hub/notes", { token: fans[0].token })).body.notes[0];
    expect(listed).toMatchObject({ endorsementCount: 5, verified: true, endorsedByMe: true });
    expect((await call("GET", `/law/squads/notes/${n.id}`, { token: a.token })).body.note).toMatchObject({ endorsementCount: 5, verified: true });
    // Squad-only notes cannot be endorsed.
    const s = (await newNote(a, ws, { sessionNumber: 2 })).body.note;
    expect((await call("POST", `/law/notes/${s.id}/endorse`, { token: fans[1].token })).status).toBe(404);
  });
});

describe("forks", () => {
  test("clone a public note into my squad with attribution; the source keeps a fork count", async () => {
    const a = await student("أمين");
    const ws = await squad(a, []);
    const src = (await newNote(a, ws, {
      visibility: "public",
      sourcePins: [{ id: "pin-1", type: "document", ref: "Polycopié p. 3" }],
    })).body.note;
    const c = await student("Chaimae");
    expect((await call("POST", `/law/notes/${src.id}/fork`, { token: c.token })).body.error).toBe("not_in_squad");
    expect((await call("POST", `/law/notes/${src.id}/fork`, { token: a.token })).body.error).toBe("own_squad_note");
    await squad(c, [], { name: "ج", moduleName: "مادة أخرى" });

    const f = await call("POST", `/law/notes/${src.id}/fork`, { token: c.token });
    expect(f.status).toBe(201);
    const fork = f.body.note;
    expect(fork).toMatchObject({ forkedFromId: src.id, forkedFromAuthorName: "أمين", visibility: "squad", createdById: c.id, title: src.title, content: src.content });
    expect(fork.sourcePins.map((p) => p.ref)).toEqual(["Polycopié p. 3"]);
    expect(fork.sections.every((s) => s.author.name === "أمين")).toBe(true); // original author keeps the blame
    // A workspace for the same module and professor was created in C's squad.
    const myWs = (await call("GET", "/law/squads/workspaces", { token: c.token })).body.workspaces;
    expect(myWs.map((w) => [w.moduleName, w.professorName])).toContainEqual(["المسؤولية المدنية", "د. س"]);
    expect(f.body.workspaceId).toBe(myWs.find((w) => w.moduleName === "المسؤولية المدنية").id);
    // Forking again uses the next free session number.
    const again = (await call("POST", `/law/notes/${src.id}/fork`, { token: c.token })).body.note;
    expect(again.sessionNumber).toBe(2);
    expect((await call("GET", `/law/hub/notes/${src.id}`, { token: c.token })).body.note.forkCount).toBe(2);
    // Attribution survives the source going private.
    await call("PATCH", `/law/squads/notes/${src.id}`, { token: a.token, body: { version: 1, visibility: "private" } });
    expect((await call("GET", `/law/squads/notes/${fork.id}`, { token: c.token })).body.note.forkedFromAuthorName).toBe("أمين");
    expect((await call("POST", `/law/notes/${src.id}/fork`, { token: c.token })).status).toBe(404);
  });
});

describe("public profiles and badges", () => {
  test("opt-in profile with public notes, endorsements received and badges", async () => {
    const a = await student("أمين");
    const viewer = await student("زائر");
    expect((await call("GET", `/law/students/${a.id}`, { token: viewer.token })).status).toBe(404);
    expect((await call("GET", `/law/students/${a.id}`, { token: a.token })).body.profile.me).toBe(true);
    expect((await call("PATCH", "/law/profile/public", { token: a.token, body: { publicProfile: "yes" } })).status).toBe(400);
    await call("PATCH", "/law/profile/public", { token: a.token, body: { publicProfile: true } });

    const ws = await squad(a, []);
    const notes = [];
    for (let i = 1; i <= 3; i++) notes.push((await newNote(a, ws, { sessionNumber: i, title: `م${i}`, visibility: "public" })).body.note);
    await newNote(a, ws, { sessionNumber: 4, title: "داخلي" }); // squad-only: not on the profile
    // 6 + 4 endorsements on the module's notes → expert (10); the first note is verified (5+).
    const endorsers = await Promise.all(
      Array.from({ length: 6 }, (_, i) => tmp.client.users.create({ data: { username: `e${i}`, password: "!", role: "default" } }))
    );
    for (const u of endorsers) await tmp.client.lawEndorsement.create({ data: { noteId: notes[0].id, userId: u.id } });
    for (const u of endorsers.slice(0, 4)) await tmp.client.lawEndorsement.create({ data: { noteId: notes[1].id, userId: u.id } });

    const p = (await call("GET", `/law/students/${a.id}`, { token: viewer.token })).body.profile;
    expect(p).toMatchObject({ name: "أمين", me: false, endorsementsReceived: 10, tdGroup: "G01", semester: "S3" });
    expect(p).not.toHaveProperty("email");
    expect(p.notes.map((n) => n.title).sort()).toEqual(["م1", "م2", "م3"]);
    expect(p.badges).toEqual(
      expect.arrayContaining([
        { type: "expert", module: "المسؤولية المدنية", endorsements: 10 },
        { type: "verified_author" },
        { type: "publisher", count: 3 },
      ])
    );
    await call("PATCH", "/law/profile/public", { token: a.token, body: { publicProfile: false } });
    expect((await call("GET", `/law/students/${a.id}`, { token: viewer.token })).status).toBe(404);
  });

  test("RC2 1.2: a private account shows only a public card unless the viewer is an ACCEPTED follower; blocks hide it", async () => {
    const a = await student("أمين");
    const stranger = await student("غريب");
    const pending = await student("منتظر");
    const rejected = await student("مرفوض");
    const follower = await student("متابع");
    const blocked = await student("محظور");
    await call("PATCH", "/law/profile/public", { token: a.token, body: { publicProfile: true } });
    await tmp.client.lawUserProfile.update({ where: { userId: a.id }, data: { isPrivate: true } });
    const mkFollow = (u, status) => tmp.client.lawFollow.create({ data: { followerId: u.id, followeeId: a.id, status } });
    await mkFollow(pending, "PENDING");
    await mkFollow(rejected, "REJECTED");
    await mkFollow(follower, "ACCEPTED");
    await tmp.client.lawBlock.create({ data: { blockerId: a.id, blockedId: blocked.id } });

    const FORBIDDEN = ["xp", "level", "streak", "tdGroup", "filiere", "languageSection", "notes", "badges", "endorsementsReceived", "forksReceived"];
    for (const v of [stranger, pending, rejected]) {
      const r = await call("GET", `/law/students/${a.id}`, { token: v.token });
      expect(r.status).toBe(200);
      expect(Object.keys(r.body.profile).sort()).toEqual(["avatar", "cardOnly", "faculty", "me", "name", "semester", "userId"]);
      for (const k of FORBIDDEN) expect(r.body.profile).not.toHaveProperty(k);
    }
    const full = (await call("GET", `/law/students/${a.id}`, { token: follower.token })).body.profile;
    expect(full).toMatchObject({ name: "أمين", xp: expect.any(Number), streak: expect.any(Number), tdGroup: "G01" });
    expect((await call("GET", `/law/students/${a.id}`, { token: blocked.token })).status).toBe(404);
  });
});
