// Knowledge-graph edges (spec §5.4 LawLink). Types and relations are a closed set; endpoints of corpus
// types must exist (articles by canonicalId or id, decisions, doctrine refs).
const { db } = require("../utils/law/dbClient");
const { normalizeCanonicalId } = require("../utils/law/arabic");

const TYPES = [
  "article",
  "articleVersion",
  "decision",
  "doctrine",
  "noteAtom",
  "flashcard",
  "caseAttempt",
];
const RELATIONS = [
  "references",
  "applies",
  "interprets",
  "confirms",
  "reverses",
  "contradicts",
  "cites",
  "divergesFrom",
];

/** Resolves an endpoint to a stored id, or null when it does not exist. */
async function resolveEndpoint(type, id) {
  if (typeof id !== "string" || !id) return null;
  switch (type) {
    case "article": {
      const cid = normalizeCanonicalId(id);
      const a = await db().lawArticle.findFirst({
        where: cid ? { OR: [{ canonicalId: cid }, { id }] } : { id },
      });
      return a?.id ?? null;
    }
    case "articleVersion":
      return (
        (await db().lawArticleVersion.findUnique({ where: { id } }))?.id ?? null
      );
    case "decision":
      return (await db().lawDecision.findUnique({ where: { id } }))?.id ?? null;
    case "doctrine":
      return (
        (await db().lawDoctrineRef.findUnique({ where: { id } }))?.id ?? null
      );
    case "flashcard":
      return (
        (await db().lawFlashcard.findUnique({ where: { id } }))?.id ?? null
      );
    case "noteAtom":
      return (
        (await db().lawNoteAtom.findFirst({ where: { id, deletedAt: null } }))
          ?.id ?? null
      );
    case "caseAttempt":
      return (
        (await db().lawCaseAttempt.findUnique({ where: { id } }))?.id ?? null
      );
    default:
      return null;
  }
}

const LawLink = {
  TYPES,
  RELATIONS,

  create: async function ({
    fromType,
    fromId,
    toType,
    toId,
    relation,
    note = null,
  } = {}) {
    if (!TYPES.includes(fromType) || !TYPES.includes(toType))
      return { error: "invalid type" };
    if (!RELATIONS.includes(relation)) return { error: "invalid relation" };
    const from = await resolveEndpoint(fromType, fromId);
    const to = await resolveEndpoint(toType, toId);
    if (!from || !to) return { error: "unknown endpoint" };
    if (fromType === toType && from === to) return { error: "self link" };
    if (note !== null && (typeof note !== "string" || note.length > 2000))
      return { error: "invalid note" };
    const key = { fromType, fromId: from, toType, toId: to, relation };
    const existing = await db().lawLink.findFirst({ where: key });
    if (existing) return { link: existing, error: null };
    return {
      link: await db().lawLink.create({ data: { ...key, note } }),
      error: null,
    };
  },

  /** Links touching an entity, in both directions. */
  forEntity: async function (type, id) {
    const [out, inc] = await Promise.all([
      db().lawLink.findMany({ where: { fromType: type, fromId: id } }),
      db().lawLink.findMany({ where: { toType: type, toId: id } }),
    ]);
    return [
      ...out.map((l) => ({ ...l, direction: "out" })),
      ...inc.map((l) => ({ ...l, direction: "in" })),
    ];
  },

  remove: async function (id) {
    try {
      await db().lawLink.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
};

module.exports = { LawLink };
