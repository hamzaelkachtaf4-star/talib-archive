// Qanouni Collab: the legal consent gate (Phase 0) and study squads, module workspaces, master notes and
// squad decks (Phase A), through the real /api/law routes in multi-user mode.
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

describe("Phase 0: legal consent gate", () => {
  test("squad features need the current notice accepted, with all three boxes", async () => {
    const s = await student("سارة", { consent: false });
    expect((await call("GET", "/law/auth/consent", { token: s.token })).body).toMatchObject({ accepted: false, version: "1.1.0" });
    const blocked = await call("GET", "/law/squads/my", { token: s.token });
    expect([blocked.status, blocked.body.error]).toEqual([403, "consent_required"]);

    const partial = await call("POST", "/law/auth/consent", { token: s.token, body: { ...CONSENT, privacyAccepted: false } });
    expect([partial.status, partial.body.error]).toEqual([400, "consent_incomplete"]);
    const old = await call("POST", "/law/auth/consent", { token: s.token, body: { ...CONSENT, version: "0.9.0" } });
    expect(old.body.error).toBe("consent_version_mismatch");

    const ok = await call("POST", "/law/auth/consent", {
      token: s.token,
      body: CONSENT,
      headers: { "User-Agent": "Mozilla/5.0 Qanouni-test" },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.consent).toMatchObject({ accepted: true, acceptedVersion: "1.1.0" });
    const row = await tmp.client.lawUserConsent.findUnique({ where: { userId: s.id } });
    expect(row).toMatchObject({ termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0", userAgent: "Mozilla/5.0 Qanouni-test" });
    expect(row.ipAddress).toBeTruthy();
    expect((await call("GET", "/law/squads/my", { token: s.token })).body).toEqual({ squad: null });
    // A newer notice version would require accepting again.
    await tmp.client.lawUserConsent.update({ where: { userId: s.id }, data: { version: "0.9.0" } });
    expect((await call("GET", "/law/squads/my", { token: s.token })).status).toBe(403);
    expect((await call("GET", "/law/auth/consent")).status).toBe(401);
  });

  test("cohort defaults on new profiles", async () => {
    const s = await student("ب");
    const p = await tmp.client.lawUserProfile.findUnique({ where: { userId: s.id } });
    expect(p).toMatchObject({
      faculty: "FSJES Ain Chock",
      semester: "S3",
      filiere: "Droit Privé / القانون الخاص",
      languageSection: "Section Arabe / الفوج العربي",
      tdGroup: "G01",
    });
  });
});

describe("Phase A: squads", () => {
  test("create, join with a 6-character code, hard cap of 6 members, one squad per student", async () => {
    const owner = await student("Amine");
    const created = await call("POST", "/law/squads/create", { token: owner.token, body: { name: "فرقة المسؤولية" } });
    expect(created.status).toBe(201);
    const code = created.body.squad.inviteCode;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(created.body.squad.cohortTag).toBe("FSJES-AinChock-S3-DP-G01");
    expect(created.body.myRole).toBe("owner");

    const others = [];
    for (let i = 0; i < 5; i++) {
      const s = await student(`عضو ${i}`);
      const j = await call("POST", "/law/squads/join", { token: s.token, body: { code: code.toLowerCase().split("").join(" ") } });
      expect(j.status).toBe(200);
      others.push(s);
    }
    const seventh = await student("سابع");
    const full = await call("POST", "/law/squads/join", { token: seventh.token, body: { code } });
    expect([full.status, full.body.error]).toEqual([409, "squad_full"]);

    const my = (await call("GET", "/law/squads/my", { token: others[0].token })).body;
    expect(my.members).toHaveLength(6);
    expect(my.members[0]).toMatchObject({ name: "Amine", role: "owner", avatar: { initials: "A" } });
    expect(my.collectiveXp).toBe(0);
    // Already in a squad: cannot create or join another.
    expect((await call("POST", "/law/squads/create", { token: owner.token, body: { name: "x" } })).body.error).toBe("already_in_squad");
    const other = await call("POST", "/law/squads/create", { token: seventh.token, body: { name: "ب" } });
    expect((await call("POST", "/law/squads/join", { token: owner.token, body: { code: other.body.squad.inviteCode } })).body.error).toBe("already_in_squad");
    expect((await call("POST", "/law/squads/join", { token: owner.token, body: { code } })).body.error).toBe("already_member");
  });

  test("the cap holds under concurrent joins", async () => {
    const owner = await student("مالك");
    const { inviteCode } = (await call("POST", "/law/squads/create", { token: owner.token, body: { name: "ف" } })).body.squad;
    for (let i = 0; i < 3; i++) {
      const s = await student(`ع${i}`);
      await call("POST", "/law/squads/join", { token: s.token, body: { code: inviteCode } });
    }
    const racers = await Promise.all(Array.from({ length: 5 }, (_, i) => student(`سباق${i}`)));
    const results = await Promise.allSettled(racers.map((s) => LawSquad.join(s.id, inviteCode)));
    const joined = results.filter((r) => r.status === "fulfilled" && !r.value.error).length;
    const members = await tmp.client.lawSquadMember.count();
    expect(members).toBe(6);
    expect(joined).toBe(2);
  });

  test("wrong invite codes are rate limited; leaving hands over ownership; the last one out deletes the squad", async () => {
    const a = await student("أ");
    const statuses = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await call("POST", "/law/squads/join", { token: a.token, body: { code: `ZZZZ${10 + i}` } })).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);

    resetRateLimits();
    const { inviteCode } = (await call("POST", "/law/squads/create", { token: a.token, body: { name: "ف" } })).body.squad;
    const b = await student("ب");
    const c = await student("ج");
    await call("POST", "/law/squads/join", { token: b.token, body: { code: inviteCode } });
    await call("POST", "/law/squads/join", { token: c.token, body: { code: inviteCode } });
    expect((await call("DELETE", `/law/squads/members/${c.id}`, { token: b.token })).status).toBe(403);
    expect((await call("DELETE", `/law/squads/members/${c.id}`, { token: a.token })).status).toBe(200);
    expect((await call("POST", "/law/squads/leave", { token: a.token })).status).toBe(200);
    expect((await call("GET", "/law/squads/my", { token: b.token })).body.myRole).toBe("owner");
    await call("POST", "/law/squads/leave", { token: b.token });
    expect(await tmp.client.lawSquad.count()).toBe(0);
  });
});

describe("Phase A: workspaces and the master lecture note", () => {
  async function squadOfTwo() {
    const a = await student("أمين");
    const b = await student("بشرى");
    const { inviteCode } = (await call("POST", "/law/squads/create", { token: a.token, body: { name: "ف" } })).body.squad;
    await call("POST", "/law/squads/join", { token: b.token, body: { code: inviteCode } });
    const ws = await call("POST", "/law/squads/workspaces", {
      token: a.token,
      body: { moduleName: "المسؤولية المدنية", professorName: "د. أستاذ تجريبي" },
    });
    expect(ws.status).toBe(201);
    return { a, b, ws: ws.body.workspace };
  }

  const CONTENT = [
    "تمهيد قصير.",
    "# المبحث الأول: الخطأ",
    "يقوم الخطأ على عنصرين [^pin-1].",
    "## المطلب الأول: العنصر المادي",
    "الإخلال بالتزام.",
    "# المبحث الثاني: الضرر",
    "ضرر محقق [^pin-2] [^pin-9].",
  ].join("\n");

  test("same module, different professors; outline, Law Blame, pins grounded in the corpus", async () => {
    const { a, b, ws } = await squadOfTwo();
    const ws2 = await call("POST", "/law/squads/workspaces", {
      token: b.token,
      body: { moduleName: "المسؤولية المدنية", professorName: "د. أستاذ آخر", academicYear: "2026/2027" },
    });
    expect(ws2.status).toBe(201);
    expect((await call("GET", "/law/squads/workspaces", { token: a.token })).body.workspaces).toHaveLength(2);

    const created = await call("POST", `/law/squads/workspaces/${ws.id}/notes`, {
      token: a.token,
      body: {
        sessionNumber: 1,
        title: "المحاضرة 1",
        content: CONTENT,
        sourcePins: [
          { id: "pin-1", type: "ref", ref: "doc:77" },
          { id: "pin-2", type: "ref", ref: "DOC:999" },
          { id: "pin-3", type: "document", ref: "Polycopié du professeur, p. 12", label: "المطبوع" },
        ],
      },
    });
    expect(created.status).toBe(201);
    const n = created.body.note;
    expect(n.planJson.map((x) => [x.heading, x.kind])).toEqual([
      ["المبحث الأول: الخطأ", "section"],
      ["المبحث الثاني: الضرر", "section"],
    ]);
    expect(n.planJson[0].children[0].kind).toBe("subsection");
    const pins = Object.fromEntries(n.sourcePins.map((p) => [p.id, p]));
    expect(pins["pin-1"]).toMatchObject({ ref: "DOC:77", resolved: true });
    expect(pins["pin-1"].preview).toContain("نص تجريبي");
    expect(pins["pin-2"]).toMatchObject({ resolved: false, preview: null });
    expect(n.danglingPins).toEqual(["pin-9"]);
    expect(n.contributors).toEqual([expect.objectContaining({ userId: a.id, percent: 100, name: "أمين" })]);
    expect((await call("POST", `/law/squads/workspaces/${ws.id}/notes`, { token: b.token, body: { sessionNumber: 1, title: "x", content: "" } })).body.error).toBe("session_exists");

    // B edits only the second مبحث: only that section is now B's.
    const edited = CONTENT.replace("ضرر محقق", "ضرر محقق ومباشر");
    const up = await call("PATCH", `/law/squads/notes/${n.id}`, { token: b.token, body: { version: n.version, content: edited } });
    expect(up.status).toBe(200);
    const blame = Object.fromEntries(up.body.note.sectionAuthors.map((s) => [s.heading || "_intro", s.userId]));
    expect(blame).toEqual({
      _intro: a.id,
      "المبحث الأول: الخطأ": a.id,
      "المطلب الأول: العنصر المادي": a.id,
      "المبحث الثاني: الضرر": b.id,
    });
    expect(up.body.note.contributors.map((c) => c.userId).sort()).toEqual([a.id, b.id].sort());
    expect(up.body.note.contributors.reduce((s, c) => s + c.percent, 0)).toBe(100);

    // A saves from the old version: refused with the current note, nothing overwritten.
    const stale = await call("PATCH", `/law/squads/notes/${n.id}`, { token: a.token, body: { version: n.version, content: "استبدال" } });
    expect([stale.status, stale.body.error]).toEqual([409, "edit_conflict"]);
    expect(stale.body.current.content).toBe(edited);
  });

  test("students outside the squad see nothing", async () => {
    const { a, ws } = await squadOfTwo();
    const note = (await call("POST", `/law/squads/workspaces/${ws.id}/notes`, { token: a.token, body: { sessionNumber: 1, title: "t", content: "x" } })).body.note;
    const outsider = await student("غريب");
    await call("POST", "/law/squads/create", { token: outsider.token, body: { name: "أخرى" } });
    expect((await call("GET", `/law/squads/workspaces/${ws.id}/notes`, { token: outsider.token })).status).toBe(404);
    expect((await call("GET", `/law/squads/notes/${note.id}`, { token: outsider.token })).status).toBe(404);
    expect((await call("PATCH", `/law/squads/notes/${note.id}`, { token: outsider.token, body: { version: 1, content: "x" } })).status).toBe(404);
    expect((await call("GET", `/law/squads/workspaces/${ws.id}/cards`, { token: outsider.token })).status).toBe(404);
    expect((await call("POST", `/law/squads/workspaces/${ws.id}/cards`, { token: outsider.token, body: { front: "f", back: "b" } })).status).toBe(404);
    expect((await call("GET", "/law/squads/workspaces", { token: outsider.token })).body.workspaces).toEqual([]);
  });
});

describe("Phase A: squad decks", () => {
  test("shared content, personal FSRS schedule", async () => {
    const a = await student("أ");
    const b = await student("ب");
    const c = await student("ج");
    const { inviteCode } = (await call("POST", "/law/squads/create", { token: a.token, body: { name: "ف" } })).body.squad;
    await call("POST", "/law/squads/join", { token: b.token, body: { code: inviteCode } });
    await call("POST", "/law/squads/join", { token: c.token, body: { code: inviteCode } });
    const ws = (await call("POST", "/law/squads/workspaces", { token: a.token, body: { moduleName: "المسؤولية المدنية", professorName: "د. س" } })).body.workspace;

    const card = (await call("POST", `/law/squads/workspaces/${ws.id}/cards`, { token: a.token, body: { front: "ما الخطأ؟", back: "إخلال بالتزام", canonicalIds: ["doc:77"] } })).body.card;
    // B subscribes: gets a personal copy in a subject named after the module.
    const sub = await call("POST", `/law/squads/workspaces/${ws.id}/cards/subscribe`, { token: b.token });
    expect(sub.body).toMatchObject({ created: 1, updated: 0 });
    const copyB = await tmp.client.lawFlashcard.findFirst({ where: { userId: b.id } });
    expect(copyB).toMatchObject({ front: "ما الخطأ؟", origin: "squad", squadCardId: card.id, canonicalIds: '["DOC:77"]' });
    expect((await tmp.client.lawSubject.findUnique({ where: { id: copyB.subjectId } })).name).toBe("المسؤولية المدنية");
    expect(await tmp.client.lawFlashcard.count({ where: { userId: c.id } })).toBe(0); // not subscribed

    // B has reviewed it (personal schedule), then A corrects the back: content follows, schedule stays.
    await tmp.client.lawFlashcard.update({ where: { id: copyB.id }, data: { reps: 3, stability: 7.5, state: "review" } });
    expect((await call("PATCH", `/law/squads/cards/${card.id}`, { token: a.token, body: { back: "إخلال بالتزام سابق" } })).status).toBe(200);
    const after = await tmp.client.lawFlashcard.findUnique({ where: { id: copyB.id } });
    expect(after).toMatchObject({ back: "إخلال بالتزام سابق", reps: 3, stability: 7.5, state: "review" });

    // A new card reaches subscribers; deleting a card retires the copies.
    await call("POST", `/law/squads/workspaces/${ws.id}/cards`, { token: c.token, body: { front: "ما الضرر؟", back: "أذى" } });
    expect(await tmp.client.lawFlashcard.count({ where: { userId: b.id, deletedAt: null } })).toBe(2);
    expect((await call("DELETE", `/law/squads/cards/${card.id}`, { token: c.token })).status).toBe(403); // not the creator
    expect((await call("DELETE", `/law/squads/cards/${card.id}`, { token: a.token })).status).toBe(200);
    expect((await tmp.client.lawFlashcard.findUnique({ where: { id: copyB.id } })).deletedAt).not.toBeNull();
    const list = (await call("GET", `/law/squads/workspaces/${ws.id}/cards`, { token: b.token })).body;
    expect(list.subscribed).toBe(true);
    expect(list.cards.map((x) => x.front)).toEqual(["ما الضرر؟"]);
    // B's copies are B's own rows: A never sees them in their card list.
    expect(await tmp.client.lawFlashcard.count({ where: { userId: a.id } })).toBe(0);
  });
});
