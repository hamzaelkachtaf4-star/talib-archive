// Grounding contract for every legal-reasoning AI call (spec §7.2). The AI is never a legal source:
// 1. retrieve evidence from the local corpus (cited ids + target qualifications + key-term FTS matches);
// 2. prompt with that evidence labelled by canonicalId, instructing the model to cite only those ids;
// 3. structured output with citation fields;
// 4. validate: unresolved ids (in citation fields, inline "[ID]" or bare "الفصل N") are REMOVED from the
//    text and listed; quotes not found verbatim (after normalization) are relabelled as paraphrase;
// 5. the validation result is logged on the LawAiCall row.
const { db } = require("./dbClient");
const { ftsDb } = require("./fts");
const {
  normalize,
  lightStem,
  normalizeCanonicalId,
  toWesternDigits,
} = require("./arabic");
const { LawCorpus } = require("../../models/lawCorpus");

const MAX_EVIDENCE = 14;
const EVIDENCE_CHARS = 1200;
const INLINE_ID = /\[([A-Za-z][A-Za-z0-9.-]*\s*:\s*[0-9A-Za-z؀-ۿ-]+)\]/g;
const BARE_ARTICLE =
  /(?:ال)?(?:فصل|مادة|المادة|الفصل)\s+([0-9٠-٩]+(?:-[0-9٠-٩]+)?)/g;
// Frequent function words that would only add noise to the key-term retrieval.
const STOP = new Set(
  "في من على الى عن ان او ثم هذا هذه ذلك التي الذي لا ما قد كان هو هي مع بين كل اذا عند وقد وان فان لم لن بعد قبل حيث كما".split(
    " "
  )
);

/** Key terms of the student's text for FTS retrieval: frequent non-stopword light stems. */
function keyTerms(text, max = 12) {
  const counts = new Map();
  for (const t of lightStem(normalize(text)).split(" ")) {
    if (t.length < 3 || STOP.has(t) || /^\d+$/.test(t)) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

/**
 * @param {{texts:string[], ids:string[], at?:Date}} input
 * @returns {Promise<{canonicalId:string, text:string, verifiedByUser:boolean}[]>}
 */
async function retrieveEvidence({ texts = [], ids = [], at = new Date(), scopeSlugs = null }) {
  // scopeSlugs (optional): only articles of these codes are eligible (the legal chat's selected references).
  const inScope = (canonicalId) => !scopeSlugs || scopeSlugs.includes(String(canonicalId).split(":")[0]);
  const evidence = new Map();
  const resolved = await LawCorpus.resolve([...new Set(ids)], at);
  for (const r of Object.values(resolved))
    if (r.exists && r.text && inScope(r.canonicalId))
      evidence.set(r.canonicalId, {
        canonicalId: r.canonicalId,
        text: r.text,
        verifiedByUser: r.verifiedByUser,
      });

  const terms = keyTerms(texts.join("\n"));
  if (terms.length && evidence.size < MAX_EVIDENCE) {
    let hits = [];
    try {
      hits = ftsDb()
        .prepare(
          "SELECT ref_id FROM law_fts_article_versions WHERE law_fts_article_versions MATCH ? ORDER BY rank LIMIT 40"
        )
        .all(
          `text_stemmed : (${terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ")})`
        );
    } catch {
      hits = [];
    }
    const versions = await db().lawArticleVersion.findMany({
      where: {
        id: { in: hits.map((h) => h.ref_id) },
        ...LawCorpus.validAt(at),
      },
      include: { article: { include: { code: true } } },
    });
    const byId = new Map(versions.map((v) => [v.id, v]));
    for (const h of hits) {
      const v = byId.get(h.ref_id);
      if (
        !v ||
        evidence.has(v.article.canonicalId) ||
        !inScope(v.article.canonicalId) ||
        (!LawCorpus.codeInForce(v.article.code, at) &&
          !ids.includes(v.article.canonicalId))
      )
        continue;
      evidence.set(v.article.canonicalId, {
        canonicalId: v.article.canonicalId,
        text: v.textAr,
        verifiedByUser: v.verifiedByUser,
      });
      if (evidence.size >= MAX_EVIDENCE) break;
    }
  }
  return [...evidence.values()];
}

/** Evidence block for the prompt. */
function evidenceBlock(evidence) {
  if (!evidence.length)
    return "لا توجد نصوص قانونية مسترجعة من المرجع المحلي. لا تستشهد بأي فصل أو مادة.";
  return [
    "النصوص القانونية المتاحة (استشهد بها فقط بمعرفاتها بين معقوفين، مثل [DOC:77]):",
    ...evidence.map(
      (e) => `[${e.canonicalId}]\n${e.text.slice(0, EVIDENCE_CHARS)}`
    ),
  ].join("\n\n");
}

/** Walk every string in a JSON value. */
function mapStrings(value, fn) {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)])
    );
  return value;
}

