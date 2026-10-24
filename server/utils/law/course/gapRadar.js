// Gap radar scoring: compares a student's course topics with statute articles and ranks what the notes miss.
// Pure functions over plain objects (no database, no model call): deterministic, free, and testable. The AI is
// never asked whether a gap exists; it can only be asked later to phrase a drill about an article that exists.
//
//   article { id, canonicalId, slug, number, headingPath: string[], text }
//   topic   { id, title, headingPath: string[], text, emphasisRatio }
//
// Method: an article is COVERED when its distinctive terms (idf-weighted, from the corpus itself) appear together in
// one topic, or when a topic cites its number and shares some of its wording. Gaps are reported only where the
// notes demonstrably work (a section whose heading matches a topic, or where covered articles are in the
// majority of a quarter or more), plus whole sections skipped next to a section the notes do cover.
const path = require("path");
const { normalize, lightStem, toWesternDigits } = require("../arabic");

const COVER_OK = 0.35; // coverage at or above this = the notes address the article
const TOUCHED_SHARE = 0.25; // share of covered articles that makes a section "touched" by the notes
const KEY_TERMS = 10;
const MIN_KEY_TERMS = 2; // an article with fewer distinctive words cannot be matched, so it is never reported
const MAX_GAPS = 60;
const MIN_OVERLAP_WITH_NUMBER = 0.15;
const QUOTE_CHARS = 600;
const EMPHASIS_FACTOR = 1.25;
const EMPHASIS_AT = 0.1;
const PARTIAL_DEFICIT = 0.7; // a note that covers the article but lacks its rule keeps most of the severity
// Bounds: the analysis runs over whatever a student imported, so every dimension has a ceiling.
const MAX_TOPICS = 5000;
const MAX_TOPIC_TEXT = 20000; // characters of one topic that are read
const MAX_ARTICLE_TEXT = 6000;
const MAX_TOPIC_TERMS = 3000;

const STOP = new Set(
  ("في من على الي عن ان او ثم هذا هذه ذلك التي الذي الذين لا ما قد كان كانت يكون تكون هو هي مع بين كل اذا عند بعد قبل حيث كما لم لن " +
    "ماده فصل يجب يجوز يشترط يعتبر وفق طبقا مقتضيات احكام قانون بمقتضي كذلك وذلك فيما اي ايه").split(" ")
);
// Heading words that carry no topic ("الكتاب الأول"): a heading made only of these is judged by coverage alone.
const ORDINALS = new Set(
  ("كتاب باب قسم فرع فصل مبحث جزء عنوان مطلب فقره اول ثاني ثالث رابع خامس سادس سابع ثامن تاسع عاشر تمهيدي").split(" ")
);

