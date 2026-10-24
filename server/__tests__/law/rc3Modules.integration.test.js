// RC3 Phase 3: semester-aware modules (curriculum seed), custom modules, setup profile, professor card.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function student(name, email, scope = SCOPE) {
  const u = await h.signUp(name, email);
  if (scope) await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: scope });
  return u;
}
const list = (u, s = "S3") => h.call("GET", `/law/modules?semester=${s}`, { token: u.token });
const SEEDED = ["المسؤولية المدنية", "قانون الشركات", "القانون الاجتماعي / قانون الشغل", "التنظيم القضائي للمملكة", "الأنظمة الدستورية المقارنة", "قانون الميزانية والمالية العامة"];

describe("semester-aware module list", () => {
  test("first visit copies the default S3 list into the student's own modules, flagged as unverified", async () => {
    const a = await student("سلمى", "a@example.ma");
    const r = await list(a);
    expect(r.status).toBe(200);
    expect(r.body.modules.map((m) => m.title)).toEqual(SEEDED);
    for (const m of r.body.modules) expect(m).toMatchObject({ owned: true, source: "seed", verified: false, parcours: "" });
    expect(r.body.modules.every((m) => m.total > 0)).toBe(true); // each has its path scaffold
    expect(r.body.canAdd).toBe(true);
  });

  test("is idempotent, also under concurrent first visits", async () => {
    const a = await student("سلمى", "a@example.ma");
    const rs = await Promise.all([list(a), list(a), list(a)]);
    for (const r of rs) expect(r.status).toBe(200);
    expect((await list(a)).body.modules).toHaveLength(6);
    expect(await h.tmp.client.lawCourseModule.count({ where: { ownerId: a.user.id } })).toBe(6);
    expect(await h.tmp.client.lawCurriculumSeed.count({ where: { userId: a.user.id } })).toBe(1);
  });

  test("a deleted seeded module does not come back", async () => {
    const a = await student("سلمى", "a@example.ma");
    const first = (await list(a)).body.modules;
    expect((await h.call("DELETE", `/law/modules/${first[0].id}`, { token: a.token })).status).toBe(200);
    const again = (await list(a)).body.modules;
    expect(again).toHaveLength(5);
    expect(again.map((m) => m.title)).not.toContain(first[0].title);
  });

  test("each student gets private copies; one cannot open another's module", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const ma = (await list(a)).body.modules;
    const mb = (await list(b)).body.modules;
    expect(ma.map((m) => m.id).some((id) => mb.some((x) => x.id === id))).toBe(false);
    expect((await h.call("GET", `/law/path/modules/${ma[0].id}/graph`, { token: b.token })).status).toBe(404);
    expect((await h.call("GET", `/law/path/modules/${ma[0].id}/graph`, { token: a.token })).status).toBe(200);
    expect((await h.call("PATCH", `/law/modules/${ma[0].id}`, { token: b.token, body: { title: "اختراق" } })).status).toBe(404);
    expect((await h.call("DELETE", `/law/modules/${ma[0].id}`, { token: b.token })).status).toBe(404);
  });

  test("no list is invented for a semester without a curriculum: empty list, add allowed, not an error", async () => {
    const a = await student("سلمى", "a@example.ma");
    const r = await list(a, "S1");
    expect(r.status).toBe(200);
    expect(r.body.modules).toEqual([]);
    expect(r.body.canAdd).toBe(true);
    expect(await h.tmp.client.lawCurriculumSeed.count()).toBe(0);
  });

  test("official modules are listed next to the seeded six; an official module with the same title is not duplicated", async () => {
    const a = await student("سلمى", "a@example.ma");
    await h.tmp.client.lawCourseModule.create({ data: { facultyCode: "FSJES-AC", semester: "S3", track: "PRIVE", language: "AR", parcours: "", ordinal: 1, title: "مادة رسمية" } });
    await h.tmp.client.lawCourseModule.create({ data: { facultyCode: "FSJES-AC", semester: "S3", track: "PRIVE", language: "AR", parcours: "", ordinal: 2, title: "قانون الشركات" } });
    const r = await list(a);
    const titles = r.body.modules.map((m) => m.title);
    expect(titles).toHaveLength(7);
    expect(titles.filter((t) => t === "قانون الشركات")).toHaveLength(1);
    expect(r.body.modules.find((m) => m.title === "مادة رسمية")).toMatchObject({ owned: false, verified: true });
  });

  test("French track gets French titles; public track gets its own six", async () => {
    const fr = await student("Salma", "fr@example.ma", { ...SCOPE, studyLang: "FR" });
    expect((await list(fr)).body.modules.map((m) => m.title)).toEqual(["Responsabilité civile", "Droit des sociétés", "Droit social / du travail", "Organisation judiciaire du Royaume", "Systèmes constitutionnels comparés", "Finances publiques et droit budgétaire"]);
    const pub = await student("يوسف", "pub@example.ma", { ...SCOPE, track: "PUBLIC" });
    expect((await list(pub)).body.modules.map((m) => m.title)).toEqual(SEEDED);
  });

  test("without an academic profile the answer is still 409 academic_profile_required", async () => {
    const a = await student("سلمى", "a@example.ma", null);
    const r = await list(a);
    expect(r.status).toBe(409);
  });
});

