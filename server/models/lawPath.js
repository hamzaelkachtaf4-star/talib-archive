// Phase 9: course path. Modules come from the PUBLISHED official timetable (one per distinct subject of a faculty /
// semester / track / language / parcours): no curriculum is invented, and a semester with no published timetable is
// an empty state ("an admin must define modules"). Nodes are a structural scaffold; an admin may replace them.
const { rawDb } = require("../utils/law/dbClient");
const { normalize } = require("../utils/law/arabic");
const { localDate } = require("../utils/law/time");
const { LawCorpus } = require("./lawCorpus");

const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const KINDS = ["LESSON", "PRACTICE", "METHOD", "CHECKPOINT", "BOSS"];
const MAX_PINS = 5;
const XP_NODES_PER_DAY = 6;
const MASTERED_STABILITY_DAYS = 21;

// Default scaffold: linear prerequisites, so each checkpoint gates the next section.
const SCAFFOLD = [
  { section: "الأساسيات", nodes: [["LESSON", "فهم القواعد الأساسية"], ["PRACTICE", "بطاقات المراجعة"], ["CHECKPOINT", "تقييم الأساسيات"]] },
  { section: "التطبيق", nodes: [["LESSON", "التعمق والنصوص القانونية"], ["METHOD", "منهجية التطبيق"], ["PRACTICE", "مراجعة مركزة"], ["CHECKPOINT", "تقييم التطبيق"]] },
  { section: "الإتقان", nodes: [["LESSON", "مراجعة شاملة"], ["BOSS", "محاكاة الامتحان النهائي للمادة"]] },
];

const parseJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

async function scopeOf(userId) {
  const p = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { facultyCode: true, track: true, studyLang: true } });
  if (!p?.facultyCode || !p.track || !p.studyLang) return null;
  const sub = await rawDb().lawTimetableSubscription.findUnique({ where: { userId } });
  return { facultyCode: p.facultyCode, track: p.track, language: p.studyLang, sub };
}

function crownsFor(cards) {
  if (!cards.length) return 0;
  const mastered = cards.filter((c) => c.state === "review" && c.stability >= MASTERED_STABILITY_DAYS).length / cards.length;
  return mastered >= 0.85 ? 3 : mastered >= 0.6 ? 2 : mastered >= 0.3 ? 1 : 0;
}

/** Concept ids behind the student's ACTIVE / IMPROVING memories (concept-level and both sides of a pair). */
async function weakConceptIds(userId) {
  const prefs = await rawDb().lawUserPreferences.findUnique({ where: { userId }, select: { memoryEnabled: true } });
  if (prefs && !prefs.memoryEnabled) return new Set();
  const ms = await rawDb().lawLearnerMemory.findMany({ where: { userId, status: { in: ["ACTIVE", "IMPROVING"] } }, select: { conceptId: true, confusionPairId: true } });
  const out = new Set(ms.map((x) => x.conceptId).filter(Boolean));
  const pairs = await rawDb().lawConfusionPair.findMany({ where: { id: { in: ms.map((x) => x.confusionPairId).filter(Boolean) } } });
  for (const p of pairs) { out.add(p.conceptAId); out.add(p.conceptBId); }
  return out;
}