// All patterns run on NORMALIZED text (ة -> ه, أ/آ/إ -> ا, no diacritics) and use unicode letter boundaries:
// JS \b only sees ASCII word characters, so it never matches next to Arabic letters.
const B = "(?<!\\p{L})"; // not preceded by a letter
const E = "(?!\\p{L})"; // not followed by a letter
const PREFIX = "(?:[وف]?[بل]?)(?:ال)?"; // و/ف + ب/ل + ال, as in بمضي، والأجل
const UNITS = "(?:يوم|يوما|ايام|اسبوع|اسابيع|شهر|شهرا|اشهر|سنه|سنتين|سنوات|سنين)";
const NUMBER_WORDS = "(?:ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره|عشرين|ثلاثين|اربعين|خمسين|ستين|\\d+)";
const re = (src) => new RegExp(src, "u");
const FEATURES = {
  deadline: re(
    `${B}${PREFIX}(?:اجل|اجال|مده|مدد|مرور|مضي)${E}|${B}[يت]?تقادم${E}|${B}[يت]سقط${E}|${B}سقوط${E}|${B}${NUMBER_WORDS}\\s+${UNITS}${E}|${B}خلال\\s+\\S+\\s+${UNITS}${E}`
  ),
  sanction: re("باطل|بطلان|يبطل|عقوب|غرامه|حبس|فسخ|جزاء|يعاقب|تعويض|لا\\s+يحتج"),
  condition: re("يشترط|شروط|يجب|لا\\s+يجوز|لا\\s+يصح|لا\\s+يكون|لا\\s+تقبل"),
  exception: re("غير\\s+انه|استثناء|الا\\s+اذا|الا\\s+ان|ما\\s+لم"),
  definition: re("يقصد\\s+ب|يعتبر|تعريف|هو\\s+كل|هي\\s+كل"),
};
// "in order to" is not a deadline.
const NOT_DEADLINE = re(`${B}(?:من\\s+اجل|لاجل\\S*)`);
const WEIGHTS = { base: 1, deadline: 3, sanction: 2, condition: 1.5, exception: 1, pair: 2, decisionsCap: 2 };
const KIND_ORDER = [
  ["deadline", "PRESCRIPTION"],
  ["sanction", "SANCTION"],
  ["condition", "CONDITIONS"],
  ["exception", "EXCEPTION"],
  ["definition", "DEFINITION"],
];
const KIND_LABEL = {
  PRESCRIPTION: "يحدد أجلا أو تقادما",
  SANCTION: "يرتب جزاء (بطلانا أو عقوبة أو تعويضا)",
  CONDITIONS: "يضع شروطا أو التزامات",
  EXCEPTION: "يتضمن استثناء",
  DEFINITION: "يعرّف مفهوما",
  OTHER: "يتناول حكما",
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Feature booleans from already NORMALIZED text. */
function featuresOfNormalized(t) {
  const d = t.replace(new RegExp(NOT_DEADLINE.source, "gu"), " ");
  return {
    deadline: FEATURES.deadline.test(d),
    sanction: FEATURES.sanction.test(t),
    condition: FEATURES.condition.test(t),
    exception: FEATURES.exception.test(t),
    definition: FEATURES.definition.test(t),
  };
}

/** { deadline, sanction, condition, exception, definition } booleans from the article's own wording. */
function articleFeatures(textAr) {
  return featuresOfNormalized(normalize(textAr));
}

/** Light stems of the words that carry meaning, from already normalized text. */
function termsOfNormalized(n) {
  return lightStem(n)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/\d/.test(t));
}

/** Light stems of the words that carry meaning (no stop words, no digits, 3+ letters). */
function termsOf(text) {
  return termsOfNormalized(normalize(toWesternDigits(text)));
}

/** 0..10. Zero when the article is covered, unless `partial`: the topic exists but lacks the article's rule. */
function severityOf({ signals = {}, coverage = 0, partial = false, pair = false, decisions = 0, emphasis = 0 }) {
  if (coverage >= COVER_OK && !partial) return 0;
  const w =
    WEIGHTS.base +
    (signals.deadline ? WEIGHTS.deadline : 0) +
    (signals.sanction ? WEIGHTS.sanction : 0) +
    (signals.condition ? WEIGHTS.condition : 0) +
    (signals.exception ? WEIGHTS.exception : 0) +
    (pair ? WEIGHTS.pair : 0) +
    Math.min(WEIGHTS.decisionsCap, Math.log1p(decisions));
  const deficit = partial ? PARTIAL_DEFICIT : 1 - coverage;
  const s = w * deficit * (emphasis >= EMPHASIS_AT ? EMPHASIS_FACTOR : 1);
  return Math.round(clamp(s, 0, 10) * 100) / 100;
}

/** "88 مكرر" / "88 - مكرر" / "٨٨-١" -> one comparable form. */
function canonNumber(raw) {
  return normalize(toWesternDigits(String(raw)))
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "-");
}