describe("the official semester endpoint keeps its contract", () => {
  test("GET /path/semesters/:s/modules lists official modules only: no seed, no student-owned module", async () => {
    const a = await student("سلمى", "a@example.ma");
    expect((await list(a)).body.modules).toHaveLength(6); // my modules: seeded
    const official = await h.call("GET", "/law/path/semesters/S3/modules", { token: a.token });
    expect(official.body.modules).toEqual([]);
    await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S3", title: "مادة خاصة" } });
    expect((await h.call("GET", "/law/path/semesters/S3/modules", { token: a.token })).body.modules).toEqual([]);
  });

  test("my modules: bad semester is 400, missing profile is 409, anonymous is 401", async () => {
    const a = await student("سلمى", "a@example.ma");
    expect((await list(a, "S9")).status).toBe(400);
    const b = await h.signUp("يوسف", "b@example.ma");
    expect((await h.call("GET", "/law/modules?semester=S3", { token: b.token })).status).toBe(409);
    expect((await h.call("GET", "/law/modules?semester=S3")).status).toBe(401);
  });
});

describe("custom modules", () => {
  test("add, validate, rename, confirm and delete", async () => {
    const a = await student("سلمى", "a@example.ma", { ...SCOPE, semester: "S3" });
    await list(a, "S1"); // nothing seeded for S1
    const add = await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S1", title: "  القانون   المدني  " } });
    expect(add.status).toBe(201);
    expect(add.body.module).toMatchObject({ title: "القانون المدني", owned: true, source: "custom", verified: true, semester: "S1" });
    const g = await h.call("GET", `/law/path/modules/${add.body.module.id}/graph`, { token: a.token });
    expect(g.body.nodes.length).toBeGreaterThan(0);
    expect((await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S1", title: "القانون المدني" } })).status).toBe(409);
    expect((await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S1", title: "ا" } })).status).toBe(400);
    expect((await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S1", title: "x".repeat(81) } })).status).toBe(400);
    expect((await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S9", title: "مادة" } })).status).toBe(400);
    const ren = await h.call("PATCH", `/law/modules/${add.body.module.id}`, { token: a.token, body: { title: "قانون الالتزامات" } });
    expect(ren.body.module.title).toBe("قانون الالتزامات");
    expect((await list(a, "S1")).body.modules.map((m) => m.title)).toEqual(["قانون الالتزامات"]);
    expect((await h.call("DELETE", `/law/modules/${add.body.module.id}`, { token: a.token })).status).toBe(200);
    expect((await list(a, "S1")).body.modules).toEqual([]);
  });

  test("confirming a seeded module removes the default-list flag", async () => {
    const a = await student("سلمى", "a@example.ma");
    const m = (await list(a)).body.modules[0];
    const r = await h.call("PATCH", `/law/modules/${m.id}`, { token: a.token, body: { confirm: true } });
    expect(r.body.module.verified).toBe(true);
    expect((await list(a)).body.modules[0].verified).toBe(true);
  });

  test("a shared official module cannot be renamed or deleted by a student", async () => {
    const a = await student("سلمى", "a@example.ma");
    const shared = await h.tmp.client.lawCourseModule.create({ data: { facultyCode: "FSJES-AC", semester: "S3", track: "PRIVE", language: "AR", parcours: "", ordinal: 1, title: "رسمية" } });
    expect((await h.call("PATCH", `/law/modules/${shared.id}`, { token: a.token, body: { title: "x1" } })).status).toBe(404);
    expect((await h.call("DELETE", `/law/modules/${shared.id}`, { token: a.token })).status).toBe(404);
    expect(await h.tmp.client.lawCourseModule.count({ where: { id: shared.id } })).toBe(1);
  });

  test("at most 30 own modules per semester", async () => {
    const a = await student("سلمى", "a@example.ma");
    for (let i = 0; i < 30; i++) expect((await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S2", title: `مادة رقم ${i + 10}` } })).status).toBe(201);
    expect((await h.call("POST", "/law/modules", { token: a.token, body: { semester: "S2", title: "الحادية والثلاثون" } })).status).toBe(409);
  });

  test("deleting the account removes the student's modules and everything under them", async () => {
    const a = await student("سلمى", "a@example.ma");
    const m = (await list(a)).body.modules[0];
    await h.call("PUT", `/law/modules/${m.id}/professor`, { token: a.token, body: { name: "د. فلان" } });
    await h.tmp.client.users.delete({ where: { id: a.user.id } });
    expect(await h.tmp.client.lawCourseModule.count()).toBe(0);
    expect(await h.tmp.client.lawPathNode.count()).toBe(0);
    expect(await h.tmp.client.lawProfessorCard.count()).toBe(0);
    expect(await h.tmp.client.lawCurriculumSeed.count()).toBe(0);
  });
});

describe("workspace v3: session done flag, exam set-up, content reports", () => {
  async function withNode(u) {
    const id = (await list(u)).body.modules[0].id;
    const node = (await h.call("POST", `/law/modules/${id}/nodes`, { token: u.token, body: { title: "الضرر", body: "نص" } })).body.node;
    return { id, node };
  }
  test("a session can be marked understood and un-marked; the flag is per student and validated", async () => {
    const a = await student("سلمى", "a@example.ma");
    const { id, node } = await withNode(a);
    expect(node.done).toBe(false);
    const on = await h.call("PATCH", `/law/modules/${id}/nodes/${node.id}`, { token: a.token, body: { done: true } });
    expect(on.body.node.done).toBe(true);
    expect((await h.call("GET", `/law/modules/${id}/tree`, { token: a.token })).body.nodes.find((n) => n.id === node.id).done).toBe(true);
    expect((await h.call("PATCH", `/law/modules/${id}/nodes/${node.id}`, { token: a.token, body: { done: false } })).body.node.done).toBe(false);
    for (const done of ["yes", 1, null]) expect((await h.call("PATCH", `/law/modules/${id}/nodes/${node.id}`, { token: a.token, body: { done } })).status).toBe(400);
    const b = await student("يوسف", "b@example.ma");
    expect((await h.call("PATCH", `/law/modules/${id}/nodes/${node.id}`, { token: b.token, body: { done: true } })).status).toBe(404);
  });

  const CFG = { types: ["cards", "qcu", "case"], difficulty: "progressive", count: 5, caseSource: "both", mode: "quiz", builtAt: null };
  test("the exam set-up is stored per module and validated", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = (await list(a)).body.modules[0].id;
    expect((await h.call("GET", `/law/modules/${id}/profile`, { token: a.token })).body.profile.examConfig).toBeNull();
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { examConfig: CFG } })).body.profile.examConfig).toEqual(CFG);
    const { mode, ...noMode } = CFG;
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { examConfig: { ...noMode, count: 20 } } })).body.profile.examConfig).toEqual({ ...CFG, count: 20 }); // an older client without a mode gets the quiz
    for (const m of ["cards", "final"]) expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { examConfig: { ...CFG, count: 13, mode: m } } })).body.profile.examConfig).toMatchObject({ count: 13, mode: m });
    const built = { ...CFG, builtAt: "2026-10-23T10:00:00.000Z" };
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { examConfig: built } })).body.profile.examConfig).toEqual(built);
    for (const bad of [{ ...CFG, types: [] }, { ...CFG, types: ["qcu", "qcu"] }, { ...CFG, types: ["poem"] }, { ...CFG, difficulty: "insane" }, { ...CFG, count: 4 }, { ...CFG, count: 21 }, { ...CFG, count: 7.5 }, { ...CFG, mode: "party" }, { ...CFG, caseSource: "x" }, { ...CFG, builtAt: "yesterday" }, "text", []]) {
      expect({ bad, status: (await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { examConfig: bad } })).status }).toEqual({ bad, status: 400 });
    }
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { examConfig: null } })).body.profile.examConfig).toBeNull();
  });

  const MIX = { lectures: 50, printed: 25, research: 0, legal: 25 };
  test("the share of each kind of source is stored per subject: whole multiples of 5 adding up to 100", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = (await list(a)).body.modules[0].id;
    expect((await h.call("GET", `/law/modules/${id}/profile`, { token: a.token })).body.profile.sourceMix).toBeNull();
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { sourceMix: MIX } })).body.profile.sourceMix).toEqual(MIX);
    for (const bad of [{ ...MIX, lectures: 55 }, { ...MIX, lectures: 52, printed: 23 }, { ...MIX, legal: -5, lectures: 80 }, { lectures: 100 }, { ...MIX, extra: 0 }, [], "x", { ...MIX, printed: "25" }, { lectures: 0, printed: 0, research: 0, legal: 0 }, { lectures: 0, printed: 0, research: 100, legal: 0 }]) {
      expect({ bad, status: (await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { sourceMix: bad } })).status }).toEqual({ bad, status: 400 });
    }
    expect((await h.call("GET", `/law/modules/${id}/profile`, { token: a.token })).body.profile.sourceMix).toEqual(MIX); // a refused value changes nothing
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { sourceMix: null } })).body.profile.sourceMix).toBeNull();
  });

  test("a content error report is stored with the note, needs a note, belongs to the reporter's own node, and is capped", async () => {
    const a = await student("سلمى", "a@example.ma");
    const { id, node } = await withNode(a);
    const r = await h.call("POST", `/law/modules/${id}/nodes/${node.id}/report`, { token: a.token, body: { note: "الفصل غير صحيح" } });
    expect(r.status).toBe(201);
    expect(await h.tmp.client.lawNodeReport.count({ where: { userId: a.user.id, nodeId: node.id } })).toBe(1);
    for (const note of ["", "   ", "x".repeat(501), 5, undefined]) expect((await h.call("POST", `/law/modules/${id}/nodes/${node.id}/report`, { token: a.token, body: { note } })).status).toBe(400);
    const b = await student("يوسف", "b@example.ma");
    expect((await h.call("POST", `/law/modules/${id}/nodes/${node.id}/report`, { token: b.token, body: { note: "ملاحظة" } })).status).toBe(404);
    for (let i = 0; i < 25; i++) await h.call("POST", `/law/modules/${id}/nodes/${node.id}/report`, { token: a.token, body: { note: `ملاحظة ${i}` } });
    expect(await h.tmp.client.lawNodeReport.count({ where: { userId: a.user.id } })).toBeLessThanOrEqual(20);
  });
});

