// Legal knowledge graph: deterministic cross-reference extraction + the per-student offline bundle.
// No AI anywhere in here. Every edge endpoint must resolve to a LawArticle (CLAUDE.md rule 4, brain L-0005);
// anything that does not resolve is dropped and only counted. Only reviewed concepts/pairs/codes reach students.
const crypto = require("crypto");
const { db, rawDb } = require("./dbClient");
const { normalize, normalizeCanonicalId } = require("./arabic");

const SUMMARY_CHARS = 140;
const SCAN_BATCH = 300;
// Codes whose numbering replaced an older code's (CPP 22.01 replaced the 1959 CPP). A text from another code citing
// "المسطرة الجنائية" may mean the old numbering, so such cross-code edges are dropped rather than guessed.
const NUMBERING_REPLACED = new Set(["CPP"]);
const RELATIONS = ["references", "applies", "interprets", "confirms", "reverses", "contradicts", "cites", "divergesFrom"];

// ── Guided tours: outlines only. Statute text always comes from the corpus; a step whose target is
// missing (or whose concept/pair is not yet reviewed) is dropped at compile time.
const TOURS = [
  {
    id: "tort-liability",
    titleAr: "مسار المسؤولية التقصيرية",
    steps: [
      { kind: "article", canonicalId: "DOC:77", promptAr: "اقرأ النص: ما الذي يترتب على من يرتكب الفعل الضار، ومتى؟" },
      { kind: "article", canonicalId: "DOC:78", promptAr: "ما الذي يضيفه هذا النص إلى سابقه بشأن الخطأ والإهمال؟" },
      { kind: "article", canonicalId: "DOC:85", promptAr: "من يسأل عن الأشياء التي في حراسته؟ حدّد شروط ذلك من النص." },
      { kind: "pair", conceptA: "responsabilite-contractuelle", conceptB: "responsabilite-delictuelle", promptAr: "قارن بين المسؤوليتين: متى تُطبَّق كل واحدة؟" },
    ],
  },
  {
    id: "contract-nullity",
    titleAr: "مسار بطلان العقد وإبطاله",
    steps: [
      { kind: "article", canonicalId: "DOC:306", promptAr: "اقرأ النص وحدّد الحالة التي يتناولها، ومن يحق له التمسك بها." },
      { kind: "article", canonicalId: "DOC:311", promptAr: "ما الفرق بين هذا النص والنص السابق من حيث الأثر؟" },
      { kind: "pair", conceptA: "nullite-absolue", conceptB: "annulabilite", promptAr: "لخّص الفرق بين البطلان والإبطال بمعايير من النصوص السابقة." },
    ],
  },
];

// ── Reference extraction ──────────────────────────────────────────────────────────────────────────
// Matching runs on normalize()d text (digits western, hamza/ta-marbuta folded, punctuation dropped),
// so every pattern below is written in normalized form.
const THIS_LAW = /^(?:هذا القانون|هذه المجموعه|هذه المدونه|هذا الظهير|هذا النظام)(?!\S)/;
const KNOWN_CODES = [
  ["DOC", /^(?:ق ل ع|قانون الالتزامات والعقود|ظهير الالتزامات والعقود)(?!\S)/],
  ["CP", /^(?:مجموعه القانون الجنائي|القانون الجنائي)(?!\S)/],
  ["CPP", /^(?:قانون المسطره الجنائيه|المسطره الجنائيه|ق م ج)(?!\S)/],
  ["CPC", /^(?:قانون المسطره المدنيه|ق م م)(?!\S)/],
  ["CCOM", /^مدونه التجاره(?!\S)/],
  ["MOUDAWANA", /^مدونه الاسره(?!\S)/],
  ["CT", /^مدونه الشغل(?!\S)/],
];
// A phrase that names some text (with or without the article "ال"): if it is not a known code the reference is dropped.
const LAW_LIKE = /^(?:ال)?(?:قانون|مدونه|مجموعه|دستور|ظهير|مرسوم|نظام|قرار|مسطره|ق(?!\S))/;
// Range / continuation markers: the target of the reference is then not the plain article that was named.
const CONTINUATION = /(?:^|\s)(?:وما\s+(?:يلي\S*|بعد\S*)|الي|اعلاه|المذكور\S*|المشار\s+اليه\S*)(?=\s|$)/;
const NUM_CORE = "\\d{1,5}(?:\\s*-\\s*\\d{1,5})?(?:\\s+مكرر(?:\\s+\\d{1,2})?)?";
const NUM = `${NUM_CORE}(?!\\d)`;
const KEYWORD = "[وفبك]?(?:ال|لل)(?:فصلين|فصلان|فصول|فصل|مادتين|مادتان|مواد|ماده)";
const HEAD = new RegExp(`(?<![\\u0600-\\u06ff])${KEYWORD}\\s+(${NUM})((?:\\s*و\\s*${NUM_CORE}(?!\\d))*)`, "g");
const NEXT_REF = new RegExp(`(?<![\\u0600-\\u06ff])${KEYWORD}\\s+\\d`);
const WINDOW_TOKENS = 6;