const CITATION = /(?:ماده|مواد|فصل|فصول)\s*(\d+(?:\s*-\s*\d+|\s+مكرر(?:\s+\d+)?)?(?:\s*(?:و|،|,)\s*\d+(?:\s*-\s*\d+|\s+مكرر)?)*)/gu;
// "من مدونة الشغل": the words after the type of text (مدونة / قانون / ظهير ...) name the code.
const NAMES_A_CODE = /^\s*(?:من|ب)\s+(?:ال)?(?:قانون|مدونه|ظهير|دستور|مسطره|نظام)\S*\s+(\S+(?:\s+\S+)?)/u;
const CODE_TYPE_STEMS = new Set(termsOfNormalized(normalize("مدونة قانون ظهير دستور مسطرة نظام")));

const NUMBER_VALUE = { ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10, عشرين: 20, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60 };
const UNIT_CLASS = { يوم: "d", يوما: "d", ايام: "d", يومين: "d", اسبوع: "w", اسابيع: "w", شهر: "m", شهرا: "m", اشهر: "m", شهرين: "m", سنه: "y", سنتين: "y", سنوات: "y", سنين: "y" };
const DUAL = { يومين: 2, شهرين: 2, سنتين: 2 };
const PERIOD_NUMBERED = new RegExp(`${B}(${NUMBER_WORDS})\\s+(${UNITS})${E}`, "gu");
const PERIOD_DUAL = new RegExp(`${B}(يومين|شهرين|سنتين)${E}`, "gu");
const PERIOD_SINGLE = new RegExp(`${B}(?:مرور|مضي|بمرور|بمضي|خلال)\\s+(سنه|شهر|يوم|اسبوع)${E}`, "gu");

/** The periods an article or a note states, as "3m" (3 months), "1y"...: a note must state THE period, not any period. */
function periodsOf(n) {
  const out = new Set();
  for (const m of n.matchAll(PERIOD_NUMBERED)) out.add(`${NUMBER_VALUE[m[1]] ?? m[1]}${UNIT_CLASS[m[2]] ?? m[2]}`);
  for (const m of n.matchAll(PERIOD_DUAL)) out.add(`${DUAL[m[1]]}${UNIT_CLASS[m[1]]}`);
  for (const m of n.matchAll(PERIOD_SINGLE)) out.add(`1${UNIT_CLASS[m[1]]}`);
  return out;
}

/** Article citations in normalized text: [{ num, code: Set<string>|null }] (code = words of the code the citation names). */
function citationsOf(n) {
  const out = [];
  CITATION.lastIndex = 0;
  for (let m; (m = CITATION.exec(n)); ) {
    const named = NAMES_A_CODE.exec(n.slice(m.index + m[0].length, m.index + m[0].length + 60));
    const code = named ? new Set(termsOfNormalized(named[1]).filter((t) => !CODE_TYPE_STEMS.has(t))) : null;
    for (const piece of m[1].split(/\s*(?:و|،|,)\s*/)) if (piece) out.push({ num: canonNumber(piece), code });
  }
  return out;
}

function kindOf(signals) {
  for (const [key, kind] of KIND_ORDER) if (signals[key]) return kind;
  return "OTHER";
}


const asSet = (v) => (v instanceof Set ? v : new Set(v || []));
const asMap = (v) => (v instanceof Map ? v : new Map(v || []));

/**
 * @param {{articles:object[], topics:object[], pairArticleIds?:Set<string>|string[], decisionCounts?:Map<string,number>|[string,number][], maxGaps?:number}} input
 *   article.codeTitle (optional): the title of the article's code, used to tell "المادة 3 من مدونة الشغل" from this code.
 * @returns {{gaps: object[], detected: string[], covered: string[], stats: {articles:number, covered:number, topics:number, truncated:boolean}}}
 *   gaps: the top `maxGaps`; detected: "canonicalId|kind" of EVERY gap found (before the cut); covered: canonicalIds the
 *   notes demonstrably cover (so a caller can tell "no longer a gap" from "fell out of the top N").
 */
