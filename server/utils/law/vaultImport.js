// Imports a student's Obsidian-style course vault (one folder per subject, markdown notes) into their own
// subjects: LawCourseModule + content tree (LawModuleNode), setup profile, professor card, and the LawSubject that cards
// and notes hang on (matched to the module by name). Nothing is invented: titles, bodies and plans are the student's
// own text; the only data added here is the professor/schedule/colour table below, supplied by the student.
const fs = require("fs");
const path = require("path");
const { normalize } = require("./arabic");
const { rawDb } = require("./dbClient");
const E = require("./enums");

const BODY_MAX = 19900; // LawModuleNode body limit is 20000
const TITLE_MAX = 190;
const MAX_DEPTH = 6; // LawModuleNode levels 0..5
const MAX_NODES = 1900; // below the model's 2000 cap, so the student keeps room to add their own

/** The S3 private-law subjects, in timetable order. Professor names and schedules come from the student's own cards. */
const S3_SUBJECTS = [
  { folder: "المسؤولية المدنية", title: "المسؤولية المدنية", professor: "ذ. بنقدور (BENKADDOUR)", schedule: "الأربعاء 08:30–10:45 · AMPHI 3", color: "emerald", polycopie: false, strategy: "per_lecture" },
  { folder: "المالية العامة", title: "المالية العامة", professor: "د. شارة / ذ. أشهبار (CHARE / ACHEHBAR)", schedule: "الخميس 13:30–15:45 · AMPHI 14", color: "blue", polycopie: false, strategy: "per_lecture", planFile: "المالية العامة — ACHEHBAR (الخطة).md" },
  { folder: "القانون الجنائي الخاص", title: "القانون الجنائي الخاص", professor: "ذ. اليوسفي (ELYOUSFI)", schedule: null, color: "rose", polycopie: true, strategy: "full_course", planFile: "القانون الجنائي الخاص — ذ- اليوسفي.md" },
  { folder: "القانون الاجتماعي", title: "القانون الاجتماعي", professor: "ذ. الهنتالي (ELHANTALI)", schedule: null, color: "amber", polycopie: false, strategy: "per_lecture", planFile: "القانون الاجتماعي — ELHANTALI (المحاور الـ20).md" },
  { folder: "النشاط الإداري", title: "النشاط الإداري", professor: "ذ. خراط ميمون (KHARRAT MIMOUN)", schedule: "الاثنين 16:00–18:15 · AMPHI 1C", color: "violet", polycopie: false, strategy: "per_lecture", planFile: "النشاط الإداري — KHARRAT MIMOUN (المجزوءة الثانية).md" },
  { folder: "قانون الأسرة", title: "قانون الأسرة", professor: "ذ. بوشركة", schedule: null, color: "orange", polycopie: false, strategy: "per_lecture", planFile: "قانون الأسرة — ذ- بوشركة.md" },
  { folder: "الفرنسية القانونية", title: "الفرنسية القانونية", professor: "فريق اللغة (ÉQUIPE DE LANGUE)", schedule: null, color: "cyan", polycopie: false, strategy: "per_lecture" },
];