/** "88 مكرر" and "88-1" in the stored canonical form (spaces become hyphens, see normalizeCanonicalId). */
function canonical(slug, num) {
  return normalizeCanonicalId(`${slug}:${num.trim().replace(/\s+/g, " ")}`);
}

/**
 * Explicit article references in a statute's text. Returns [{ canonicalId, codeSlug, number }] without checking the
 * corpus (the caller validates). `codeSlug` is a family token ("CPC") when the text says "قانون المسطرة المدنية".
 * Grounding first, recall second: a reference is dropped when it names some other text (الدستور, القانون رقم …), when a
 * range or continuation ("وما يليها", "إلى المادة") makes the target ambiguous (unless a known code is named, then the
 * first article is kept), or when its number carries a spaced
 * hyphen (the ingest reverses "574-2" into "2 - 574").
 */
function extractExplicitReferences(text, currentCodeSlug, { selfCanonicalId = null } = {}) {
  if (typeof text !== "string" || !text) return [];
  const t = normalize(text);
  const seen = new Set();
  const out = [];
  HEAD.lastIndex = 0;
  let m;
  while ((m = HEAD.exec(t))) {
    // the words after the reference, up to the next reference or a few tokens
    let window = t.slice(HEAD.lastIndex);
    const nextRef = NEXT_REF.exec(window);
    if (nextRef) window = window.slice(0, nextRef.index);
    window = window.trim().split(/\s+/).slice(0, WINDOW_TOKENS).join(" ");
    let slug = currentCodeSlug;
    let qualified = false;
    let drop = false;
    // the first من/في that names a text decides; a في that does not (في فقرتها …) is skipped over
    for (const q of window.matchAll(/(?:^|\s)(من|في)(?=\s)/g)) {
      const phrase = window.slice(q.index + q[0].length).trim();
      if (THIS_LAW.test(phrase)) { qualified = true; break; }
      const known = KNOWN_CODES.find(([, re]) => re.test(phrase));
      if (known) { slug = known[0]; qualified = true; break; }
      if (q[1] === "من" || LAW_LIKE.test(phrase)) { drop = true; break; } // names some other text: never guess
    }
    if (drop) continue;
    if (!qualified && CONTINUATION.test(window)) continue;
    const numbers = [m[1], ...[...m[2].matchAll(new RegExp(NUM_CORE, "g"))].map((x) => x[0])];
    for (const n of numbers) {
      if (/\d\s+-|-\s+\d/.test(n)) continue; // reversed hyphenated number: ambiguous
      const id = canonical(slug, n);
      if (!id || id === selfCanonicalId || seen.has(id)) continue;
      seen.add(id);
      out.push({ canonicalId: id, codeSlug: slug, number: n.trim() });
    }
  }
  return out;
}

function summarize(text, max = SUMMARY_CHARS) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = cut.lastIndexOf(" ");
  return `${i > max / 2 ? cut.slice(0, i) : cut}…`;
}

const parse = (s, fb) => {
  try {
    const v = s ? JSON.parse(s) : fb;
    return v ?? fb;
  } catch {
    return fb;
  }
};
const currentVersion = (now = new Date()) => ({ validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] });

// ── Corpus-wide explicit edges, cached per corpus state ───────────────────────────────────────────
let explicitCache = null; // { key, edges: [[from, to]], dropped, scanned }

async function corpusKey() {
  const agg = await db().lawArticleVersion.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
  const codes = await db().lawCode.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
  return `${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}:${codes._count._all}:${codes._max.updatedAt?.getTime() ?? 0}`;
}

/**
 * Family token -> the single code of that family ("CPC" only works while CPC has one code). When a family has several codes
 * (CPC-1974 and CPC-58.25 number their articles differently) the era of the citing text is unknowable, so null: the edge is dropped.
 */
function familyResolver(allCodes) {
  const slugs = new Set(allCodes.map((c) => c.slug));
  return (token) => {
    if (slugs.has(token)) return token;
    const inFamily = allCodes.filter((c) => c.family === token);
    return inFamily.length === 1 ? inFamily[0].slug : null;
  };
}

