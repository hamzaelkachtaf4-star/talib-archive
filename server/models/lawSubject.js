const { db } = require("../utils/law/dbClient");
const { LawSetting } = require("./lawSetting");
const { localDate, daysBetween } = require("../utils/law/time");
const { isValidTree } = require("../utils/law/coursePlan");

// Dissertation defaults (spec §8.3), overridable per professor.
const DEFAULT_DISSERTATION_RULES = {
  planType: "bipartite",
  introSteps: [
    "الإطار العام",
    "الإطار الخاص والتعريف",
    "الأهمية النظرية والعملية",
    "التطور التاريخي",
    "الإشكالية",
    "الإعلان عن الخطة",
  ],
  symmetricDepth: true,
  headingsAsNounPhrases: true,
};

const EDITABLE = {
  name: "string",
  nameFr: "string?",
  code: "string?",
  semester: "string",
  professorName: "string?",
  professorNotes: "string?",
  examDate: "date?",
  examFormat: "string?",
  dissertationRules: "json?",
  coursePlan: "json?",
  color: "color",
  archived: "boolean",
};

/**
 * Validates and normalizes user input for create/update.
 * @returns {{data: object|null, error: string|null}}
 */
function sanitize(input = {}, { requireName = false } = {}) {
  const data = {};
  for (const [key, kind] of Object.entries(EDITABLE)) {
    if (!(key in input)) continue;
    const v = input[key];
    const optional = kind.endsWith("?");
    if ((v === null || v === "") && optional) {
      data[key] = null;
      continue;
    }
    switch (kind.replace("?", "")) {
      case "string":
        if (typeof v !== "string" || !v.trim() || v.length > 2000)
          return { data: null, error: `invalid ${key}` };
        data[key] = v.trim();
        break;
      case "date": {
        const d = new Date(v);
        if (isNaN(d)) return { data: null, error: `invalid ${key}` };
        data[key] = d;
        break;
      }
      case "json":
        try {
          data[key] =
            typeof v === "string"
              ? JSON.stringify(JSON.parse(v))
              : JSON.stringify(v);
        } catch {
          return { data: null, error: `invalid ${key}` };
        }
        break;
      case "color":
        if (!/^#[0-9a-fA-F]{6}$/.test(v))
          return { data: null, error: `invalid ${key}` };
        data[key] = v;
        break;
      case "boolean":
        if (typeof v !== "boolean")
          return { data: null, error: `invalid ${key}` };
        data[key] = v;
        break;
    }
  }
  if (requireName && !data.name)
    return { data: null, error: "name is required" };
  return { data, error: null };
}

function parseJson(v, fallback) {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

/** API shape: JSON columns parsed, lockdown computed (spec §3.5). */
function present(row, { lockdownDays, today, dueCount = 0 } = {}) {
  const examDay = row.examDate ? localDate(row.examDate) : null;
  const daysToExam = examDay && today ? daysBetween(today, examDay) : null;
  return {
    ...row,
    dissertationRules: parseJson(
      row.dissertationRules,
      DEFAULT_DISSERTATION_RULES
    ),
    coursePlan: parseJson(row.coursePlan, null),
    daysToExam,
    lockdown:
      daysToExam !== null &&
      daysToExam >= 0 &&
      daysToExam <= (lockdownDays ?? 10),
    dueCount,
  };
}

const LawSubject = {
  DEFAULT_DISSERTATION_RULES,
  sanitize,
  present,

  list: async function ({ includeArchived = false, now = new Date() } = {}) {
    const rows = await db().lawSubject.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { createdAt: "asc" },
    });
    const due = await db().lawFlashcard.groupBy({
      by: ["subjectId"],
      where: {
        deletedAt: null,
        suspended: false,
        due: { lte: now },
        NOT: { state: "new" },
      },
      _count: { _all: true },
    });
    const dueBy = Object.fromEntries(
      due.map((d) => [d.subjectId, d._count._all])
    );
    const lockdownDays = await LawSetting.get("examLockdownDays");
    const today = localDate(now);
    return rows.map((r) =>
      present(r, { lockdownDays, today, dueCount: dueBy[r.id] || 0 })
    );
  },

  get: async function (id, { now = new Date() } = {}) {
    const row = await db().lawSubject.findUnique({ where: { id } });
    if (!row) return null;
    const lockdownDays = await LawSetting.get("examLockdownDays");
    return present(row, { lockdownDays, today: localDate(now) });
  },

  create: async function (input) {
    if (
      input &&
      "coursePlan" in input &&
      input.coursePlan !== null &&
      !isValidTree(input.coursePlan)
    )
      return { subject: null, error: "invalid coursePlan" };
    const { data, error } = sanitize(input, { requireName: true });
    if (error) return { subject: null, error };
    const row = await db().lawSubject.create({ data });
    return { subject: await this.get(row.id), error: null };
  },

  update: async function (id, input) {
    if (
      input &&
      "coursePlan" in input &&
      input.coursePlan !== null &&
      !isValidTree(input.coursePlan)
    )
      return { subject: null, error: "invalid coursePlan" };
    const { data, error } = sanitize(input);
    if (error) return { subject: null, error };
    const exists = await db().lawSubject.findUnique({ where: { id } });
    if (!exists) return { subject: null, error: "not_found" };
    await db().lawSubject.update({ where: { id }, data });
    return { subject: await this.get(id), error: null };
  },

  linkWorkspace: async function (id, workspaceId) {
    await db().lawSubject.update({
      where: { id },
      data: { anythingllmWorkspaceId: workspaceId },
    });
  },
};

module.exports = { LawSubject };