const stripFront = (t) => String(t).replace(/^﻿/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
const front = (t) => {
  const m = String(t).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^([A-Za-z_]+):\s*(.*)$/); if (k) out[k[1]] = k[2].trim(); }
  return out;
};
// Leading emoji and decoration are noise in a title, not content.
const cleanTitle = (s) => String(s).replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").replace(/^[\s\p{Extended_Pictographic}️‍#]+/u, "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
const cleanBody = (s) =>
  String(s)
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .split("\n")
    .filter((l) => !/^\s*(⬅️|🏠|🏛️)\s*(رجوع|\[\[)/.test(l)) // vault navigation footers only
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*---\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BODY_MAX);

/**
 * Markdown → heading tree. Headings inside code fences are text. A heading deeper than the model allows is folded into its
 * parent's body as a bold line, so no text is dropped.
 * @returns {{ title: string|null, intro: string, tree: Array<{title, body, children}> }} H1 becomes `title`; H2 starts level 0.
 */
function parseTree(markdown) {
  const text = stripFront(markdown);
  const root = { title: null, body: [], children: [], depth: -2 };
  const stack = [{ node: root, h: 1 }];
  let fence = false;
  let h1 = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) fence = !fence;
    const m = !fence && raw.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (!m) { stack[stack.length - 1].node.body.push(raw); continue; }
    const h = m[1].length;
    const title = cleanTitle(m[2]);
    if (h === 1 && h1 === null) { h1 = title; continue; }
    const depth = h - 2;
    if (!title) continue;
    if (depth >= MAX_DEPTH) { stack[stack.length - 1].node.body.push(`**${title}**`); continue; }
    while (stack.length > 1 && stack[stack.length - 1].h >= h) stack.pop();
    const node = { title, body: [], children: [], depth };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, h });
  }
  const fin = (n) => ({ title: n.title, body: cleanBody(n.body.join("\n")), children: n.children.map(fin) });
  return { title: h1, intro: cleanBody(root.body.join("\n")), tree: root.children.map(fin) };
}

const countNodes = (tree) => tree.reduce((n, t) => n + 1 + countNodes(t.children), 0);
const planOf = (tree, depth = 0) => (depth > 3 ? [] : tree.map((t) => ({ title: t.title, children: planOf(t.children, depth + 1) })));

/** Reads one subject folder of the vault. Missing folders/files are skipped, never invented. */
function readSubject(vaultDir, cfg) {
  const dir = path.join(vaultDir, cfg.folder);
  const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const mdIn = (d) => { try { return fs.readdirSync(d).filter((f) => f.endsWith(".md")).sort(); } catch { return []; } };
  const out = { ...cfg, plan: [], sessions: [], warnings: [] };

  const planPath = cfg.planFile ? path.join(vaultDir, cfg.planFile) : null;
  if (planPath && !exists(planPath)) out.warnings.push(`plan file not found: ${cfg.planFile}`);
  if (planPath && exists(planPath)) {
    const p = parseTree(fs.readFileSync(planPath, "utf8"));
    out.plan = p.tree;
  } else {
    // No plan file: the numbered chapter notes of the subject folder give the plan titles (their quote line is the summary).
    const skip = /(^00 )|(^المحور)|(^فهرس)/;
    for (const f of mdIn(dir)) {
      if (skip.test(f) || f.replace(/\.md$/, "") === cfg.folder) continue;
      const p = parseTree(fs.readFileSync(path.join(dir, f), "utf8"));
      const title = p.title || cleanTitle(f.replace(/\.md$/, ""));
      const quote = (p.intro.split("\n").find((l) => l.startsWith(">")) || "").replace(/^>\s*/, "");
      out.plan.push({ title, body: quote, children: [] });
    }
  }

  const sdir = path.join(dir, "الحصص");
  for (const f of mdIn(sdir)) {
    const raw = fs.readFileSync(path.join(sdir, f), "utf8");
    const fm = front(raw);
    const p = parseTree(raw);
    const m = f.match(/الحصة\s+(\d+)\s+—\s+(.*)\.md$/);
    const label = (fm.session && cleanTitle(fm.session)) || (m ? `الحصة ${m[1]} — ${m[2]}` : cleanTitle(f.replace(/\.md$/, "")));
    out.sessions.push({ title: label, body: p.intro, children: p.tree, date: fm.date || null, file: f });
  }

  const card = path.join(dir, "00 بطاقة المادة.md");
  if (exists(card) && !out.schedule) {
    const row = fs.readFileSync(card, "utf8").split("\n").find((l) => /\*\*التوقيت\*\*/.test(l));
    if (row) out.schedule = cleanBody(row.replace(/\|/g, " ").replace(/\*\*/g, "").replace("التوقيت", "")).trim() || null;
  }
  if (!out.plan.length && !out.sessions.length) out.warnings.push("empty");
  return out;
}

const readVault = (vaultDir, subjects = S3_SUBJECTS) => subjects.map((c) => readSubject(vaultDir, c));