async function explicitEdges() {
  const key = await corpusKey();
  if (explicitCache?.key === key) return explicitCache;
  const codes = (await db().lawCode.findMany({ where: { reviewed: true }, select: { id: true, slug: true, family: true, status: true } }));
  const codeById = new Map(codes.map((c) => [c.id, c.slug]));
  const resolveSlug = familyResolver(await db().lawCode.findMany({ select: { slug: true, family: true } }));
  const known = new Set();
  const candidates = [];
  const now = new Date();
  let cursor;
  let scanned = 0;
  for (;;) {
    const rows = await db().lawArticle.findMany({
      where: { codeId: { in: [...codeById.keys()] } },
      orderBy: { id: "asc" },
      take: SCAN_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, canonicalId: true, codeId: true, versions: { where: currentVersion(now), orderBy: { validFrom: "desc" }, take: 1, select: { textAr: true } } },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const a of rows) {
      known.add(a.canonicalId);
      scanned += 1;
      const text = a.versions[0]?.textAr;
      if (!text) continue;
      const slug = codeById.get(a.codeId);
      for (const r of extractExplicitReferences(text, slug, { selfCanonicalId: a.canonicalId })) {
        let target = r.codeSlug === slug ? slug : resolveSlug(r.codeSlug);
        if (target !== slug && NUMBERING_REPLACED.has(target)) target = null;
        candidates.push([a.canonicalId, target ? canonical(target, r.number) : null]);
      }
    }
  }
  const edges = [];
  let dropped = 0;
  for (const [from, to] of candidates) {
    if (to && known.has(to) && to !== from) edges.push([from, to]);
    else dropped += 1;
  }
  explicitCache = { key, edges, dropped, scanned };
  return explicitCache;
}

// ── Bundle ────────────────────────────────────────────────────────────────────────────────────────
async function conceptsAndPairs() {
  const concepts = await rawDb().lawConcept.findMany({ where: { reviewed: true }, orderBy: { slug: "asc" } });
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const pairs = (await rawDb().lawConfusionPair.findMany({ where: { reviewed: true }, orderBy: { id: "asc" } })).filter((p) => byId.has(p.conceptAId) && byId.has(p.conceptBId));
  return { concepts, pairs };
}

/**
 * The compact graph a student downloads for offline use. Run inside the student's request context: their own
 * LawLink rows are included, other students' rows never are.
 */
