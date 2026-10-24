// Talib v3: QCM drills a student shares with the faculty. Only the questions travel (never the notes they were built from),
// colleagues clone them into one of their own modules, and the counters (tries, helpful) count each student once.
const { rawDb } = require("../utils/law/dbClient");
const { names, avatar } = require("./lawSquad");
const { serialWrite } = require("../utils/law/writeLock");

const MAX_SHARED_PER_USER = 30;
const PAGE = 40;
const err = (error, status) => ({ error, ...(status ? { status } : {}) });
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

async function profileOf(userId) {
  return rawDb().lawUserProfile.findUnique({ where: { userId }, select: { facultyCode: true, semester: true } });
}

/** The public face of a shared exam: counters and who did what, never the questions' answers. */
function present(e, { viewerId, author, tried = false, helpful = false }) {
  return {
    id: e.id, title: e.title, moduleTitle: e.moduleTitle, semester: e.semester, type: e.type, questionCount: e.questionCount,
    tries: e.tries, helpful: e.helpful, createdAt: e.createdAt,
    author: { userId: e.authorId, name: author, avatar: avatar(author, e.authorId) },
    mine: e.authorId === viewerId, iTried: tried, iHelpful: helpful,
  };
}

/** Records one vote per (exam, student, kind); true only the first time (the unique index decides, so races cannot double count). */
async function vote(examId, userId, kind) {
  try {
    await rawDb().lawSharedExamVote.create({ data: { examId, userId, kind } });
    return true;
  } catch (e) {
    if (e?.code === "P2002") return false;
    throw e;
  }
}