/** Archives the student's leftover test subjects (names the e2e/test runs create). Never deletes: cards stay attached. */
const TEST_SUBJECT = /^مادة (اختبار|العدسات) e2e-\d{10,}$|^مادة خاصة \d{10,}$/;
async function archiveTestSubjects(userId, { dryRun = false } = {}) {
  const rows = await rawDb().lawSubject.findMany({ where: { userId, archived: false }, select: { id: true, name: true } });
  const test = rows.filter((s) => TEST_SUBJECT.test(s.name.trim()));
  if (!dryRun) for (const s of test) await rawDb().lawSubject.update({ where: { id: s.id }, data: { archived: true } });
  return test.map((s) => s.name);
}

/**
 * Writes the subjects for one student. Idempotent and non-destructive:
 *  - an official module of the same name in the student's scope is used instead of making a copy;
 *  - a module that already has content is left alone unless `replace` (nodes are written in one transaction, so a failure
 *    leaves nothing half-written, and a module created by a failed run is removed again);
 *  - setup answers, professor card and subject fields are only filled where still blank: a re-run never overwrites the
 *    student's own edits.
 */
async function importForUser(userId, subjects, { replace = false, semester = "S3", dryRun = false } = {}) {
  const { LawModule } = require("./../../models/lawModule");
  const profile = await rawDb().lawUserProfile.findUnique({ where: { userId } });
  if (!profile) throw new Error("no_profile");
  if (profile.semester && profile.semester !== semester) throw new Error(`the account is in ${profile.semester}, not ${semester}: Learn would not show these subjects`);
  const scope = { facultyCode: profile.facultyCode || "FSJES_AIN_CHOCK", track: profile.track || "PRIVE", language: profile.studyLang || "AR", semester };
  const report = { scope, modules: [], archived: [], warnings: subjects.flatMap((s) => s.warnings.map((w) => `${s.title}: ${w}`)) };
  const size = (s) => countNodes(s.plan) + s.sessions.reduce((n, x) => n + 1 + countNodes(x.children), 0);
  for (const s of subjects) if (size(s) > MAX_NODES) throw new Error(`${s.title}: too many nodes (${size(s)})`); // before any write or delete
  if (dryRun) {
    report.modules = subjects.map((s) => ({ title: s.title, nodes: size(s), sessions: s.sessions.length }));
    report.archived = await archiveTestSubjects(userId, { dryRun: true });
    return report;
  }
  // The academic scope is what the module list is keyed on; only blanks are filled, a chosen value is never overwritten.
  await rawDb().lawUserProfile.update({ where: { userId }, data: { facultyCode: scope.facultyCode, track: scope.track, studyLang: scope.language } });
  // Seeding the default list would add subjects the student does not study: mark it as done for this scope.
  const curricula = require("./curricula");
  const cur = curricula.find(scope);
  if (cur) await rawDb().lawCurriculumSeed.upsert({ where: { userId_key: { userId, key: cur.key } }, create: { userId, key: cur.key }, update: {} });

  for (const s of subjects) {
    const official = await rawDb().lawCourseModule.findMany({ where: { ownerId: null, semester, facultyCode: scope.facultyCode, track: scope.track, language: scope.language } });
    const mine = await rawDb().lawCourseModule.findMany({ where: { ownerId: userId, semester } });
    // An official module is reused only when it is in this student's own list (Learn and the path show that list); otherwise
    // the content would sit on a module they never see.
    const { LawPath } = require("./../../models/lawPath");
    const listed = new Set(((await LawPath.modules(userId, semester)).modules || []).map((m) => m.id));
    const seen = official.filter((m) => listed.has(m.id) && normalize(m.title) === normalize(s.title));
    let mod = [...mine, ...seen].find((m) => normalize(m.title) === normalize(s.title));
    let created = false;
    if (!mod) {
      const r = await LawModule.addCustom(userId, scope, semester, s.title);
      if (r.error) throw new Error(`${s.title}: ${r.error}`);
      mod = await rawDb().lawCourseModule.findUnique({ where: { id: r.module.id } });
      created = true;
    }
    const entry = { title: s.title, moduleId: mod.id, official: mod.ownerId == null, created, nodes: 0, skipped: false };
    try {
      const have = await rawDb().lawModuleNode.count({ where: { userId, moduleId: mod.id } });
      if (have && !replace) entry.skipped = true;
      else entry.nodes = await writeNodes(userId, mod.id, s, { replace: have > 0 });
      await fillSetup(userId, mod.id, s);
      await linkSubject(userId, mod.id, s, semester);
    } catch (e) {
      if (created) await rawDb().lawCourseModule.delete({ where: { id: mod.id } }).catch(() => {}); // cascade: nothing half-written stays
      e.report = report;
      throw e;
    }
    report.modules.push(entry);
  }
  report.archived = await archiveTestSubjects(userId);
  return report;
}