const LawPath = {
  SEMESTERS, KINDS, SCAFFOLD,

  /** Creates the modules (and scaffold nodes) of a scope from its published timetable, once. */
  ensureModules: async function ({ facultyCode, semester, track, language, parcours = "" }) {
    const db = rawDb();
    const have = await db.lawCourseModule.findMany({ where: { facultyCode, semester, track, language, parcours }, orderBy: { ordinal: "asc" } });
    if (have.length) return have;
    const sessions = await db.lawFdcSession.findMany({ where: { facultyCode, semester, track, language, parcours, published: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] });
    const titles = [...new Map(sessions.map((s) => [normalize(s.subject), s.subject])).values()];
    const out = [];
    for (const [i, title] of titles.entries()) {
      try {
        const m = await db.lawCourseModule.create({ data: { facultyCode, semester, track, language, parcours, ordinal: i + 1, title } });
        await this.writeScaffold(m.id);
        out.push(m);
      } catch (e) {
        if (e.code !== "P2002") throw e; // a concurrent request created it first
      }
    }
    return out.length ? out : db.lawCourseModule.findMany({ where: { facultyCode, semester, track, language, parcours }, orderBy: { ordinal: "asc" } });
  },

  writeScaffold: async function (moduleId, db = rawDb()) {
    let prev = null;
    let ordinal = 0;
    for (const sec of SCAFFOLD)
      for (const [kind, title] of sec.nodes) {
        const n = await db.lawPathNode.create({ data: { moduleId, kind, title, section: sec.section, ordinal: ++ordinal, prereqIds: JSON.stringify(prev ? [prev] : []) } });
        prev = n.id;
      }
  },

  /** The modules a student sees for ONE semester (never another semester's), with progress. */
  modules: async function (userId, semester) {
    if (!SEMESTERS.includes(semester)) return { error: "invalid_semester" };
    const sc = await scopeOf(userId);
    if (!sc) return { error: "academic_profile_required", status: 409 };
    const parcours = sc.sub && sc.sub.semester === semester && sc.sub.facultyCode === sc.facultyCode ? sc.sub.parcours : "";
    let mods = await this.ensureModules({ facultyCode: sc.facultyCode, semester, track: sc.track, language: sc.language, parcours: "" });
    if (parcours) mods = mods.concat(await this.ensureModules({ facultyCode: sc.facultyCode, semester, track: sc.track, language: sc.language, parcours }));
    if (!mods.length && parcours === "") {
      // S5-style semesters only have parcours variants: offer them all
      const all = await rawDb().lawFdcSession.findMany({ where: { facultyCode: sc.facultyCode, semester, track: sc.track, language: sc.language, published: true, NOT: { parcours: "" } }, select: { parcours: true }, distinct: ["parcours"] });
      for (const a of all) mods = mods.concat(await this.ensureModules({ facultyCode: sc.facultyCode, semester, track: sc.track, language: sc.language, parcours: a.parcours }));
    }
    return { semester, modules: await this.summarize(userId, mods), error: null };
  },

  /** Progress counts for a list of modules (shared or the student's own). */
  summarize: async function (userId, mods) {
    const nodes = await rawDb().lawPathNode.findMany({ where: { moduleId: { in: mods.map((m) => m.id) } }, select: { id: true, moduleId: true } });
    const done = await rawDb().lawNodeProgress.findMany({ where: { userId, state: "COMPLETED", nodeId: { in: nodes.map((n) => n.id) } }, select: { nodeId: true } });
    const doneSet = new Set(done.map((d) => d.nodeId));
    return mods.map((m) => {
      const mine = nodes.filter((n) => n.moduleId === m.id);
      const owned = m.ownerId != null;
      return { id: m.id, ordinal: m.ordinal, title: m.title, parcours: owned ? "" : m.parcours, total: mine.length, completed: mine.filter((n) => doneSet.has(n.id)).length, owned, source: m.source, verified: m.verified };
    });
  },

  /** A module is visible to a student only inside their own faculty / track / language. */
  _moduleFor: async function (userId, moduleId) {
    const sc = await scopeOf(userId);
    if (!sc) return null;
    const m = await rawDb().lawCourseModule.findUnique({ where: { id: String(moduleId || "") }, include: { nodes: { orderBy: { ordinal: "asc" } } } });
    if (!m) return null;
    // A student's own module (RC3) belongs to its owner whatever their academic profile says today (a later change of
    // faculty, track or language must not lock them out); a shared module is visible inside its own scope only.
    if (m.ownerId != null) return m.ownerId === userId ? m : null;
    return m.facultyCode === sc.facultyCode && m.track === sc.track && m.language === sc.language ? m : null;
  },

  _states: (nodes, progress) => {
    const done = new Set(progress.filter((p) => p.state === "COMPLETED").map((p) => p.nodeId));
    const started = new Set(progress.filter((p) => p.state === "IN_PROGRESS").map((p) => p.nodeId));
    return new Map(nodes.map((n) => {
      const pre = parseJson(n.prereqIds, []);
      const unlocked = pre.every((id) => done.has(id));
      return [n.id, done.has(n.id) ? "COMPLETED" : !unlocked ? "LOCKED" : started.has(n.id) ? "IN_PROGRESS" : "AVAILABLE"];
    }));
  },

  graph: async function (userId, moduleId) {
    const m = await this._moduleFor(userId, moduleId);
    if (!m) return { error: "not_found" };
    const progress = await rawDb().lawNodeProgress.findMany({ where: { userId, nodeId: { in: m.nodes.map((n) => n.id) } } });
    const states = this._states(m.nodes, progress);
    const pins = await rawDb().lawPathPin.findMany({ where: { userId, nodeId: { in: m.nodes.map((n) => n.id) } } });
    const notes = await rawDb().lawMasterNote.findMany({ where: { id: { in: pins.map((p) => p.noteId) }, visibility: "public", moderationStatus: "ACTIVE" }, select: { id: true, title: true } });
    const noteBy = new Map(notes.map((n) => [n.id, n]));
    // the student's own subject for this module (by name) -> crowns and the FSRS practice link
    const key = normalize(m.title);
    const subjects = await rawDb().lawSubject.findMany({ where: { userId, archived: false }, select: { id: true, name: true } });
    const subject = subjects.find((s) => normalize(s.name) === key) || subjects.find((s) => normalize(s.name).includes(key) || key.includes(normalize(s.name))) || null;
    const cards = subject ? await rawDb().lawFlashcard.findMany({ where: { userId, subjectId: subject.id, deletedAt: null, suspended: false }, select: { state: true, stability: true } }) : [];
    const refs = m.nodes.flatMap((n) => parseJson(n.legalRefs, []));
    const resolved = refs.length ? await LawCorpus.resolve(refs.map((r) => `${r.slug}:${r.number}`)) : {};
    const nodes = m.nodes.map((n) => ({
      id: n.id, kind: n.kind, title: n.title, section: n.section, ordinal: n.ordinal,
      state: states.get(n.id),
      prereqIds: parseJson(n.prereqIds, []),
      legalRefs: parseJson(n.legalRefs, []).map((r) => ({ ...r, canonicalId: `${r.slug}:${r.number}`, exists: !!resolved[`${r.slug}:${r.number}`]?.exists })),
      pins: pins.filter((p) => p.nodeId === n.id && noteBy.has(p.noteId)).map((p) => ({ noteId: p.noteId, title: noteBy.get(p.noteId).title })),
      practice: n.kind === "PRACTICE" && subject ? { subjectId: subject.id } : null,
    }));
    // Phase 10: nodes teaching a concept the student is currently weak on get a flag (drill link in the UI)
    const weak = await weakConceptIds(userId);
    for (const n of nodes) n.weak = parseJson(m.nodes.find((x) => x.id === n.id).conceptIds, []).some((c) => weak.has(c));
    const current = nodes.find((n) => n.state === "AVAILABLE" || n.state === "IN_PROGRESS");
    return { module: { id: m.id, title: m.title, semester: m.semester, parcours: m.ownerId != null ? "" : m.parcours, owned: m.ownerId != null, source: m.source, verified: m.verified }, subject, crowns: crownsFor(cards), cardCount: cards.length, currentNodeId: current?.id || null, nodes, error: null };
  },

  setProgress: async function (userId, nodeId, state) {
    if (!["IN_PROGRESS", "COMPLETED"].includes(state)) return { error: "invalid_state" };
    const node = await rawDb().lawPathNode.findUnique({ where: { id: String(nodeId || "") } });
    const m = node && (await this._moduleFor(userId, node.moduleId));
    if (!m) return { error: "not_found" };
    const progress = await rawDb().lawNodeProgress.findMany({ where: { userId, nodeId: { in: m.nodes.map((n) => n.id) } } });
    const st = this._states(m.nodes, progress).get(node.id);
    if (st === "LOCKED") return { error: "locked", status: 409 };
    if (st === "COMPLETED") return { state: "COMPLETED", unchanged: true, error: null }; // completion is permanent (XP stays stable)
    // XP only for the student's CURRENT semester and at most 6 nodes a day: completion is self-reported, so it cannot
    // be an unlimited XP tap (any semester, any number of modules).
    let xpAwarded = false;
    if (state === "COMPLETED") {
      const prof = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { semester: true } });
      if (prof?.semester === m.semester) {
        const startOfDay = new Date(`${localDate(new Date())}T00:00:00Z`);
        const today = await rawDb().lawNodeProgress.count({ where: { userId, xpAwarded: true, updatedAt: { gte: new Date(startOfDay.getTime() - 14 * 3600000) } } });
        xpAwarded = today < XP_NODES_PER_DAY;
      }
    }
    await rawDb().lawNodeProgress.upsert({ where: { userId_nodeId: { userId, nodeId: node.id } }, create: { userId, nodeId: node.id, state, xpAwarded }, update: { state, xpAwarded } });
    const after = await rawDb().lawNodeProgress.findMany({ where: { userId, nodeId: { in: m.nodes.map((n) => n.id) } } });
    const states = this._states(m.nodes, after);
    const unlocked = m.nodes.filter((n) => states.get(n.id) === "AVAILABLE" && parseJson(n.prereqIds, []).includes(node.id)).map((n) => n.id);
    return { state, unlocked, moduleDone: m.nodes.every((n) => states.get(n.id) === "COMPLETED"), error: null };
  },

  attachHubDoc: async function (userId, nodeId, noteId) {
    const node = await rawDb().lawPathNode.findUnique({ where: { id: String(nodeId || "") } });
    if (!node || !(await this._moduleFor(userId, node.moduleId))) return { error: "not_found" };
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    if (!n || n.visibility !== "public" || n.moderationStatus !== "ACTIVE") return { error: "not_found" };
    const count = await rawDb().lawPathPin.count({ where: { userId, nodeId: node.id } });
    if (count >= MAX_PINS) return { error: "too_many_pins", status: 409 };
    await rawDb().lawPathPin.upsert({ where: { userId_nodeId_noteId: { userId, nodeId: node.id, noteId: n.id } }, create: { userId, nodeId: node.id, noteId: n.id }, update: {} });
    return { error: null };
  },

  detachHubDoc: async function (userId, nodeId, noteId) {
    await rawDb().lawPathPin.deleteMany({ where: { userId, nodeId: String(nodeId || ""), noteId: String(noteId || "") } });
    return { error: null };
  },

  // ---- admin ----
  setNodes: async function (moduleId, input) {
    const m = await rawDb().lawCourseModule.findUnique({ where: { id: String(moduleId || "") } });
    if (!m) return { error: "not_found" };
    if (!Array.isArray(input) || !input.length || input.length > 60) return { error: "invalid_nodes" };
    for (const [i, n] of input.entries()) {
      if (!KINDS.includes(n?.kind) || typeof n.title !== "string" || !n.title.trim() || typeof n.section !== "string" || !n.section.trim()) return { error: "invalid_nodes" };
      if (n.prereq !== undefined && (!Array.isArray(n.prereq) || n.prereq.some((p) => !Number.isInteger(p) || p < 0 || p >= i))) return { error: "invalid_nodes" }; // earlier nodes only: no cycles
      if (n.legalRefs !== undefined && (!Array.isArray(n.legalRefs) || n.legalRefs.some((r) => typeof r?.slug !== "string" || typeof r?.number !== "string"))) return { error: "invalid_nodes" };
    }
    if (input.some((n) => n.conceptIds !== undefined && (!Array.isArray(n.conceptIds) || n.conceptIds.length > 10 || n.conceptIds.some((c) => typeof c !== "string")))) return { error: "invalid_nodes" };
    const ids = input.map(() => require("crypto").randomUUID());
    // Replacing the scaffold must not wipe students' work: completed nodes that survive (same kind + title) keep their progress.
    const old = await rawDb().lawPathNode.findMany({ where: { moduleId: m.id }, include: { progress: true } });
    const carry = [];
    input.forEach((n, i) => {
      const prev = old.find((o) => o.kind === n.kind && o.title === n.title.trim().slice(0, 160));
      for (const p of prev?.progress || []) carry.push({ userId: p.userId, nodeId: ids[i], state: p.state, xpAwarded: p.xpAwarded });
    });
    await rawDb().$transaction([
      rawDb().lawPathNode.deleteMany({ where: { moduleId: m.id } }),
      ...input.map((n, i) => rawDb().lawPathNode.create({ data: { id: ids[i], moduleId: m.id, kind: n.kind, title: n.title.trim().slice(0, 160), section: n.section.trim().slice(0, 120), ordinal: i + 1, legalRefs: JSON.stringify(n.legalRefs || []), conceptIds: JSON.stringify(n.conceptIds || []), prereqIds: JSON.stringify((n.prereq ?? (i ? [i - 1] : [])).map((p) => ids[p])) } })),
      ...carry.map((c) => rawDb().lawNodeProgress.create({ data: c })),
    ]);
    return { error: null };
  },
  renameModule: async function (moduleId, title) {
    if (typeof title !== "string" || !title.trim()) return { error: "invalid_title" };
    const r = await rawDb().lawCourseModule.updateMany({ where: { id: String(moduleId || "") }, data: { title: title.trim().slice(0, 160) } });
    return r.count ? { error: null } : { error: "not_found" };
  },
};

module.exports = { LawPath };