const LawSharedExam = {
  /** Shares one of my QCM drills with my faculty. Idempotent per drill. */
  publish: function (userId, body) {
    return serialWrite(() => this._publish(userId, body)); // one at a time: a double click cannot create two shares or pass the cap
  },

  _publish: async function (userId, { drillId } = {}) {
    const id = Number(drillId);
    if (!Number.isInteger(id) || id < 1) return err("invalid_drill");
    const drill = await rawDb().lawDrillAttempt.findFirst({ where: { id, userId }, include: { module: { select: { title: true, semester: true } } } });
    if (!drill) return err("not_found", 404);
    if (drill.type !== "qcm") return err("only_qcm", 422);
    const prof = await profileOf(userId);
    if (!prof?.facultyCode) return err("no_faculty", 409);
    const existing = await rawDb().lawSharedExam.findFirst({ where: { authorId: userId, sourceDrillId: id, status: "ACTIVE" } });
    const nameOf = await names([userId]);
    if (existing) return { exam: present(existing, { viewerId: userId, author: nameOf(userId) }), error: null };
    if ((await rawDb().lawSharedExam.count({ where: { authorId: userId, status: "ACTIVE" } })) >= MAX_SHARED_PER_USER) return err("too_many_shared", 429);
    const prompt = parse(drill.promptJson, {});
    if (prompt.mode === "final" && drill.status !== "submitted") return err("finish_first", 409); // sharing an open final exam would hand its answers to a copy
    // The source labels (cite) name the author's private notes: they never travel. The explanation does, and the UI says so.
    const items = (Array.isArray(prompt.items) ? prompt.items : []).map((i) => ({ question: i.question, options: i.options, correctIndex: i.correctIndex, explanation: i.explanation }));
    if (!items.length) return err("empty_drill", 422);
    const row = await rawDb().lawSharedExam.create({
      data: {
        authorId: userId, sourceDrillId: id, facultyCode: prof.facultyCode, moduleTitle: drill.module.title, semester: drill.module.semester || prof.semester || null,
        title: `QCM: ${drill.module.title}`, type: "qcm", questionCount: items.length, promptJson: JSON.stringify({ items, locale: prompt.locale || "ar", meta: {} }),
      },
    });
    return { exam: present(row, { viewerId: userId, author: nameOf(userId) }), error: null };
  },

  /** The faculty's shared exams, newest first; the most tried one is pinned. */
  list: async function (viewerId) {
    const prof = await profileOf(viewerId);
    if (!prof?.facultyCode) return { exams: [], pinnedId: null, error: null };
    const rows = await rawDb().lawSharedExam.findMany({ where: { facultyCode: prof.facultyCode, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: PAGE });
    const votes = await rawDb().lawSharedExamVote.findMany({ where: { userId: viewerId, examId: { in: rows.map((r) => r.id) } }, select: { examId: true, kind: true } });
    const nameOf = await names(rows.map((r) => r.authorId));
    const has = (id, kind) => votes.some((v) => v.examId === id && v.kind === kind);
    const exams = rows.map((r) => present(r, { viewerId, author: nameOf(r.authorId), tried: has(r.id, "tried"), helpful: has(r.id, "helpful") }));
    const top = [...exams].sort((a, b) => b.tries - a.tries || b.helpful - a.helpful || new Date(b.createdAt) - new Date(a.createdAt))[0];
    return { exams, pinnedId: top?.id ?? null, error: null };
  },

  async _visible(viewerId, id) {
    const prof = await profileOf(viewerId);
    if (!prof?.facultyCode) return null;
    const e = await rawDb().lawSharedExam.findFirst({ where: { id: String(id || ""), facultyCode: prof.facultyCode, status: "ACTIVE" } });
    return e || null;
  },

  /** Clones the questions into a fresh open QCM in one of my own modules. The first try by a student counts. */
  try: async function (viewerId, id, { moduleId } = {}) {
    const e = await this._visible(viewerId, id);
    if (!e) return err("not_found", 404);
    const { LawModule } = require("./lawModule");
    if (!(await LawModule.visible(viewerId, moduleId))) return err("not_found", 404);
    const { LawExam, MAX_OPEN_DRILLS } = require("./lawExam");
    if (e.authorId !== viewerId && (await rawDb().lawDrillAttempt.count({ where: { userId: viewerId, status: "open" } })) >= MAX_OPEN_DRILLS) return err("too_many_open", 409);
    const prompt = parse(e.promptJson, { items: [] });
    const row = await rawDb().lawDrillAttempt.create({ data: { userId: viewerId, moduleId: String(moduleId), type: "qcm", promptJson: JSON.stringify(prompt) } });
    const first = e.authorId === viewerId ? false : await vote(e.id, viewerId, "tried"); // trying your own exam counts for nothing
    if (first) await rawDb().lawSharedExam.update({ where: { id: e.id }, data: { tries: { increment: 1 } } });
    return { drill: LawExam._present(row), error: null };
  },

  /** One "helpful" per student, ever (a second call changes nothing). */
  markHelpful: async function (viewerId, id) {
    const e = await this._visible(viewerId, id);
    if (!e) return err("not_found", 404);
    if (e.authorId === viewerId) return err("cannot_vote_own", 400);
    const first = await vote(e.id, viewerId, "helpful");
    const row = first ? await rawDb().lawSharedExam.update({ where: { id: e.id }, data: { helpful: { increment: 1 } } }) : await rawDb().lawSharedExam.findUnique({ where: { id: e.id } });
    const nameOf = await names([row.authorId]);
    const tried = !!(await rawDb().lawSharedExamVote.findFirst({ where: { examId: e.id, userId: viewerId, kind: "tried" } }));
    return { exam: present(row, { viewerId, author: nameOf(row.authorId), tried, helpful: true }), error: null };
  },

  /** Only the author takes a shared exam down. */
  remove: async function (userId, id) {
    const r = await rawDb().lawSharedExam.updateMany({ where: { id: String(id || ""), authorId: userId, status: "ACTIVE" }, data: { status: "REMOVED" } });
    return r.count ? { error: null } : err("not_found", 404);
  },
};

module.exports = { LawSharedExam };
