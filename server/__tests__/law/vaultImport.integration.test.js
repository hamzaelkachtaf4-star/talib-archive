// Course-vault import: heading tree parsing and the write into a student's own subjects (module, nodes, profile, professor, subject).
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startHarness } = require("../../utils/law/testing/harness");
const V = require("../../utils/law/vaultImport");

jest.setTimeout(90000);
let h;
let dir;
beforeEach(async () => {
  h = await startHarness();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
});
afterEach(async () => {
  await h.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (rel, text) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

const PLAN = `---
tags: [x]
---

# قانون تجريبي — ذ/ مثال

## الدرس 01 — مدخل
نص تمهيدي مع [[رابط داخلي|وصف]] وإحالة [[أخرى]].

### المطلب الأول: التعريف
• نقطة أولى.

\`\`\`
# هذا ليس عنواناً
## ولا هذا
\`\`\`

#### الفرع الأول
نص الفرع.

## الدرس 02 — خاتمة

---
⬅️ رجوع للفهرس: [[فهرس]]
`;
const SESSION = `---
date: 2026-10-07
session: الحصة 01 — المدخل
---

# 🏛️ المحاضرة الأولى

نص المقدمة.

## 📌 المبحث الأول
فقرة.

### المطلب الأول
تفصيل.
`;
const CARD = `# 📇 بطاقة المادة

| | |
|---|---|
| **الأستاذ** | EXAMPLE |
| **التوقيت** | الأربعاء 08H30–10H45 · AMPHI 3 |
`;
const CFG = [{ folder: "مادة تجريبية", title: "مادة تجريبية", professor: "ذ. مثال (EXAMPLE)", schedule: null, color: "violet", polycopie: true, strategy: "full_course", planFile: "مادة تجريبية — ذ- مثال.md" }];
const seedVault = () => {
  write("مادة تجريبية — ذ- مثال.md", PLAN);
  write("مادة تجريبية/الحصص/الحصة 01 — الأربعاء 07-10-2026.md", SESSION);
  write("مادة تجريبية/00 بطاقة المادة.md", CARD);
};
async function student(scope = { facultyCode: null, track: null, studyLang: null, semester: "S3" }) {
  const u = await h.signUp("طيب", "t@example.ma");
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: scope });
  return u;
}

describe("parseTree", () => {
  test("headings become a tree; fences, wikilinks and navigation footers are handled", () => {
    const t = V.parseTree(PLAN);
    expect(t.title).toBe("قانون تجريبي — ذ/ مثال");
    expect(t.tree.map((n) => n.title)).toEqual(["الدرس 01 — مدخل", "الدرس 02 — خاتمة"]);
    const lesson = t.tree[0];
    expect(lesson.body).toBe("نص تمهيدي مع وصف وإحالة أخرى.");
    expect(lesson.children[0].title).toBe("المطلب الأول: التعريف");
    expect(lesson.children[0].body).toContain("# هذا ليس عنواناً"); // a '#' line inside a fence is text
    expect(lesson.children[0].children[0].title).toBe("الفرع الأول");
    expect(t.tree[1].body).not.toContain("رجوع");
  });
  test("a heading deeper than the model allows is folded into its parent's body, nothing is lost", () => {
    const deep = "# T\n## A\n### B\n#### C\n##### D\n###### E\n####### F\nبعد\n";
    const t = V.parseTree(deep);
    const a = t.tree[0].children[0].children[0].children[0].children[0]; // A > B > C > D > E (levels 0..4)
    expect(a.title).toBe("E");
    expect(V.countNodes(t.tree)).toBe(5);
  });
  test("bodies are capped under the node limit and titles cleaned of leading emoji", () => {
    const t = V.parseTree(`# x\n## 📌 عنوان\n${"ا".repeat(25000)}\n`);
    expect(t.tree[0].title).toBe("عنوان");
    expect(t.tree[0].body.length).toBeLessThanOrEqual(19900);
  });
});