async function compileLegalGraphBundle() {
  const [{ edges: explicit, dropped, scanned }, { concepts, pairs }] = await Promise.all([explicitEdges(), conceptsAndPairs()]);
  const edges = [];
  const seenEdge = new Set();
  const push = (e) => {
    const k = `${e.k}|${e.s}|${e.t}|${e.r || ""}`;
    if (!seenEdge.has(k)) { seenEdge.add(k); edges.push(e); }
  };

  // verified links (the student's own, article -> article only)
  const links = await db().lawLink.findMany({ where: { fromType: "article", toType: "article" }, orderBy: { id: "asc" } });
  const linkArts = await db().lawArticle.findMany({ where: { id: { in: [...new Set(links.flatMap((l) => [l.fromId, l.toId]))] } }, select: { id: true, canonicalId: true } });
  const canonOf = new Map(linkArts.map((a) => [a.id, a.canonicalId]));
  for (const l of links) {
    const s = canonOf.get(l.fromId), t = canonOf.get(l.toId);
    if (s && t && RELATIONS.includes(l.relation)) push({ s, t, k: "link", r: l.relation, ...(l.note ? { note: l.note } : {}) });
  }
  const verifiedPairs = new Set(edges.map((e) => `${e.s}|${e.t}`));
  for (const [s, t] of explicit) if (!verifiedPairs.has(`${s}|${t}`)) push({ s, t, k: "explicit", r: "references", x: true });

  // concept -> article via reviewed legalRefs; the target must exist
  const refIds = [...new Set(concepts.flatMap((c) => parse(c.legalRefs, []).map((r) => normalizeCanonicalId(`${r?.slug}:${r?.number}`)).filter(Boolean)))];
  const existing = new Set((await db().lawArticle.findMany({ where: { canonicalId: { in: refIds } }, select: { canonicalId: true } })).map((a) => a.canonicalId));
  for (const c of concepts)
    for (const r of parse(c.legalRefs, [])) {
      const id = normalizeCanonicalId(`${r?.slug}:${r?.number}`);
      if (id && existing.has(id)) push({ s: `c:${c.slug}`, t: id, k: "concept" });
    }
  for (const p of pairs) {
    const a = concepts.find((c) => c.id === p.conceptAId), b = concepts.find((c) => c.id === p.conceptBId);
    push({ s: `c:${a.slug}`, t: `c:${b.slug}`, k: "pair", pair: p.id });
  }

  // tours: resolve against the corpus; unresolved steps are dropped
  const conceptSlugs = new Set(concepts.map((c) => c.slug));
  const pairBySlugs = new Map(pairs.map((p) => {
    const a = concepts.find((c) => c.id === p.conceptAId).slug, b = concepts.find((c) => c.id === p.conceptBId).slug;
    return [[a, b].sort().join("|"), p];
  }));
  const tourIds = TOURS.flatMap((t) => t.steps.filter((s) => s.kind === "article").map((s) => s.canonicalId));
  const now = new Date();
  const wanted = new Set([...tourIds, ...edges.filter((e) => e.k !== "pair").flatMap((e) => [e.s, e.t]).filter((id) => !id.startsWith("c:"))]);
  const articleRows = [];
  const ids = [...wanted];
  for (let i = 0; i < ids.length; i += 500)
    articleRows.push(...(await db().lawArticle.findMany({
      where: { canonicalId: { in: ids.slice(i, i + 500) }, code: { reviewed: true } },
      select: { canonicalId: true, articleNumber: true, headingPath: true, code: { select: { slug: true, titleAr: true, numberingLabel: true, normLevel: true } }, versions: { where: currentVersion(now), orderBy: { validFrom: "desc" }, take: 1, select: { textAr: true } } },
    })));
  const art = new Map(articleRows.map((a) => [a.canonicalId, a]));
  const tours = TOURS.map((t) => ({
    id: t.id,
    titleAr: t.titleAr,
    steps: t.steps.flatMap((s) => {
      if (s.kind === "article") {
        const a = art.get(s.canonicalId);
        return a?.versions[0] ? [{ kind: "article", id: s.canonicalId, promptAr: s.promptAr, text: a.versions[0].textAr }] : [];
      }
      if (s.kind === "concept") return conceptSlugs.has(s.slug) ? [{ kind: "concept", id: `c:${s.slug}`, promptAr: s.promptAr }] : [];
      const p = pairBySlugs.get([s.conceptA, s.conceptB].sort().join("|"));
      return p ? [{ kind: "pair", id: `p:${p.id}`, promptAr: s.promptAr }] : [];
    }),
  })).filter((t) => t.steps.length >= 2);

  const keep = new Set(edges.flatMap((e) => [e.s, e.t]));
  for (const t of tours) for (const s of t.steps) keep.add(s.id);
  const nodes = [];
  for (const a of articleRows) {
    if (!keep.has(a.canonicalId) && !tourIds.includes(a.canonicalId)) continue;
    nodes.push({ id: a.canonicalId, type: "article", code: a.code.slug, codeTitleAr: a.code.titleAr, label: a.code.numberingLabel, n: a.articleNumber, level: a.code.normLevel, headingPath: parse(a.headingPath, []), summary: summarize(a.versions[0]?.textAr) });
  }
  for (const c of concepts) nodes.push({ id: `c:${c.slug}`, type: "concept", slug: c.slug, titleAr: c.titleAr, titleFr: c.titleFr, domain: c.domain, conceptId: c.id });
  for (const p of pairs) nodes.push({ id: `p:${p.id}`, type: "pair", pairId: p.id, labelAr: p.labelAr, a: `c:${concepts.find((c) => c.id === p.conceptAId).slug}`, b: `c:${concepts.find((c) => c.id === p.conceptBId).slug}` });
  const nodeSet = new Set(nodes.map((n) => n.id));
  const finalEdges = edges.filter((e) => nodeSet.has(e.s) && nodeSet.has(e.t));
  return { version: 1, nodes, edges: finalEdges, tours, stats: { scannedArticles: scanned, droppedRefs: dropped } };
}

/** Strong ETag over the payload, bound to the student (their own links are part of it). */
function bundleEtag(bundle, userId) {
  return `"${crypto.createHash("sha1").update(`${userId}:${JSON.stringify(bundle)}`).digest("hex").slice(0, 24)}"`;
}

/** Admin: candidate LawLink rows from explicit citations. Propose only; nothing is written. */
async function proposeAutoLinks({ limit = 200 } = {}) {
  const { edges, dropped, scanned } = await explicitEdges();
  const own = await db().lawLink.findMany({ where: { fromType: "article", toType: "article", relation: "references" }, select: { fromId: true, toId: true } });
  const ownArts = await db().lawArticle.findMany({ where: { id: { in: [...new Set(own.flatMap((l) => [l.fromId, l.toId]))] } }, select: { id: true, canonicalId: true } });
  const canonOf = new Map(ownArts.map((a) => [a.id, a.canonicalId]));
  const have = new Set(own.map((l) => `${canonOf.get(l.fromId)}|${canonOf.get(l.toId)}`));
  const max = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const fresh = edges.filter(([s, t]) => !have.has(`${s}|${t}`));
  return {
    proposals: fresh.slice(0, max).map(([from, to]) => ({ from, to, relation: "references", explicit: true })),
    totalNew: fresh.length,
    alreadyLinked: edges.length - fresh.length,
    droppedUnresolved: dropped,
    scannedArticles: scanned,
  };
}

function resetGraphCache() {
  explicitCache = null;
}

module.exports = { extractExplicitReferences, summarize, compileLegalGraphBundle, bundleEtag, proposeAutoLinks, resetGraphCache, TOURS, RELATIONS };
