// Court decisions ledger (spec §3.2, §5.4). A decision is `verified` only by an explicit student action
// after opening the official record (juriscassation.cspj.ma); editing the citation fields un-verifies it.
const { db } = require("../utils/law/dbClient");
const {
  indexDecision,
  searchDecisionIds,
} = require("../utils/law/corpusSearch");
const { isDateStr } = require("../utils/law/time");
const { toWesternDigits: digits } = require("../utils/law/arabic");

const CITATION_FIELDS = [
  "court",
  "decisionNumber",
  "decisionDate",
  "chamber",
  "fileNumber",
  "sourceUrl",
];

function sanitize(input = {}, { creating = false } = {}) {
  const data = {};
  const str = (k, max = 2000) => {
    if (!(k in input)) return null;
    const v = input[k];
    if (v === null || v === "") {
      data[k] = null;
      return null;
    }
    if (typeof v !== "string" || v.length > max) return `invalid ${k}`;
    data[k] = v.trim();
    return null;
  };
  for (const [k, max] of [
    ["court", 120],
    ["chamber", 120],
    ["fileNumber", 120],
    ["subjectMatter", 500],
    ["principle", 5000],
    ["fullTextAr", 500000],
    ["sourceUrl", 1000],
  ]) {
    const e = str(k, max);
    if (e) return { error: e };
  }
  if (creating || "decisionNumber" in input) {
    if (
      typeof input.decisionNumber !== "string" ||
      !input.decisionNumber.trim()
    )
      return { error: "decisionNumber is required" };
    data.decisionNumber = digits(input.decisionNumber).trim();
  }
  if (creating || "decisionDate" in input) {
    if (!isDateStr(input.decisionDate))
      return { error: "decisionDate must be YYYY-MM-DD" };
    data.decisionDate = new Date(`${input.decisionDate}T00:00:00Z`);
  }
  if (data.sourceUrl && !/^https?:\/\//.test(data.sourceUrl))
    return { error: "sourceUrl must be http(s)" };
  if (data.court === null) delete data.court; // keep the default court
  return { data, error: null };
}

const LawDecision = {
  list: async function ({ q } = {}) {
    const where = q ? { id: { in: searchDecisionIds(q) } } : {};
    return db().lawDecision.findMany({
      where,
      orderBy: { decisionDate: "desc" },
      take: 200,
    });
  },

  get: async function (id) {
    return db().lawDecision.findUnique({ where: { id } });
  },

  create: async function (input) {
    const { data, error } = sanitize(input, { creating: true });
    if (error) return { error };
    try {
      const d = await db().lawDecision.create({ data });
      indexDecision(d);
      return { decision: d, error: null };
    } catch (e) {
      if (e?.code === "P2002")
        return { error: "decision already exists (court + number + date)" };
      throw e;
    }
  },

  /**
   * PATCH. `verified: true` must come with the student having opened the official record; changing any
   * citation field afterwards clears verification (the old check no longer covers the new citation).
   */
  update: async function (id, input = {}) {
    const existing = await this.get(id);
    if (!existing) return { error: "not_found" };
    const { data, error } = sanitize(input);
    if (error) return { error };
    const citationChanged = CITATION_FIELDS.some(
      (k) => k in data && String(data[k] ?? "") !== String(existing[k] ?? "")
    );
    if ("verified" in input) {
      if (typeof input.verified !== "boolean")
        return { error: "invalid verified" };
      if (input.verified && !(data.sourceUrl ?? existing.sourceUrl))
        return { error: "add the official source URL before verifying" };
      data.verified = input.verified;
      data.verifiedAt = input.verified ? new Date() : null;
    } else if (citationChanged && existing.verified) {
      data.verified = false;
      data.verifiedAt = null;
    }
    try {
      const d = await db().lawDecision.update({ where: { id }, data });
      indexDecision(d);
      return { decision: d, error: null };
    } catch (e) {
      if (e?.code === "P2002")
        return { error: "decision already exists (court + number + date)" };
      throw e;
    }
  },
};

module.exports = { LawDecision };