describe("readSubject", () => {
  test("reads plan, sessions (title from front matter) and the schedule from the card", () => {
    seedVault();
    const s = V.readSubject(dir, CFG[0]);
    expect(s.plan.map((n) => n.title)).toEqual(["الدرس 01 — مدخل", "الدرس 02 — خاتمة"]);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].title).toBe("الحصة 01 — المدخل");
    expect(s.sessions[0].children.map((c) => c.title)).toEqual(["المبحث الأول"]);
    expect(s.schedule).toMatch(/الأربعاء/);
  });
  test("a missing folder is reported empty, never invented", () => {
    const s = V.readSubject(dir, CFG[0]);
    expect(s.plan).toEqual([]);
    expect(s.sessions).toEqual([]);
    expect(s.warnings).toContain("empty");
  });
  test("without a plan file the numbered chapter notes of the folder give the plan titles", () => {
    write("مادة تجريبية/مادة تجريبية — 01: الأول.md", "# 📂 مادة تجريبية — 01: الأول\n\n> ملخص الفصل\n");
    write("مادة تجريبية/00 بطاقة المادة.md", CARD);
    const s = V.readSubject(dir, { ...CFG[0], planFile: null });
    expect(s.plan).toEqual([{ title: "مادة تجريبية — 01: الأول", body: "ملخص الفصل", children: [] }]);
  });
});