function analyze({ articles, topics: allTopics, pairArticleIds, decisionCounts, maxGaps = MAX_GAPS }) {
  const pairIds = asSet(pairArticleIds);
  const decisions = asMap(decisionCounts);
  const truncated = allTopics.length > MAX_TOPICS;
  const topics = truncated ? allTopics.slice(0, MAX_TOPICS) : allTopics;
  const empty = (n = 0) => ({ gaps: [], detected: [], covered: [], stats: { articles: n, covered: 0, topics: topics.length, truncated } });
  const usable = articles.filter((a) => a.text && a.text.trim());
  if (!usable.length || !topics.length) return empty(usable.length);

  // ---- article side: normalized once
  const df = new Map();
  const artNorm = usable.map((a) => normalize(toWesternDigits(a.text.slice(0, MAX_ARTICLE_TEXT))));
  const artTerms = artNorm.map((n) => {
    const terms = termsOfNormalized(n);
    for (const t of new Set(terms)) df.set(t, (df.get(t) || 0) + 1);
    return terms;
  });
  const N = usable.length;
  const idf = (t) => Math.log(1 + N / (df.get(t) || 1));
  const common = 0.5; // a term in more than half of the articles does not identify any of them
  const keyTermsOf = (terms) => {
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    return [...tf.entries()]
      .filter(([t]) => (df.get(t) || 0) / N <= common)
      .map(([t, c]) => [t, c * idf(t)])
      .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
      .slice(0, KEY_TERMS)
      .map(([t]) => t);
  };

  // ---- topic side: everything computed once per topic, whatever the number of articles
  const topicNorm = topics.map((t) => normalize(toWesternDigits(`${t.title} ${(t.text || "").slice(0, MAX_TOPIC_TEXT)}`)));
  const topicTerms = topicNorm.map((n) => new Set(termsOfNormalized(n).slice(0, MAX_TOPIC_TERMS)));
  const topicPathTerms = topics.map((t) => new Set(termsOf(`${(t.headingPath || []).join(" ")} ${t.title}`)));
  const topicSignals = topicNorm.map(featuresOfNormalized);
  const topicCites = topicNorm.map(citationsOf);
  const topicPeriods = topicNorm.map(periodsOf);
  const inverted = new Map();
  topicTerms.forEach((set, i) => {
    for (const t of set) {
      if (!inverted.has(t)) inverted.set(t, []);
      inverted.get(t).push(i);
    }
  });

  // ---- coverage per article
  const rows = [];
  usable.forEach((a, i) => {
    const key = keyTermsOf(artTerms[i]);
    if (key.length < MIN_KEY_TERMS) return; // nothing distinctive to look for
    const weights = key.map(idf);
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    const candidates = new Set();
    for (const t of key) for (const ti of inverted.get(t) || []) candidates.add(ti);
    const num = canonNumber(a.number);
    const codeWords = a.codeTitle ? new Set(termsOf(a.codeTitle).filter((t) => !CODE_TYPE_STEMS.has(t))) : null;
    let best = { score: 0, topic: -1 };
    let cited = -1;
    const supporting = [];
    for (const ti of candidates) {
      const score = key.reduce((s, t, k) => s + (topicTerms[ti].has(t) ? weights[k] : 0), 0) / total;
      if (score >= COVER_OK * 0.8) supporting.push(ti);
      if (score > best.score || (score === best.score && best.topic === -1)) best = { score, topic: ti };
      // A citation of THIS article (right after an article label, not naming another code) plus some shared wording.
      if (cited === -1 && score >= MIN_OVERLAP_WITH_NUMBER) {
        const hit = topicCites[ti].some((c) => c.num === num && (!c.code || (codeWords && [...c.code].some((w) => codeWords.has(w)))));
        if (hit) cited = ti;
      }
    }
    const coverage = cited !== -1 ? Math.max(best.score, 0.85) : best.score;
    if (cited !== -1 && !supporting.includes(cited)) supporting.push(cited);
    rows.push({ a, i, key, coverage, supporting, cited: cited !== -1, bestTopic: cited !== -1 ? cited : best.topic });
  });
  const covered = rows.filter((r) => r.coverage >= COVER_OK).length;

  // ---- sections and what the notes touch
  const sectionOf = (a) => (a.headingPath && a.headingPath.length ? a.headingPath : []);
  const prefixKey = (p) => `${p.length}|${p.join("\u0001")}`;
  const groups = new Map(); // prefix key -> { path, rows[] }
  for (const r of rows) {
    const path = sectionOf(r.a);
    for (let n = 0; n <= path.length; n++) {
      const pre = path.slice(0, n);
      const k = prefixKey(pre);
      if (!groups.has(k)) groups.set(k, { path: pre, rows: [] });
      groups.get(k).rows.push(r);
    }
  }
  const headingMatches = (path) => {
    const last = path[path.length - 1];
    if (!last) return false;
    const terms = termsOf(last).filter((t) => !ORDINALS.has(t));
    if (!terms.length) return false;
    return topicPathTerms.some((set) => terms.filter((t) => set.has(t)).length / terms.length >= 0.6);
  };
  const touchedCache = new Map();
  const touched = (path) => {
    const k = prefixKey(path);
    if (touchedCache.has(k)) return touchedCache.get(k);
    const g = groups.get(k);
    const share = g ? g.rows.filter((r) => r.coverage >= COVER_OK).length / g.rows.length : 0;
    const v = headingMatches(path) || share >= TOUCHED_SHARE;
    touchedCache.set(k, v);
    return v;
  };

  const emphasisAt = (ti) => (ti >= 0 ? topics[ti].emphasisRatio || 0 : 0);
  const ctx = (r) => ({ pair: pairIds.has(r.a.id), decisions: decisions.get(r.a.id) || 0, signals: featuresOfNormalized(artNorm[r.i]) });
  const need = (signals) => (signals.deadline ? "deadline" : signals.sanction ? "sanction" : null);

  const gaps = [];
  const coveredIds = [];
  for (const r of rows) {
    const path = sectionOf(r.a);
    const isCovered = r.coverage >= COVER_OK;
    const c = ctx(r);
    // Covered in general, but the deadline / sanction the article states appears in none of the topics covering it.
    // The rule counts as stated when a covering topic carries the article's own period (or, with no period in the
    // article, any deadline wording / sanction wording), or when the note explicitly cites the article.
    const rule = need(c.signals);
    const wanted = rule === "deadline" ? periodsOf(artNorm[r.i]) : new Set();
    const stated = (ti) => (wanted.size ? [...wanted].some((p) => topicPeriods[ti].has(p)) : topicSignals[ti][rule]);
    const partial = isCovered && !r.cited && !!rule && !r.supporting.some(stated);
    if (isCovered && !partial) {
      coveredIds.push(r.a.canonicalId);
      continue;
    }
    if (!touched(path)) continue; // the notes do not work in this area: nothing to compare against
    const kind = kindOf(c.signals);
    gaps.push({
      kind,
      canonicalId: r.a.canonicalId,
      articleId: r.a.id,
      sectionTitle: path[path.length - 1] || null,
      sectionPath: path,
      areaTouched: true,
      partial,
      coverage: Math.round(r.coverage * 100) / 100,
      bestTopicId: r.bestTopic >= 0 ? topics[r.bestTopic].id : null,
      signals: c.signals,
      severity: severityOf({ ...c, coverage: r.coverage, partial, emphasis: emphasisAt(r.bestTopic) }),
      quote: r.a.text.slice(0, QUOTE_CHARS),
      explanationAr: partial
        ? `${r.a.number}: ${KIND_LABEL[kind]}، وتناولت ملاحظاتك موضوعه في «${topics[r.bestTopic].title}» دون أن تذكر ${rule === "deadline" ? "الأجل أو التقادم" : "الجزاء"} الوارد فيه.`
        : `${r.a.number}: ${KIND_LABEL[kind]}، ولم تتناوله ملاحظاتك${path.length ? ` في «${path[path.length - 1]}»` : ""}.`,
    });
  }

  // Whole sections skipped next to a section the notes do cover.
  for (const g of groups.values()) {
    if (!g.path.length) continue;
    const parent = g.path.slice(0, -1);
    const isLeaf = g.rows.every((r) => sectionOf(r.a).length === g.path.length);
    if (!isLeaf || touched(g.path) || g.rows.some((r) => r.coverage >= COVER_OK)) continue;
    if (!parent.length || !touched(parent)) continue;
    const scored = g.rows
      .map((r) => ({ r, c: ctx(r) }))
      .map((x) => ({ ...x, w: severityOf({ ...x.c, coverage: 0 }) }))
      .sort((x, y) => y.w - x.w || (x.r.a.canonicalId < y.r.a.canonicalId ? -1 : 1));
    const top = scored[0];
    const rest = scored.slice(1).reduce((s, x) => s + x.w, 0);
    gaps.push({
      kind: "MISSING_SECTION",
      canonicalId: top.r.a.canonicalId,
      articleId: top.r.a.id,
      sectionTitle: g.path[g.path.length - 1],
      sectionPath: g.path,
      areaTouched: false,
      partial: false,
      coverage: 0,
      bestTopicId: null,
      signals: top.c.signals,
      severity: Math.round(clamp((top.w + 0.25 * rest) * 0.5, 0, 10) * 100) / 100,
      quote: top.r.a.text.slice(0, QUOTE_CHARS),
      explanationAr: `لم تتناول ملاحظاتك «${g.path[g.path.length - 1]}» (${g.rows.length} من الفصول) رغم تناولها لما يجاور هذا الموضع من ${parent[parent.length - 1]}.`,
    });
  }

  gaps.sort((x, y) => y.severity - x.severity || (x.canonicalId < y.canonicalId ? -1 : x.canonicalId > y.canonicalId ? 1 : x.kind < y.kind ? -1 : 1));
  return {
    gaps: gaps.slice(0, maxGaps),
    detected: gaps.map((g) => `${g.canonicalId}|${g.kind}`),
    covered: coveredIds,
    stats: { articles: N, covered, topics: topics.length, truncated },
  };
}

