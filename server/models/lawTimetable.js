const { db, rawDb } = require("../utils/law/dbClient");
const { currentUserId } = require("../utils/law/tenant");
const { LawSetting } = require("./lawSetting");
const { weekdayOf, isDateStr } = require("../utils/law/time");

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateSlot(s) {
  if (!s || typeof s !== "object") return "invalid slot";
  if (!Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7)
    return "invalid weekday";
  if (!TIME.test(s.startTime || "") || !TIME.test(s.endTime || ""))
    return "invalid time";
  if (s.startTime >= s.endTime) return "start must be before end";
  if (s.kind && !["amphi", "TD", "TP"].includes(s.kind)) return "invalid kind";
  for (const [k, max] of [["room", 80], ["professor", 120], ["groupLabel", 40]])
    if (s[k] != null && (typeof s[k] !== "string" || s[k].length > max)) return `invalid ${k}`;
  for (const k of ["activeFrom", "activeTo"])
    if (s[k] != null && s[k] !== "" && !isDateStr(s[k])) return `invalid ${k}`;
  return null;
}

const LawTimetable = {
  validateSlot,

  // A student's timetable starts empty: nothing is invented for them (RC4 removed the placeholder sessions earlier versions seeded).
  list: async function () {
    return db().lawTimetableSlot.findMany({
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      include: { subject: { select: { id: true, name: true, color: true } } },
    });
  },

  /**
   * Replaces the whole timetable (PUT semantics). Slots keep their id when one is given, so existing
   * sessions stay linked. A slot with a subject is no longer a placeholder.
   */
  replace: async function (slots) {
    if (!Array.isArray(slots) || slots.length > 50)
      return { slots: null, error: "invalid slots" };
    for (const s of slots) {
      const err = validateSlot(s);
      if (err) return { slots: null, error: err };
    }
    const subjectIds = [
      ...new Set(slots.map((s) => s.subjectId).filter(Boolean)),
    ];
    if (subjectIds.length) {
      const found = await db().lawSubject.count({
        where: { id: { in: subjectIds } },
      });
      if (found !== subjectIds.length)
        return { slots: null, error: "unknown subject" };
    }

    // A session may name one of the student's modules (their own or a shared one in their scope).
    const moduleIds = [...new Set(slots.map((s) => s.moduleId).filter(Boolean))];
    if (moduleIds.length) {
      const { LawModule } = require("./lawModule");
      for (const id of moduleIds) if (typeof id !== "string" || !(await LawModule.visible(currentUserId(), id))) return { slots: null, error: "unknown module" };
    }

    const keepIds = slots.map((s) => s.id).filter(Boolean);
    await db().$transaction(async (tx) => {
      await tx.lawTimetableSlot.deleteMany({
        where: { id: { notIn: keepIds } },
      });
      for (const s of slots) {
        const data = {
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
          kind: s.kind || "amphi",
          room: s.room || null,
          subjectId: s.subjectId || null,
          activeFrom: s.activeFrom || null,
          activeTo: s.activeTo || null,
          placeholder: !s.subjectId && !!s.placeholder,
        };
        // Fields absent from the payload keep what is stored (an older client that never sends them must not wipe them);
        // an explicit null or empty string clears.
        if ("professor" in s) data.professor = s.professor ? s.professor.trim() || null : null;
        if ("groupLabel" in s) data.groupLabel = s.groupLabel ? s.groupLabel.trim() || null : null;
        if ("moduleId" in s) data.moduleId = s.moduleId || null;
        if (
          s.id &&
          (await tx.lawTimetableSlot.findUnique({ where: { id: s.id } }))
        )
          await tx.lawTimetableSlot.update({ where: { id: s.id }, data });
        else await tx.lawTimetableSlot.create({ data: { professor: null, groupLabel: null, moduleId: null, ...data } });
      }
    });
    return { slots: await this.list(), error: null };
  },

  /** Slots that apply on a local date (weekday + active range). */
  forDate: async function (dateStr) {
    const all = await this.list();
    const wd = weekdayOf(dateStr);
    return all.filter(
      (s) =>
        s.weekday === wd &&
        (!s.activeFrom || s.activeFrom <= dateStr) &&
        (!s.activeTo || s.activeTo >= dateStr)
    );
  },
};

module.exports = { LawTimetable };