function collectIds(value, out = new Set()) {
  if (typeof value === "string")
    for (const m of value.matchAll(INLINE_ID)) out.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => collectIds(v, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (k === "canonicalId" && typeof v === "string") out.add(v);
      else collectIds(v, out);
    }
  return out;
}

/**
 * Validates and cleans a model output (spec §7.2 step 4).
 * @returns {Promise<{output: any, check: {resolved:string[], unresolved:string[], quoteMismatches:object[], strippedMentions:string[], banner:boolean}}>}
 */
async function validateOutput(output, { at = new Date() } = {}) {
  const rawIds = [...collectIds(output)];
  const resolution = await LawCorpus.resolve(rawIds, at);
  const ok = new Map(); // raw → canonical
  const unresolved = new Set();
  for (const raw of rawIds) {
    const r = resolution[raw];
    if (r?.exists) ok.set(raw, r);
    else unresolved.add(normalizeCanonicalId(raw) || raw);
  }
  const okNumbers = new Set(
    [...ok.values()].map((r) => r.canonicalId.split(":")[1])
  );
  const strippedMentions = new Set();
  const quoteMismatches = [];

  // 1. Citation objects: drop unresolved; relabel non-verbatim quotes as paraphrase.
  const fixCitations = (v) => {
    if (Array.isArray(v))
      return v.map(fixCitations).filter((x) => x !== undefined);
    if (v && typeof v === "object") {
      if (typeof v.canonicalId === "string") {
        const r = ok.get(v.canonicalId);
        if (!r) return undefined;
        const out = { ...v, canonicalId: r.canonicalId };
        if (typeof v.quote === "string" && v.quote.trim()) {
          const found =
            r.text && normalize(r.text).includes(normalize(v.quote));
          if (!found) {
            quoteMismatches.push({
              canonicalId: r.canonicalId,
              quote: v.quote,
            });
            out.paraphrase = v.quote;
            out.quote = null;
            out.quoteMismatch = true;
          }
        }
        return out;
      }
      return Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, fixCitations(x)])
          .filter(([, x]) => x !== undefined)
      );
    }
    return v;
  };
  let cleaned = fixCitations(output);

  // 2. Inline ids and bare article mentions inside prose.
  cleaned = mapStrings(cleaned, (s) =>
    s
      .replace(INLINE_ID, (m, id) =>
        ok.has(id) ? `[${ok.get(id).canonicalId}]` : ""
      )
      .replace(BARE_ARTICLE, (m, num) => {
        if (okNumbers.has(toWesternDigits(num))) return m;
        strippedMentions.add(m.trim());
        return "";
      })
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([،.,؛])/g, "$1")
  );

  const check = {
    resolved: [...new Set([...ok.values()].map((r) => r.canonicalId))],
    unresolved: [...unresolved],
    strippedMentions: [...strippedMentions],
    quoteMismatches,
    banner: unresolved.size > 0 || strippedMentions.size > 0,
  };
  return { output: cleaned, check };
}

module.exports = {
  retrieveEvidence,
  evidenceBlock,
  validateOutput,
  keyTerms,
  INLINE_ID,
};
