const { db } = require("../utils/law/dbClient");
const { isDateStr, localDate } = require("../utils/law/time");

const STATUSES = ["captured", "processing", "needs_review", "reviewed"];

const LawSession = {
  STATUSES,

  list: async function ({ subjectId, from, to } = {}) {
    const where = {};
    if (subjectId) where.subjectId = subjectId;
    if (from || to)
      where.date = { ...(from && { gte: from }), ...(to && { lte: to }) };
    return db().lawClassSession.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { subject: { select: { id: true, name: true, color: true } } },
      take: 200,
    });
  },

  create: async function ({
    subjectId,
    slotId = null,
    date,
    title = null,
  } = {}) {
    if (!subjectId) return { session: null, error: "subjectId is required" };
    const day = date ?? localDate();
    if (!isDateStr(day)) return { session: null, error: "invalid date" };
    if (!(await db().lawSubject.findUnique({ where: { id: subjectId } })))
      return { session: null, error: "unknown subject" };
    if (
      slotId &&
      !(await db().lawTimetableSlot.findUnique({ where: { id: slotId } }))
    )
      return { session: null, error: "unknown slot" };
    const session = await db().lawClassSession.create({
      data: { subjectId, slotId, date: day, title },
    });
    return { session, error: null };
  },

  /** Implicit creation during capture (Phase 2): reuse today's session for the same subject and slot. */
  findOrCreate: async function ({ subjectId, slotId = null, date }) {
    const existing = await db().lawClassSession.findFirst({
      where: { subjectId, slotId, date },
    });
    if (existing) return { session: existing, error: null };
    return this.create({ subjectId, slotId, date });
  },

  update: async function (id, { title, subjectId, status } = {}) {
    const data = {};
    if (title !== undefined) data.title = title || null;
    if (subjectId !== undefined) {
      if (!(await db().lawSubject.findUnique({ where: { id: subjectId } })))
        return { session: null, error: "unknown subject" };
      data.subjectId = subjectId;
    }
    if (status !== undefined) {
      if (!STATUSES.includes(status))
        return { session: null, error: "invalid status" };
      data.status = status;
    }
    try {
      return {
        session: await db().lawClassSession.update({ where: { id }, data }),
        error: null,
      };
    } catch {
      return { session: null, error: "not_found" };
    }
  },
};

module.exports = { LawSession };