describe("importForUser", () => {
  test("creates the module, the content tree, the setup answers, the professor card and the linked subject", async () => {
    seedVault();
    const a = await student();
    const subjects = V.readVault(dir, CFG);
    const rep = await V.importForUser(a.user.id, subjects);
    expect(rep.modules).toHaveLength(1);
    const mods = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules;
    expect(mods.map((m) => m.title)).toEqual(["مادة تجريبية"]); // the default list was not seeded next to it
    expect(mods[0]).toMatchObject({ owned: true, color: "violet", isPublic: false, formats: [] });
    const id = mods[0].id;
    const tree = (await h.call("GET", `/law/modules/${id}/tree`, { token: a.token })).body.nodes;
    expect(tree.filter((n) => n.parentId === null).map((n) => n.title)).toEqual(["الدرس 01 — مدخل", "الدرس 02 — خاتمة", "الحصة 01 — المدخل"]);
    const lesson = tree.find((n) => n.title === "الدرس 01 — مدخل");
    const mutlab = tree.find((n) => n.parentId === lesson.id);
    expect(mutlab).toMatchObject({ title: "المطلب الأول: التعريف", level: 1 });
    expect(tree.find((n) => n.parentId === mutlab.id).title).toBe("الفرع الأول");
    const profile = (await h.call("GET", `/law/modules/${id}/profile`, { token: a.token })).body.profile;
    expect(profile).toMatchObject({ hasPolycopie: true, strategy: "full_course", depth: "detailed", sessionsAttended: 1, setupDone: true });
    const prof = (await h.call("GET", `/law/modules/${id}/professor`, { token: a.token })).body.card;
    expect(prof).toMatchObject({ name: "ذ. مثال (EXAMPLE)", notes: expect.stringContaining("AMPHI 3") });
    const subj = await h.tmp.client.lawSubject.findFirst({ where: { userId: a.user.id } });
    expect(subj).toMatchObject({ name: "مادة تجريبية", professorName: "ذ. مثال (EXAMPLE)", semester: "S3" });
    expect(JSON.parse(subj.coursePlan)[0]).toMatchObject({ title: "الدرس 01 — مدخل" });
    const link = await h.tmp.client.lawModuleProfile.findFirst({ where: { userId: a.user.id, moduleId: id } });
    expect(link.subjectId).toBe(subj.id);
  });

  test("fills a missing academic scope but never overwrites a chosen one", async () => {
    seedVault();
    const blank = await student();
    await V.importForUser(blank.user.id, V.readVault(dir, CFG));
    const p = await h.tmp.client.lawUserProfile.findUnique({ where: { userId: blank.user.id } });
    expect(p).toMatchObject({ facultyCode: "FSJES_AIN_CHOCK", track: "PRIVE", studyLang: "AR" });
    const other = await h.signUp("سلمى", "s@example.ma");
    await h.tmp.client.lawUserProfile.update({ where: { userId: other.user.id }, data: { facultyCode: "FSJES_SALE", track: "PUBLIC", studyLang: "FR", semester: "S3" } });
    await V.importForUser(other.user.id, V.readVault(dir, CFG));
    expect(await h.tmp.client.lawUserProfile.findUnique({ where: { userId: other.user.id } })).toMatchObject({ facultyCode: "FSJES_SALE", track: "PUBLIC", studyLang: "FR" });
  });

  test("idempotent: a second run adds no module, node or subject; a hand-edited module is left alone unless replace", async () => {
    seedVault();
    const a = await student();
    const subjects = V.readVault(dir, CFG);
    await V.importForUser(a.user.id, subjects);
    const counts = async () => [await h.tmp.client.lawCourseModule.count({ where: { ownerId: a.user.id } }), await h.tmp.client.lawModuleNode.count({ where: { userId: a.user.id } }), await h.tmp.client.lawSubject.count({ where: { userId: a.user.id } })];
    const first = await counts();
    const again = await V.importForUser(a.user.id, subjects);
    expect(await counts()).toEqual(first);
    expect(again.modules[0].skipped).toBe(true);
    const node = await h.tmp.client.lawModuleNode.findFirst({ where: { userId: a.user.id, title: "الدرس 02 — خاتمة" } });
    await h.tmp.client.lawModuleNode.update({ where: { id: node.id }, data: { body: "تعديلي" } });
    await V.importForUser(a.user.id, subjects);
    expect((await h.tmp.client.lawModuleNode.findUnique({ where: { id: node.id } })).body).toBe("تعديلي");
    await V.importForUser(a.user.id, subjects, { replace: true });
    expect((await counts())[1]).toBe(first[1]);
    expect(await h.tmp.client.lawModuleNode.count({ where: { userId: a.user.id, body: "تعديلي" } })).toBe(0);
  });

  test("a re-run never overwrites the student's own colour, professor notes, setup answers or subject fields", async () => {
    seedVault();
    const a = await student();
    const subjects = V.readVault(dir, CFG);
    await V.importForUser(a.user.id, subjects);
    const m = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules[0];
    await h.call("PUT", `/law/modules/${m.id}/profile`, { token: a.token, body: { color: "rose", depth: "concise", strategy: "per_lecture", hasPolycopie: false, formats: ["tree", "qa"] } });
    await h.call("PUT", `/law/modules/${m.id}/professor`, { token: a.token, body: { name: "اسم عدّلته", notes: "ملاحظاتي الخاصة عن الأستاذ" } });
    await h.tmp.client.lawSubject.updateMany({ where: { userId: a.user.id }, data: { professorName: "اسم مادة عدّلته" } });
    await V.importForUser(a.user.id, subjects);
    await V.importForUser(a.user.id, subjects, { replace: true });
    const prof = (await h.call("GET", `/law/modules/${m.id}/profile`, { token: a.token })).body.profile;
    expect(prof).toMatchObject({ color: "rose", depth: "concise", strategy: "per_lecture", hasPolycopie: false, formats: ["tree", "qa"] });
    const card = (await h.call("GET", `/law/modules/${m.id}/professor`, { token: a.token })).body.card;
    expect(card).toMatchObject({ name: "اسم عدّلته", notes: "ملاحظاتي الخاصة عن الأستاذ" });
    expect((await h.tmp.client.lawSubject.findFirst({ where: { userId: a.user.id } })).professorName).toBe("اسم مادة عدّلته");
  });

  test("an official module this student cannot see is not used: their own copy is made, so the content is never lost", async () => {
    seedVault();
    const a = await student({ facultyCode: "FSJES_AIN_CHOCK", track: "PRIVE", studyLang: "AR", semester: "S3" });
    const off = await h.tmp.client.lawCourseModule.create({ data: { facultyCode: "FSJES_AIN_CHOCK", semester: "S3", track: "PRIVE", language: "AR", parcours: "official", ordinal: 1, title: "مادة تجريبية" } });
    const rep = await V.importForUser(a.user.id, V.readVault(dir, CFG));
    expect(rep.modules[0]).toMatchObject({ official: false, created: true });
    expect(rep.modules[0].moduleId).not.toBe(off.id);
    const mods = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules.filter((m) => m.title === "مادة تجريبية");
    expect(mods).toHaveLength(1);
    expect(await h.tmp.client.lawModuleNode.count({ where: { userId: a.user.id, moduleId: off.id } })).toBe(0);
  });

  test("a failure while writing nodes leaves nothing half-written: the module made by that run is removed", async () => {
    seedVault();
    const a = await student();
    const subjects = V.readVault(dir, CFG);
    subjects[0].sessions[0].children.push({ title: null, body: "", children: [] }); // the database refuses a node without a title
    await expect(V.importForUser(a.user.id, subjects)).rejects.toThrow();
    expect(await h.tmp.client.lawCourseModule.count({ where: { ownerId: a.user.id } })).toBe(0);
    expect(await h.tmp.client.lawModuleNode.count({ where: { userId: a.user.id } })).toBe(0);
    // a later run with good data works from a clean state
    const ok = await V.importForUser(a.user.id, V.readVault(dir, CFG));
    expect(ok.modules[0].skipped).toBe(false);
  });

  test("too many nodes stops before any write or delete, even with replace", async () => {
    seedVault();
    const a = await student();
    await V.importForUser(a.user.id, V.readVault(dir, CFG));
    const before = await h.tmp.client.lawModuleNode.count({ where: { userId: a.user.id } });
    const big = V.readVault(dir, CFG);
    big[0].plan = Array.from({ length: 1950 }, (_, i) => ({ title: `n${i}`, body: "", children: [] }));
    await expect(V.importForUser(a.user.id, big, { replace: true })).rejects.toThrow(/too many nodes/);
    expect(await h.tmp.client.lawModuleNode.count({ where: { userId: a.user.id } })).toBe(before);
  });

  test("an account in another semester is refused (Learn would not show the subjects)", async () => {
    seedVault();
    const a = await student({ facultyCode: null, track: null, studyLang: null, semester: "S5" });
    await expect(V.importForUser(a.user.id, V.readVault(dir, CFG))).rejects.toThrow(/S5/);
    expect(await h.tmp.client.lawCourseModule.count({ where: { ownerId: a.user.id } })).toBe(0);
  });

  test("a missing plan file is a warning in the report", async () => {
    write("مادة تجريبية/00 بطاقة المادة.md", CARD);
    const a = await student();
    const rep = await V.importForUser(a.user.id, V.readVault(dir, CFG), { dryRun: true });
    expect(rep.warnings.join()).toMatch(/plan file not found/);
  });

  test("leftover test subjects are archived, not deleted, and real ones are untouched", async () => {
    seedVault();
    const a = await student();
    const mk = (name) => h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name } });
    const t1 = await mk("مادة اختبار e2e-1791600578665");
    const t2 = await mk("مادة العدسات e2e-1791613206241");
    const real = await mk("مادة حقيقية للطالب");
    await h.tmp.client.lawFlashcard.create({ data: { userId: a.user.id, subjectId: t1.id, front: "س", back: "ج", dueDate: new Date() } }).catch(() => null);
    const real2 = await mk("اختبار الالتزامات"); // an ordinary word in a real subject name must not match
    expect((await V.importForUser(a.user.id, V.readVault(dir, CFG), { dryRun: true })).archived.sort()).toEqual([t1.name, t2.name].sort()); // preview lists, writes nothing
    expect((await h.tmp.client.lawSubject.findUnique({ where: { id: t1.id } })).archived).toBe(false);
    const rep = await V.importForUser(a.user.id, V.readVault(dir, CFG));
    expect((await h.tmp.client.lawSubject.findUnique({ where: { id: real2.id } })).archived).toBe(false);
    expect(rep.archived.sort()).toEqual([t1.name, t2.name].sort());
    expect((await h.tmp.client.lawSubject.findUnique({ where: { id: t1.id } })).archived).toBe(true);
    expect((await h.tmp.client.lawSubject.findUnique({ where: { id: real.id } })).archived).toBe(false);
    expect(await h.tmp.client.lawSubject.count({ where: { id: { in: [t1.id, t2.id] } } })).toBe(2);
  });

  test("another student is never touched", async () => {
    seedVault();
    const a = await student();
    const b = await h.signUp("سلمى", "s@example.ma");
    await V.importForUser(a.user.id, V.readVault(dir, CFG));
    expect(await h.tmp.client.lawCourseModule.count({ where: { ownerId: b.user.id } })).toBe(0);
    expect(await h.tmp.client.lawSubject.count({ where: { userId: b.user.id } })).toBe(0);
  });

  test("dry run writes nothing", async () => {
    seedVault();
    const a = await student();
    const rep = await V.importForUser(a.user.id, V.readVault(dir, CFG), { dryRun: true });
    expect(rep.modules[0]).toMatchObject({ title: "مادة تجريبية", sessions: 1 });
    expect(await h.tmp.client.lawCourseModule.count({ where: { ownerId: a.user.id } })).toBe(0);
  });
});
