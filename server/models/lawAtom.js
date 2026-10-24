// Note atoms (spec §3.4, §5.3): the unit of study content, always tagged with its provenance and,
// except MINE, a resolvable source reference. Only accepted atoms (verified/edited) reach Exam Mode.
const { db } = require("../utils/law/dbClient");
const { signAsset } = require("../utils/law/signedUrl");

const PROVENANCES = ["PROF", "TEXT", "JURIS", "DOCTRINE", "MINE"];
const STATUSES = ["unverified", "verified", "edited", "rejected"];
const ACCEPTED = ["verified", "edited"];
const MAX_BRIDGE_PER_TOPIC = 2;

function parse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** Topic key for grouping and Mention Bridge: explicit "issue:" tag, else the headingPath leaf. */
function topicOf(atom) {
  const tags = Array.isArray(atom.tags) ? atom.tags : parse(atom.tags, []);
  const issue = tags.find(
    (t) => typeof t === "string" && t.startsWith("issue:")
  );
  if (issue) return issue.slice(6).trim();
  const hp = Array.isArray(atom.headingPath)
    ? atom.headingPath
    : parse(atom.headingPath, []);
  return hp[hp.length - 1] || "عام";
}

function sourceRef(a) {
  if (!a.sourceAssetId) return null;
  const { exp, sig } = signAsset(a.sourceAssetId);
  return {
    assetId: a.sourceAssetId,
    url: `/api/law/assets/${a.sourceAssetId}/file?exp=${exp}&sig=${sig}`,
    timestampSec: a.sourceTimestampSec,
    page: a.sourcePage,
  };
}

function present(a) {
  return {
    ...a,
    headingPath: parse(a.headingPath, []),
    tags: parse(a.tags, []),
    source: sourceRef(a),
  };
}

/** Provenance contract (spec §3.4 table). Returns an error string or null. */
async function checkProvenance(data) {
  switch (data.provenance) {
    case "PROF": {
      if (!data.sourceAssetId) return "PROF needs a source asset";
      if (data.sourceTimestampSec == null && data.sourcePage == null)
        return "PROF needs a timestamp or a page";
      if (
        !(await db().lawAsset.findUnique({ where: { id: data.sourceAssetId } }))
      )
        return "unknown source asset";
      return null;
    }
    case "TEXT":
      if (
        !data.articleVersionId ||
        !(await db().lawArticleVersion.findUnique({
          where: { id: data.articleVersionId },
        }))
      )
        return "TEXT needs an existing article version";
      return null;
    case "JURIS":
      if (
        !data.decisionId ||
        !(await db().lawDecision.findUnique({ where: { id: data.decisionId } }))
      )
        return "JURIS needs an existing decision";
      return null;
    case "DOCTRINE":
      if (
        !data.doctrineRefId ||
        !(await db().lawDoctrineRef.findUnique({
          where: { id: data.doctrineRefId },
        }))
      )
        return "DOCTRINE needs an existing doctrine reference";
      return null;
    case "MINE":
      return null;
    default:
      return "invalid provenance";
  }
}

function sanitize(input = {}, { creating = false } = {}) {
  const data = {};
  if (creating || "provenance" in input) {
    if (!PROVENANCES.includes(input.provenance))
      return { error: "invalid provenance" };
    data.provenance = input.provenance;
  }
  if (creating || "body" in input) {
    if (
      typeof input.body !== "string" ||
      !input.body.trim() ||
      input.body.length > 20000
    )
      return { error: "body is required" };
    data.body = input.body.trim();
  }
  if (creating || "subjectId" in input) {
    if (typeof input.subjectId !== "string")
      return { error: "subjectId is required" };
    data.subjectId = input.subjectId;
  }
  for (const k of ["headingPath", "tags"])
    if (k in input) {
      if (
        !Array.isArray(input[k]) ||
        input[k].some((x) => typeof x !== "string") ||
        input[k].length > 12
      )
        return { error: `invalid ${k}` };
      data[k] = JSON.stringify(input[k].map((x) => x.trim()).filter(Boolean));
    }
  for (const k of [
    "sessionId",
    "sourceAssetId",
    "articleVersionId",
    "decisionId",
    "doctrineRefId",
    "fromDerivativeId",
  ])
    if (k in input) data[k] = input[k] || null;
  if ("sourceTimestampSec" in input) {
    const v = input.sourceTimestampSec;
    if (v !== null && !(Number.isFinite(v) && v >= 0))
      return { error: "invalid sourceTimestampSec" };
    data.sourceTimestampSec = v;
  }
  if ("sourcePage" in input) {
    const v = input.sourcePage;
    if (v !== null && !(Number.isInteger(v) && v >= 1))
      return { error: "invalid sourcePage" };
    data.sourcePage = v;
  }
  for (const k of [
    "examRelevant",
    "profEmphasis",
    "profDivergent",
    "mentionBridge",
  ])
    if (k in input) {
      if (typeof input[k] !== "boolean") return { error: `invalid ${k}` };
      data[k] = input[k];
    }
  if ("verificationStatus" in input) {
    if (!STATUSES.includes(input.verificationStatus))
      return { error: "invalid verificationStatus" };
    data.verificationStatus = input.verificationStatus;
  }
  return { data, error: null };
}

