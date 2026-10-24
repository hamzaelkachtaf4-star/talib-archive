// Ranked corpus search (spec §6.4): article-number lookup > exact phrase on the original text >
// normalized phrase > light-stemmed terms. Semantic recall (embeddings) is optional and not enabled.
// Results are filtered to versions valid at the requested date and to the codes in force then.
const { db } = require("./dbClient");
const { ftsDb, registerFtsIndexer } = require("./fts");
const { normalize, lightStem, toWesternDigits } = require("./arabic");

const TIERS = { number: 0, exact: 1, normalized: 2, stemmed: 3 };
const LIMIT = 30;

/** FTS5 phrase literal: double any quote inside. */
const phrase = (s) => `"${String(s).replace(/"/g, '""')}"`;

function indexArticleVersion(version, canonicalId) {
  const fts = ftsDb();
  const norm = normalize(version.textAr);
  fts
    .prepare("DELETE FROM law_fts_article_versions WHERE ref_id = ?")
    .run(version.id);
  fts
    .prepare(
      "INSERT INTO law_fts_article_versions (ref_id, canonical_id, text_original, text_normalized, text_stemmed) VALUES (?, ?, ?, ?, ?)"
    )
    .run(version.id, canonicalId, version.textAr, norm, lightStem(norm));
}

function indexDecision(d) {
  const fts = ftsDb();
  const text = [d.subjectMatter, d.principle, d.fullTextAr]
    .filter(Boolean)
    .join("\n");
  const norm = normalize(text);
  fts.prepare("DELETE FROM law_fts_decisions WHERE ref_id = ?").run(d.id);
  fts
    .prepare(
      "INSERT INTO law_fts_decisions (ref_id, decision_key, text_original, text_normalized, text_stemmed) VALUES (?, ?, ?, ?, ?)"
    )
    .run(d.id, `${d.court}:${d.decisionNumber}`, text, norm, lightStem(norm));
}

// Full rebuild support (POST /api/law/admin/rebuild-index).
registerFtsIndexer("law_fts_article_versions", async () => {
  const versions = await db().lawArticleVersion.findMany({
    include: { article: { select: { canonicalId: true } } },
  });
  for (const v of versions) indexArticleVersion(v, v.article.canonicalId);
});
registerFtsIndexer("law_fts_decisions", async () => {
  for (const d of await db().lawDecision.findMany()) indexDecision(d);
});

/** "الفصل 77", "المادة ٨٨-١", "art. 5 bis", "77" → { number, label } or null. */
function parseNumberQuery(q) {
  const n = normalize(q);
  const m =
    /^(?:(ال)?(فصل|ماده|article|art)\s*)?(\d+(?:-\d+)?)(?:\s*-?\s*(مكرر|bis|ter))?$/.exec(
      n
    );
  if (!m) return null;
  const label = m[2] === "فصل" ? "الفصل" : m[2] === "ماده" ? "المادة" : null;
  return {
    number: m[4] ? `${m[3]}-${m[4] === "bis" ? "مكرر" : m[4]}` : m[3],
    label,
  };
}

function ftsHits(column, query) {
  try {
    return ftsDb()
      .prepare(
        `SELECT ref_id, rank FROM law_fts_article_versions WHERE law_fts_article_versions MATCH ? ORDER BY rank LIMIT 200`
      )
      .all(`${column} : ${query}`);
  } catch {
    return []; // malformed FTS query from odd input: treat as no match
  }
}

/**
 * @param {{q:string, codes: object[], at: Date}} params codes = resolved LawCode rows to search
 */
async function searchArticles({ q, codes, at }) {
  const query = String(q || "").trim();
  if (!query || !codes.length) return [];
  const codeIds = new Set(codes.map((c) => c.id));
  const best = new Map(); // canonicalId → result

  const consider = (version, tier, score) => {
    const a = version.article;
    if (!codeIds.has(a.codeId)) return;
    if (
      !(version.validFrom <= at && (!version.validTo || version.validTo > at))
    )
      return;
    const prev = best.get(a.canonicalId);
    if (
      prev &&
      (prev.tier < tier || (prev.tier === tier && prev.score <= score))
    )
      return;
    best.set(a.canonicalId, {
      canonicalId: a.canonicalId,
      codeSlug: a.code.slug,
      codeTitle: a.code.titleAr,
      articleNumber: a.articleNumber,
      numberingLabel: a.code.numberingLabel,
      headingPath: JSON.parse(a.headingPath || "[]"),
      versionId: version.id,
      validFrom: version.validFrom,
      validTo: version.validTo,
      verifiedByUser: version.verifiedByUser,
      snippet: version.textAr.slice(0, 220),
      tier,
      tierName: Object.keys(TIERS)[tier],
      score,
    });
  };

  // Tier 0: article number, preferring codes whose numbering label matches ("الفصل" vs "المادة").
  const num = parseNumberQuery(query);
  if (num) {
    const articles = await db().lawArticle.findMany({
      where: { articleNumber: num.number, codeId: { in: [...codeIds] } },
      include: { code: true, versions: true },
    });
    for (const a of articles)
      for (const v of a.versions)
        consider(
          { ...v, article: a },
          TIERS.number,
          num.label && a.code.numberingLabel !== num.label ? 1 : 0
        );
  }

  // Tiers 1-3 via FTS.
  const norm = normalize(query);
  const original = toWesternDigits(query)
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .trim();
  const stemTerms = lightStem(norm).split(" ").filter(Boolean);
  const passes = [
    [TIERS.exact, original ? ftsHits("text_original", phrase(original)) : []],
    [TIERS.normalized, norm ? ftsHits("text_normalized", phrase(norm)) : []],
    [
      TIERS.stemmed,
      stemTerms.length
        ? ftsHits("text_stemmed", `(${stemTerms.map(phrase).join(" AND ")})`)
        : [],
    ],
  ];
  const ids = [
    ...new Set(passes.flatMap(([, hits]) => hits.map((h) => h.ref_id))),
  ];
  if (ids.length) {
    const versions = await db().lawArticleVersion.findMany({
      where: { id: { in: ids } },
      include: { article: { include: { code: true } } },
    });
    const byId = new Map(versions.map((v) => [v.id, v]));
    for (const [tier, hits] of passes)
      for (const h of hits)
        byId.has(h.ref_id) && consider(byId.get(h.ref_id), tier, h.rank);
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.score - b.score ||
        a.articleNumber.localeCompare(b.articleNumber, "en", { numeric: true })
    )
    .slice(0, LIMIT);
}

/** Decision ids matching a query (normalized phrase, then stemmed terms). */
function searchDecisionIds(q) {
  const norm = normalize(q);
  if (!norm) return [];
  const terms = lightStem(norm).split(" ").filter(Boolean);
  const run = (expr) => {
    try {
      return ftsDb()
        .prepare(
          "SELECT ref_id FROM law_fts_decisions WHERE law_fts_decisions MATCH ? ORDER BY rank LIMIT 100"
        )
        .all(expr)
        .map((r) => r.ref_id);
    } catch {
      return [];
    }
  };
  return [
    ...new Set([
      ...run(`text_normalized : ${phrase(norm)}`),
      ...run(`text_stemmed : (${terms.map(phrase).join(" AND ")})`),
    ]),
  ];
}

module.exports = {
  searchArticles,
  searchDecisionIds,
  indexArticleVersion,
  indexDecision,
  parseNumberQuery,
  TIERS,
};