describe("module setup profile", () => {
  async function moduleOf(u) { return (await list(u)).body.modules[0].id; }

  test("defaults, then the four wizard answers persist", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    const d = await h.call("GET", `/law/modules/${id}/profile`, { token: a.token });
    expect(d.body.profile).toEqual({ hasPolycopie: null, strategy: null, viewStyle: "reader", depth: "concise", sessionsAttended: 0, comprehension: null, setupDone: false, formats: [], isPublic: false, color: null, examConfig: null, sourceMix: null });
    const put = await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { hasPolycopie: true, strategy: "per_lecture", viewStyle: "tree", depth: "detailed", setupDone: true } });
    expect(put.body.profile).toEqual({ hasPolycopie: true, strategy: "per_lecture", viewStyle: "tree", depth: "detailed", sessionsAttended: 0, comprehension: null, setupDone: true, formats: [], isPublic: false, color: null, examConfig: null, sourceMix: null });
    expect((await h.call("GET", `/law/modules/${id}/profile`, { token: a.token })).body.profile.viewStyle).toBe("tree");
  });

  test("the seven learning formats persist in the student's order, per module, and show in the module list", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    const put = await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { formats: ["tree", "detailed", "qa"] } });
    expect(put.body.profile.formats).toEqual(["tree", "detailed", "qa"]);
    const mods = (await list(a)).body.modules;
    expect(mods.find((m) => m.id === id).formats).toEqual(["tree", "detailed", "qa"]);
    expect(mods.filter((m) => m.id !== id).every((m) => Array.isArray(m.formats) && m.formats.length === 0)).toBe(true);
    for (const all of [["tree", "table", "full", "brief", "detailed", "cards", "qa"], []]) {
      expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { formats: all } })).body.profile.formats).toEqual(all);
    }
  });

  test("formats reject unknown, duplicate, non-array and oversized lists", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    for (const formats of [["poem"], ["tree", "tree"], "tree", null, ["tree", "table", "full", "brief", "detailed", "cards", "qa", "tree"], [1]]) {
      expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { formats } })).status).toBe(400);
    }
  });

  test("another student never sees my formats", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const id = await moduleOf(a);
    await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { formats: ["cards"] } });
    const theirs = (await list(b)).body.modules.find((m) => m.id === id);
    if (theirs) expect(theirs.formats).toEqual([]);
  });

  test("the three detail levels are accepted (concise, detailed, verbatim) and nothing else", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    for (const depth of ["concise", "detailed", "verbatim"]) {
      const r = await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { depth } });
      expect(r.body.profile.depth).toBe(depth);
    }
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { depth: "huge" } })).status).toBe(400);
  });

  test("every learning angle is an accepted view style (trail, tree, tables, graph, cards, plus reader and axes) and nothing else", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    for (const viewStyle of ["trail", "tree", "tables", "graph", "cards", "reader", "axes"]) {
      expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { viewStyle } })).body.profile.viewStyle).toBe(viewStyle);
    }
    for (const viewStyle of ["list", "", null, 3]) expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { viewStyle } })).status).toBe(400);
  });

  test("a later change of view style keeps the other answers", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { strategy: "full_course", depth: "detailed", setupDone: true } });
    const r = await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body: { viewStyle: "axes" } });
    expect(r.body.profile).toMatchObject({ strategy: "full_course", depth: "detailed", viewStyle: "axes", setupDone: true });
  });

  test("rejects values outside the allowed lists", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = await moduleOf(a);
    for (const body of [{ viewStyle: "grid" }, { depth: "huge" }, { strategy: "cram" }, { hasPolycopie: "yes" }]) expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: a.token, body })).status).toBe(400);
  });

  test("another student's module is 404, and profiles are per student", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const id = await moduleOf(a);
    expect((await h.call("GET", `/law/modules/${id}/profile`, { token: b.token })).status).toBe(404);
    expect((await h.call("PUT", `/law/modules/${id}/profile`, { token: b.token, body: { depth: "detailed" } })).status).toBe(404);
  });
});