/**
 * Mention Bridge (spec §3.5): per topic at most 2 pins: one verified decision (JURIS) and one
 * doctrinal nuance (DOCTRINE).
 */
async function checkBridge(atom) {
  if (!["JURIS", "DOCTRINE"].includes(atom.provenance))
    return "only JURIS or DOCTRINE atoms can be Mention Bridge inserts";
  if (atom.provenance === "JURIS") {
    const d = await db().lawDecision.findUnique({
      where: { id: atom.decisionId },
    });
    if (!d?.verified)
      return "the decision must be verified against the official record first";
  }
  const topic = topicOf(atom);
  const pinned = (
    await db().lawNoteAtom.findMany({
      where: {
        subjectId: atom.subjectId,
        mentionBridge: true,
        deletedAt: null,
        NOT: { id: atom.id },
      },
    })
  ).filter((a) => topicOf(a) === topic);
  if (pinned.length >= MAX_BRIDGE_PER_TOPIC)
    return `at most ${MAX_BRIDGE_PER_TOPIC} Mention Bridge inserts per topic`;
  if (pinned.some((a) => a.provenance === atom.provenance))
    return `this topic already has a ${atom.provenance} insert`;
  return null;
}

const LawAtom = {
  PROVENANCES,
  ACCEPTED,
  topicOf,
  present,

  list: async function ({ subjectId, provenance, q, take = 200 } = {}) {
    const where = { deletedAt: null };
    if (subjectId) where.subjectId = subjectId;
    if (provenance) where.provenance = provenance;
    if (q) where.body = { contains: q };
    const rows = await db().lawNoteAtom.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take,
    });
    return rows.map(present);
  },

  get: async function (id) {
    const a = await db().lawNoteAtom.findFirst({
      where: { id, deletedAt: null },
    });
    return a ? present(a) : null;
  },

  /** Student-created atoms are theirs: verified on creation, except PROF without an accepted origin. */
  create: async function (input) {
    const { data, error } = sanitize(input, { creating: true });
    if (error) return { error };
    if (!(await db().lawSubject.findUnique({ where: { id: data.subjectId } })))
      return { error: "unknown subject" };
    const perr = await checkProvenance(data);
    if (perr) return { error: perr };
    if (!data.verificationStatus) data.verificationStatus = "verified";
    if (data.mentionBridge) {
      const berr = await checkBridge({ ...data, id: "" });
      if (berr) return { error: berr };
    }
    return {
      atom: present(await db().lawNoteAtom.create({ data })),
      error: null,
    };
  },

  update: async function (id, input) {
    const existing = await db().lawNoteAtom.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return { error: "not_found" };
    const { data, error } = sanitize(input);
    if (error) return { error };
    const merged = { ...existing, ...data };
    if (
      [
        "provenance",
        "sourceAssetId",
        "sourceTimestampSec",
        "sourcePage",
        "articleVersionId",
        "decisionId",
        "doctrineRefId",
      ].some((k) => k in data)
    ) {
      const perr = await checkProvenance(merged);
      if (perr) return { error: perr };
    }
    if (
      data.mentionBridge === true ||
      (merged.mentionBridge && ("headingPath" in data || "tags" in data))
    ) {
      const berr = await checkBridge(merged);
      if (berr) return { error: berr };
    }
    if (
      "body" in data &&
      !("verificationStatus" in data) &&
      existing.verificationStatus === "unverified"
    )
      data.verificationStatus = "edited";
    return {
      atom: present(await db().lawNoteAtom.update({ where: { id }, data })),
      error: null,
    };
  },

  remove: async function (id) {
    const r = await db().lawNoteAtom.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), mentionBridge: false },
    });
    return r.count === 1;
  },

  /** Exam Mode atoms of every active subject, for the offline pack (spec §1.9). */
  offlineExamAtoms: async function () {
    const { orderByPlan } = require("../utils/law/coursePlan");
    const subjects = await db().lawSubject.findMany({
      where: { archived: false },
      select: { id: true, coursePlan: true },
    });
    const out = [];
    for (const s of subjects) {
      const atoms = await db().lawNoteAtom.findMany({
        where: {
          subjectId: s.id,
          deletedAt: null,
          examRelevant: true,
          provenance: { in: ["PROF", "TEXT"] },
          verificationStatus: { in: ACCEPTED },
        },
      });
      const ordered = orderByPlan(atoms.map(present), parse(s.coursePlan, []));
      for (const p of ordered) {
        delete p.source; // signed URLs expire; offline shows the reference only
        out.push(
          p.profDivergent ? { ...p, divergenceMarker: "الأستاذ يتبنى رأيا" } : p
        );
      }
    }
    return out;
  },
};

module.exports = { LawAtom, topicOf };