/** All nodes of one module in one transaction (parents first); replaces the previous content only when `replace`. */
async function writeNodes(userId, moduleId, s, { replace }) {
  const roots = [...s.plan, ...s.sessions.map((x) => ({ title: x.title, body: x.body, children: x.children }))];
  let n = 0;
  await rawDb().$transaction(async (tx) => {
    if (replace) await tx.lawModuleNode.deleteMany({ where: { userId, moduleId } });
    const put = async (node, parentId, level, ord) => {
      const row = await tx.lawModuleNode.create({ data: { userId, moduleId, parentId, level, kind: level === 0 ? "lecture" : "section", title: node.title, body: node.body || "", ord } });
      n++;
      let i = 0;
      for (const c of node.children || []) await put(c, row.id, level + 1, i++);
    };
    let i = 0;
    for (const r of roots) await put(r, null, 0, i++);
  }, { maxWait: 30000, timeout: 120000 });
  return n;
}

/** Setup answers and professor card, written only where the student has not already set them. */
async function fillSetup(userId, moduleId, s) {
  const { LawModule } = require("./../../models/lawModule");
  const cur = (await LawModule.getProfile(userId, moduleId)).profile;
  if (!cur.setupDone) {
    const prof = await LawModule.saveProfile(userId, moduleId, { hasPolycopie: !!s.polycopie, strategy: s.strategy, viewStyle: "reader", depth: "detailed", sessionsAttended: s.sessions.length, setupDone: true });
    if (prof.error) throw new Error(`${s.title}: profile ${prof.error}`);
  }
  if (!cur.color) {
    const col = await LawModule.saveProfile(userId, moduleId, { color: s.color });
    if (col.error) throw new Error(`${s.title}: colour ${col.error}`);
  }
  const card = (await LawModule.getProfessor(userId, moduleId)).card;
  const patch = {};
  if (!card.name) patch.name = s.professor;
  if (!card.notes && s.schedule) patch.notes = s.schedule;
  if (Object.keys(patch).length) {
    const r = await LawModule.saveProfessor(userId, moduleId, patch);
    if (r.error) throw new Error(`${s.title}: professor ${r.error}`);
  }
}

/** The student's LawSubject (cards, notes, plan) is matched to the module by name; created once, blanks filled. */
async function linkSubject(userId, moduleId, s, semester) {
  const subs = await rawDb().lawSubject.findMany({ where: { userId, archived: false } });
  let subject = subs.find((x) => normalize(x.name) === normalize(s.title));
  const plan = planOf(s.plan.length ? s.plan : s.sessions.map((x) => ({ title: x.title, children: planOf(x.children, 1) })));
  if (!subject) subject = await rawDb().lawSubject.create({ data: { userId, name: s.title, semester, professorName: s.professor, coursePlan: JSON.stringify(plan), color: "#0f2a3f" } });
  else {
    const data = {};
    if (!subject.professorName) data.professorName = s.professor;
    if (!subject.coursePlan) data.coursePlan = JSON.stringify(plan);
    if (Object.keys(data).length) await rawDb().lawSubject.update({ where: { id: subject.id }, data });
  }
  await rawDb().lawModuleProfile.update({ where: { userId_moduleId: { userId, moduleId } }, data: { subjectId: subject.id } });
}

module.exports = { S3_SUBJECTS, parseTree, readSubject, readVault, importForUser, archiveTestSubjects, countNodes, planOf, cleanBody, cleanTitle };