describe("professor card", () => {
  test("saved per student and module, validated, and invisible to others", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const id = (await list(a)).body.modules[0].id;
    expect((await h.call("GET", `/law/modules/${id}/professor`, { token: a.token })).body.card.name).toBeNull();
    const put = await h.call("PUT", `/law/modules/${id}/professor`, { token: a.token, body: { name: "  د. فلان  ", teachingStyle: "reads_polycopie", attendanceFocus: "strict", examTendency: "cases", examFormat: "case", notes: "يحب التطبيق" } });
    expect(put.body.card).toEqual({ name: "د. فلان", teachingStyle: "reads_polycopie", attendanceFocus: "strict", examTendency: "cases", examFormat: "case", notes: "يحب التطبيق" });
    expect((await h.call("GET", `/law/modules/${id}/professor`, { token: b.token })).status).toBe(404);
    expect(await h.tmp.client.lawProfessorCard.count()).toBe(1);
    const clear = await h.call("PUT", `/law/modules/${id}/professor`, { token: a.token, body: { notes: "", examFormat: null } });
    expect(clear.body.card).toMatchObject({ notes: null, examFormat: null, name: "د. فلان" });
  });

  test("rejects unknown enum values and oversize text", async () => {
    const a = await student("سلمى", "a@example.ma");
    const id = (await list(a)).body.modules[0].id;
    for (const body of [{ teachingStyle: "x" }, { attendanceFocus: "x" }, { examTendency: "x" }, { examFormat: "oral" }, { notes: "x".repeat(2001) }, { name: "x".repeat(121) }, { name: 5 }])
      expect((await h.call("PUT", `/law/modules/${id}/professor`, { token: a.token, body })).status).toBe(400);
  });
});
