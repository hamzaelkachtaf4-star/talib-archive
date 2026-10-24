// Doctrine references (spec §3.2, §12 copyright): author/work/edition/page + the student's own
// paraphrase. Only a short quote is allowed; whole books are never stored.
const { db } = require("../utils/law/dbClient");

const MAX_QUOTE = 300;

function sanitize(input = {}, { creating = false } = {}) {
  const data = {};
  for (const [k, max, required] of [
    ["author", 200, true],
    ["work", 300, true],
    ["edition", 100, false],
    ["page", 50, false],
    ["paraphrase", 5000, true],
    ["shortQuote", MAX_QUOTE, false],
  ]) {
    if (!(k in input)) {
      if (creating && required) return { error: `${k} is required` };
      continue;
    }
    const v = input[k];
    if ((v === null || v === "") && !required) {
      data[k] = null;
      continue;
    }
    if (typeof v !== "string" || !v.trim())
      return { error: `${k} is required` };
    if (v.length > max)
      return {
        error:
          k === "shortQuote"
            ? `quotes are limited to ${MAX_QUOTE} characters (copyright)`
            : `${k} too long`,
      };
    data[k] = v.trim();
  }
  if ("year" in input) {
    if (
      input.year !== null &&
      (!Number.isInteger(input.year) || input.year < 1800 || input.year > 2100)
    )
      return { error: "invalid year" };
    data.year = input.year;
  }
  return { data, error: null };
}

const LawDoctrine = {
  MAX_QUOTE,
  list: async function ({ q } = {}) {
    const where = q
      ? {
          OR: [
            { author: { contains: q } },
            { work: { contains: q } },
            { paraphrase: { contains: q } },
          ],
        }
      : {};
    return db().lawDoctrineRef.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  },
  create: async function (input) {
    const { data, error } = sanitize(input, { creating: true });
    if (error) return { error };
    return {
      doctrine: await db().lawDoctrineRef.create({ data }),
      error: null,
    };
  },
  update: async function (id, input) {
    const { data, error } = sanitize(input);
    if (error) return { error };
    try {
      return {
        doctrine: await db().lawDoctrineRef.update({ where: { id }, data }),
        error: null,
      };
    } catch {
      return { error: "not_found" };
    }
  },
};

module.exports = { LawDoctrine };
