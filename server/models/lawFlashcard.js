const { db } = require("../utils/law/dbClient");
const { LawSetting } = require("./lawSetting");
const { localDate } = require("../utils/law/time");
const { previewDue } = require("../utils/law/fsrs");

// Spec §3.6: cards come only from these origins, never auto-generated from every lecture.
const ORIGINS = [
  "failed_retrieval",
  "prof_emphasis",
  "definition",
  "elements_list",
  "deadline",
  "manual",
  "squad", // Qanouni Collab: own copy of a squad deck card (models/lawSquad.js)
];
const TYPES = ["basic", "cloze", "qualification"];
const OFFLINE_HORIZON_DAYS = 3;

function parseIds(v) {
  try {
    const a = JSON.parse(v || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function present(row, { retention, now } = {}) {
  const out = { ...row, canonicalIds: parseIds(row.canonicalIds) };
  if (retention) out.nextDue = previewDue(row, now ?? new Date(), retention);
  return out;
}

function sanitize(input = {}, { creating = false } = {}) {
  const data = {};
  if (creating || "front" in input) {
    if (
      typeof input.front !== "string" ||
      !input.front.trim() ||
      input.front.length > 5000
    )
      return { error: "front is required" };
    data.front = input.front.trim();
  }
  if (creating || "back" in input) {
    if (
      typeof input.back !== "string" ||
      !input.back.trim() ||
      input.back.length > 10000
    )
      return { error: "back is required" };
    data.back = input.back.trim();
  }
  if (creating || "origin" in input) {
    if (!ORIGINS.includes(input.origin)) return { error: "invalid origin" };
    data.origin = input.origin;
  }
  if ("type" in input) {
    if (!TYPES.includes(input.type)) return { error: "invalid type" };
    data.type = input.type;
  }
  if ("canonicalIds" in input) {
    if (
      !Array.isArray(input.canonicalIds) ||
      input.canonicalIds.some((x) => typeof x !== "string")
    )
      return { error: "invalid canonicalIds" };
    data.canonicalIds = JSON.stringify(input.canonicalIds);
  }
  if ("conceptIds" in input) {
    // Legal-graph cards point at the concepts they drill (Brain mastery per concept); ids are only ever read back per student.
    if (
      !Array.isArray(input.conceptIds) ||
      input.conceptIds.length > 10 ||
      input.conceptIds.some((x) => typeof x !== "string")
    )
      return { error: "invalid conceptIds" };
    data.conceptIds = JSON.stringify(input.conceptIds);
  }
  if ("suspended" in input) {
    if (typeof input.suspended !== "boolean")
      return { error: "invalid suspended" };
    data.suspended = input.suspended;
  }
  if ("noteAtomId" in input) data.noteAtomId = input.noteAtomId || null;
  if (creating || "subjectId" in input) {
    if (typeof input.subjectId !== "string" || !input.subjectId)
      return { error: "subjectId is required" };
    data.subjectId = input.subjectId;
  }
  return { data, error: null };
}

/** Round-robin across subjects so a session mixes subjects by default (spec §8.1 interleaving). */
function interleave(cards) {
  const buckets = new Map();
  for (const c of cards) {
    if (!buckets.has(c.subjectId)) buckets.set(c.subjectId, []);
    buckets.get(c.subjectId).push(c);
  }
  const queues = [...buckets.values()];
  const out = [];
  while (queues.some((q) => q.length))
    for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

const ACTIVE = { deletedAt: null, suspended: false };

/** Today's new cards: oldest first within each subject, interleaved across subjects, then capped. */
async function pickNew(scope, allowance) {
  if (!allowance) return [];
  const pool = await db().lawFlashcard.findMany({
    where: { ...scope, state: "new" },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  return interleave(pool).slice(0, allowance);
}

const LawFlashcard = {
  ORIGINS,
  TYPES,
  interleave,
  present,

  /** New cards still allowed today under the daily cap. */
  newAllowance: async function (now = new Date()) {
    const cap = await LawSetting.get("newCardsPerDay");
    const day = await db().lawStudyDay.findFirst({
      where: { date: localDate(now) },
    });
    return Math.max(0, cap - (day?.newCardsLearned || 0));
  },

  /** Due reviews (oldest first) + new cards up to the daily allowance, interleaved across subjects. */
  dueQueue: async function ({ subjectId, limit = 200, now = new Date() } = {}) {
    const scope = { ...ACTIVE, ...(subjectId && { subjectId }) };
    const reviews = await db().lawFlashcard.findMany({
      where: { ...scope, NOT: { state: "new" }, due: { lte: now } },
      orderBy: { due: "asc" },
      take: limit,
    });
    const allowance = await this.newAllowance(now);
    const fresh = await pickNew(scope, allowance);
    const retention = await LawSetting.get("desiredRetention");
    const queue = (
      subjectId ? [...reviews, ...fresh] : [...interleave(reviews), ...fresh]
    )
      .slice(0, limit)
      .map((c) => present(c, { retention, now }));
    return {
      cards: queue,
      reviewCount: reviews.length,
      newCount: fresh.length,
      newAllowance: allowance,
    };
  },

  /**
   * Everything the phone needs to review with no network (spec §1.9, §9.6): due + next 3 days of cards
   * and today's new-card allowance. Exam Mode atoms join this pack in Phase 4.
   */
  offlinePack: async function ({ now = new Date() } = {}) {
    const horizon = new Date(now.getTime() + OFFLINE_HORIZON_DAYS * 86400000);
    const upcoming = await db().lawFlashcard.findMany({
      where: { ...ACTIVE, NOT: { state: "new" }, due: { lte: horizon } },
      orderBy: { due: "asc" },
    });
    const allowance = await this.newAllowance(now);
    const fresh = await pickNew(ACTIVE, allowance);
    const subjects = await db().lawSubject.findMany({
      where: { archived: false },
      select: { id: true, name: true, color: true },
    });
    const settings = await LawSetting.all();
    return {
      generatedAt: now.toISOString(),
      settings: {
        desiredRetention: settings.desiredRetention,
        newCardsPerDay: settings.newCardsPerDay,
        dailyGoalMinutes: settings.dailyGoalMinutes,
      },
      newAllowance: allowance,
      subjects,
      cards: [...upcoming, ...fresh].map((c) => present(c)),
      atoms: await require("./lawAtom").LawAtom.offlineExamAtoms(),
    };
  },

  browse: async function ({
    subjectId,
    q,
    includeSuspended = true,
    take = 100,
    skip = 0,
  } = {}) {
    const where = { deletedAt: null };
    if (subjectId) where.subjectId = subjectId;
    if (!includeSuspended) where.suspended = false;
    if (q) where.OR = [{ front: { contains: q } }, { back: { contains: q } }];
    const [rows, total] = await Promise.all([
      db().lawFlashcard.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      db().lawFlashcard.count({ where }),
    ]);
    return { cards: rows.map((r) => present(r)), total };
  },

  get: async function (id) {
    const row = await db().lawFlashcard.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? present(row) : null;
  },

  create: async function (input) {
    const { data, error } = sanitize(input, { creating: true });
    if (error) return { card: null, error };
    if (!(await db().lawSubject.findUnique({ where: { id: data.subjectId } })))
      return { card: null, error: "unknown subject" };
    const row = await db().lawFlashcard.create({ data });
    return { card: present(row), error: null };
  },

  update: async function (id, input) {
    const { data, error } = sanitize(input);
    if (error) return { card: null, error };
    if (!(await this.get(id))) return { card: null, error: "not_found" };
    if (
      data.subjectId &&
      !(await db().lawSubject.findUnique({ where: { id: data.subjectId } }))
    )
      return { card: null, error: "unknown subject" };
    const row = await db().lawFlashcard.update({ where: { id }, data });
    return { card: present(row), error: null };
  },

  /** Soft delete: review history stays for streak/study-day integrity. */
  remove: async function (id) {
    if (!(await this.get(id))) return false;
    await db().lawFlashcard.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return true;
  },

  stats: async function ({ now = new Date() } = {}) {
    const byState = await db().lawFlashcard.groupBy({
      by: ["state"],
      where: ACTIVE,
      _count: { _all: true },
    });
    const forecast = [];
    for (let i = 0; i < 7; i++) {
      const end = new Date(now.getTime() + (i + 1) * 86400000);
      const start = new Date(now.getTime() + i * 86400000);
      forecast.push(
        await db().lawFlashcard.count({
          where: {
            ...ACTIVE,
            NOT: { state: "new" },
            due: i === 0 ? { lte: end } : { gt: start, lte: end },
          },
        })
      );
    }
    const since = new Date(now.getTime() - 30 * 86400000);
    const recent = await db().lawReviewLog.findMany({
      where: { reviewedAt: { gte: since } },
      select: { rating: true, stateBefore: true },
    });
    const matured = recent.filter((r) => {
      try {
        return JSON.parse(r.stateBefore).state === "review";
      } catch {
        return false;
      }
    });
    const retention30d = matured.length
      ? matured.filter((r) => r.rating > 1).length / matured.length
      : null;
    return {
      byState: Object.fromEntries(byState.map((s) => [s.state, s._count._all])),
      forecast,
      retention30d,
      reviews30d: recent.length,
    };
  },
};

module.exports = { LawFlashcard };