// ---- worker thread -----------------------------------------------------------------------------------------------
class GapRadarError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "GapRadarError";
    this.code = code;
  }
}
const MAX_WORKERS = 1;
let active = 0;
const waiting = [];
const acquire = () => (active < MAX_WORKERS ? (active++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else active--;
};

/**
 * analyze() in a worker thread: scoring a big course must not hold the event loop, and a runaway run is killed
 * after timeoutMs. One analysis at a time per process (a slot is handed on only when the thread has exited).
 * Inputs and outputs are plain data: pass Sets/Maps as arrays.
 */
async function analyzeIsolated(input, { timeoutMs = 60000, maxOldGenerationSizeMb = 512 } = {}) {
  await acquire();
  let worker;
  try {
    const { Worker } = require("worker_threads");
    worker = new Worker(path.join(__dirname, "gapWorker.js"), { workerData: input, resourceLimits: { maxOldGenerationSizeMb } });
  } catch (e) {
    release();
    throw new GapRadarError("unavailable", e.message);
  }
  worker.once("exit", release);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new GapRadarError("timeout", `analysis took longer than ${timeoutMs} ms`)), timeoutMs);
    worker.once("message", (m) => (m.ok ? finish(resolve, m.ok) : finish(reject, new GapRadarError("failed", m.error))));
    worker.once("error", (e) => finish(reject, new GapRadarError(e?.code === "ERR_WORKER_OUT_OF_MEMORY" ? "too_large" : "failed", e.message)));
    worker.once("exit", (code) => finish(reject, new GapRadarError("failed", `analysis stopped (${code})`)));
  });
}

module.exports = { analyze, analyzeIsolated, GapRadarError, articleFeatures, termsOf, severityOf, kindOf, KIND_LABEL, COVER_OK, MAX_GAPS, MAX_TOPICS };
