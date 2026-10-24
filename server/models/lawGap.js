// Gap radar for a student's course (rule-based, no model call): compares the course topics with the statute
// articles in the corpus, stores the ranked gaps, and prepares them for a diagnostic and for the Brain.
//   analyze    -> LawKnowledgeGap rows (idempotent; a student's decisions survive re-analysis)
//   readiness  -> the top open gaps with the verbatim article, the reviewed concept and confusion pair if any
//   recordDiagnostic{Miss,Hit} -> Brain evidence, only for gaps that map to an admin-reviewed concept
const { db, rawDb } = require("../utils/law/dbClient");
const { currentUserId } = require("../utils/law/tenant");
const { LawCorpus } = require("./lawCorpus");
const { LawBrain } = require("./lawBrain");
const { analyzeIsolated, GapRadarError } = require("../utils/law/course/gapRadar");
const { serialWrite } = require("../utils/law/writeLock");
const { normalizeCanonicalId } = require("../utils/law/arabic");
const { localDate } = require("../utils/law/time");

const ANALYSIS_VERSION = 1;
const DEFAULT_CODES = ["DOC", "CCOM"];
const SLUG = /^[A-Za-z0-9.-]{1,24}$/;
const STUDENT_STATUSES = new Set(["OPEN", "CONFIRMED", "DISMISSED"]);
const PAGE = 500;
const MIN_FOR_DIAGNOSTIC = 3;

const parse = (v, fb) => {
  try {
    return JSON.parse(v);
  } catch {
    return fb;
  }
};

const present = (g) => ({
  id: g.id,
  courseId: g.courseId,
  kind: g.kind,
  canonicalId: g.canonicalId,
  sectionTitle: g.sectionTitle,
  partial: g.partial,
  areaTouched: g.areaTouched,
  topicId: g.topicId,
  conceptId: g.conceptId,
  coverage: g.coverage,
  severity: g.severity,
  signals: parse(g.signals, {}),
  quote: g.quote,
  explanationAr: g.explanationAr,
  status: g.status,
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
});

const emphasisRatio = (t) => {
  if (!t.text) return 0;
  const spans = parse(t.emphasis, []);
  return Math.min(1, spans.reduce((s, x) => s + Math.max(0, x.end - x.start), 0) / t.text.length);
};

async function visibleCourse(courseId) {
  return db().lawStudentCourse.findFirst({ where: { id: String(courseId ?? ""), status: { not: "IMPORTING" } } });
}

/** Articles of these codes with the version in force at `at`; pages through the corpus, never loads it twice. */
async function loadArticles(codeRows, at) {
  const out = [];
  const counts = new Map(codeRows.map((c) => [c.id, 0]));
  for (const code of codeRows) {
    for (let cursor; ; ) {
      const page = await db().lawArticle.findMany({
        where: { codeId: code.id },
        include: { versions: { where: LawCorpus.validAt(at), orderBy: { validFrom: "desc" }, take: 1 } },
        take: PAGE,
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!page.length) break;
      for (const a of page) {
        const text = a.versions[0]?.textAr;
        if (!text) continue;
        counts.set(code.id, counts.get(code.id) + 1);
        out.push({ id: a.id, canonicalId: a.canonicalId, slug: code.slug, number: a.articleNumber, headingPath: parse(a.headingPath, []), text });
      }
      cursor = page[page.length - 1].id;
    }
  }
  return { articles: out, counts };
}

/**
 * "SLUG:number" (normalized) -> the REVIEWED concept (first by slug) that cites it, plus the set of concepts that sit in
 * a pair. Unreviewed concepts are drafts: they never feed the Brain.
 */
async function conceptIndex() {
  const concepts = await rawDb().lawConcept.findMany({ where: { reviewed: true }, orderBy: { slug: "asc" } });
  const pairs = await rawDb().lawConfusionPair.findMany();
  const byRef = new Map();
  for (const c of concepts)
    for (const r of parse(c.legalRefs, [])) {
      const key = typeof r?.slug === "string" && typeof r?.number === "string" ? normalizeCanonicalId(`${r.slug}:${r.number}`) : null;
      if (key && !byRef.has(key)) byRef.set(key, c);
    }
  const inPair = new Set(pairs.filter((p) => concepts.some((c) => c.id === p.conceptAId) || concepts.some((c) => c.id === p.conceptBId)).flatMap((p) => [p.conceptAId, p.conceptBId]));
  return { byRef, inPair, pairs };
}

/** Validates a code list; returns the de-duplicated slugs or null. */
function validCodes(codes) {
  if (!Array.isArray(codes) || !codes.length || codes.length > 6 || codes.some((c) => typeof c !== "string" || !SLUG.test(c))) return null;
  return [...new Set(codes)];
}

const LawGap = {
  DEFAULT_CODES,

  validCodes,
  /** Cheap existence check (no topics loaded): is this a course of the current student that can be analysed? */
  exists: async function (courseId) {
    return !!(await db().lawStudentCourse.findFirst({ where: { id: String(courseId ?? ""), status: { not: "IMPORTING" } }, select: { id: true } }));
  },

  /**
   * @param {string} courseId
   * @param {{codes?: string[], at?: Date}} opts
   * @returns {{status:'ok'|'corpus_empty', codes:{slug,found,articles}[], gaps:object[], stats?:object}|{error}}
   */
  analyze: async function (courseId, { codes = DEFAULT_CODES, at = new Date() } = {}) {
    const userId = currentUserId();
    const slugs = validCodes(codes);
    if (!slugs) return { error: "invalid_codes" };
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) return { error: "invalid_date" };
    const course = await visibleCourse(courseId);
    if (!course) return { error: "not_found" };

    const known = await rawDb().lawCode.findMany({ where: { slug: { in: slugs } } });
    const codeRows = known.filter((c) => LawCorpus.codeInForce(c, at));
    const { articles, counts } = await loadArticles(codeRows, at);
    const summary = slugs.map((slug) => {
      const row = codeRows.find((c) => c.slug === slug);
      return { slug, found: known.some((c) => c.slug === slug), articles: row ? counts.get(row.id) : 0 };
    });
    if (!articles.length) return { status: "corpus_empty", codes: summary, gaps: [] };
    const titleOf = new Map(codeRows.map((c) => [c.slug, c.titleAr]));
    for (const a of articles) a.codeTitle = titleOf.get(a.slug) || null;

    const topicRows = await db().lawCourseTopic.findMany({ where: { courseId: course.id }, select: { id: true, title: true, headingPath: true, text: true, emphasis: true } });
    const topics = topicRows.map((t) => ({ id: t.id, title: t.title, headingPath: parse(t.headingPath, []), text: t.text, emphasisRatio: emphasisRatio(t) }));
    const { byRef, inPair } = await conceptIndex();
    // The student's own links to an article (decisions, doctrine, notes) say it matters to them.
    const decisionCounts = new Map();
    for (const l of await db().lawLink.findMany({ where: { toType: "article" }, select: { toId: true } })) decisionCounts.set(l.toId, (decisionCounts.get(l.toId) || 0) + 1);
    const conceptOf = (canonicalId) => byRef.get(normalizeCanonicalId(canonicalId)) || null;
    const pairArticleIds = articles.filter((a) => inPair.has(conceptOf(a.canonicalId)?.id)).map((a) => a.id);

    // Scoring runs in a worker thread: it must not hold the event loop, and a runaway run is stopped.
    let result;
    try {
      result = await analyzeIsolated({ articles, topics, pairArticleIds, decisionCounts: [...decisionCounts] });
    } catch (e) {
      if (e instanceof GapRadarError) return { error: e.code === "timeout" ? "analysis_timeout" : e.code === "too_large" ? "course_too_large" : "analysis_failed" };
      throw e;
    }

    return serialWrite(async () => {
      // Persist: one writer at a time, and the course may have been deleted while we were scoring.
      if (!(await rawDb().lawStudentCourse.findUnique({ where: { id: course.id }, select: { id: true } }))) return { error: "not_found" };
      try {
        const existing = await rawDb().lawKnowledgeGap.findMany({ where: { courseId: course.id } });
        const key = (g) => `${g.canonicalId}|${g.kind}`;
        for (const g of result.gaps) {
          const data = {
            sectionTitle: g.sectionTitle,
            partial: g.partial,
            areaTouched: g.areaTouched,
            topicId: g.bestTopicId,
            conceptId: conceptOf(g.canonicalId)?.id || "",
            coverage: g.coverage,
            severity: g.severity,
            signals: JSON.stringify(g.signals),
            quote: g.quote,
            explanationAr: g.explanationAr,
            analysisVersion: ANALYSIS_VERSION,
          };
          const prior = existing.find((e) => key(e) === key(g));
          // A gap the notes had come to cover that is detected again reopens; every other decision is kept.
          if (prior) await rawDb().lawKnowledgeGap.updateMany({ where: { id: prior.id }, data: { ...data, ...(prior.status === "COVERED" ? { status: "OPEN" } : {}) } });
          else {
            try {
              await rawDb().lawKnowledgeGap.create({ data: { ...data, courseId: course.id, userId, kind: g.kind, canonicalId: g.canonicalId } });
            } catch (e) {
              if (e.code !== "P2002") throw e;
              await rawDb().lawKnowledgeGap.updateMany({ where: { courseId: course.id, canonicalId: g.canonicalId, kind: g.kind }, data });
            }
          }
        }
        // Reconcile only what this run judged: rows of the analysed codes that are no longer detected. A gap that merely
        // fell out of the stored top N is still "detected" and stays.
        const analysed = new Set(codeRows.map((c) => c.slug.toUpperCase()));
        const detected = new Set(result.detected);
        const covered = new Set(result.covered);
        for (const e of existing) {
          if (!analysed.has(String(e.canonicalId).split(":")[0].toUpperCase()) || detected.has(key(e))) continue;
          if (e.status === "OPEN") await rawDb().lawKnowledgeGap.deleteMany({ where: { id: e.id } });
          else if (e.status === "CONFIRMED" && covered.has(e.canonicalId)) await rawDb().lawKnowledgeGap.updateMany({ where: { id: e.id }, data: { status: "COVERED" } });
        }
        await rawDb().lawStudentCourse.updateMany({ where: { id: course.id }, data: { status: "ANALYZED" } });
      } catch (e) {
        if (e.code === "P2025" || e.code === "P2003") return { error: "not_found" }; // the course went away under us
        throw e;
      }
      const rows = await rawDb().lawKnowledgeGap.findMany({ where: { courseId: course.id }, orderBy: [{ severity: "desc" }, { canonicalId: "asc" }] });
      return { status: "ok", codes: summary, stats: result.stats, gaps: rows.map(present) };
    });
  },

  list: async function (courseId, { status = null } = {}) {
    if (!(await visibleCourse(courseId))) return { error: "not_found" };
    const rows = await db().lawKnowledgeGap.findMany({
      where: { courseId: String(courseId), ...(status ? { status: String(status) } : {}) },
      orderBy: [{ severity: "desc" }, { canonicalId: "asc" }],
    });
    return { gaps: rows.map(present) };
  },

  setStatus: async function (courseId, gapId, status) {
    if (!(await visibleCourse(courseId))) return { error: "not_found" };
    const gap = await db().lawKnowledgeGap.findFirst({ where: { id: String(gapId ?? ""), courseId: String(courseId) } });
    if (!gap) return { error: "not_found" };
    if (!STUDENT_STATUSES.has(status)) return { error: "invalid_status" };
    return { gap: present(await rawDb().lawKnowledgeGap.update({ where: { id: gap.id }, data: { status } })) };
  },

  /**
   * What a diagnostic would be built from. Every candidate carries the article's CURRENT corpus text (a drill is
   * written from it and nothing else); gaps whose article is no longer in the corpus are dropped and counted.
   */
  readiness: async function (courseId, { limit = 5 } = {}) {
    if (!(await visibleCourse(courseId))) return { error: "not_found" };
    const all = await db().lawKnowledgeGap.findMany({ where: { courseId: String(courseId) }, orderBy: [{ severity: "desc" }, { canonicalId: "asc" }] });
    const live = all.filter((g) => g.status === "OPEN" || g.status === "CONFIRMED");
    const resolved = await LawCorpus.resolve([...new Set(live.map((g) => g.canonicalId))]);
    const usable = live.filter((g) => { const r = resolved[g.canonicalId]; return r?.exists && r.text && r.codeInForce && r.validAtDate; });
    const { pairs } = await conceptIndex();
    const candidates = usable.slice(0, Math.max(1, Math.min(20, limit))).map((g) => {
      const pair = g.conceptId ? pairs.find((p) => p.conceptAId === g.conceptId || p.conceptBId === g.conceptId) : null;
      return {
        gapId: g.id,
        canonicalId: g.canonicalId,
        kind: g.kind,
        severity: g.severity,
        partial: g.partial,
        sectionTitle: g.sectionTitle,
        explanationAr: g.explanationAr,
        article: resolved[g.canonicalId].text,
        conceptId: g.conceptId,
        pair: pair ? { id: pair.id, labelAr: pair.labelAr } : null,
        brainReady: !!g.conceptId,
      };
    });
    const count = (s) => all.filter((g) => g.status === s).length;
    return {
      candidates,
      enough: candidates.length >= MIN_FOR_DIAGNOSTIC,
      summary: {
        open: count("OPEN"),
        confirmed: count("CONFIRMED"),
        dismissed: count("DISMISSED"),
        drilled: count("DRILLED"),
        resolved: count("RESOLVED"),
        withConcept: usable.filter((g) => g.conceptId).length,
        stale: live.length - usable.length,
      },
    };
  },

  /** A diagnostic question about this gap was answered wrongly. Brain evidence only when a reviewed concept maps. */
  recordDiagnosticMiss: async function (gapId, { at = new Date() } = {}) {
    return this._record(gapId, "DIAGNOSTIC", "DRILLED", at);
  },
  /** ...answered correctly: the gap is resolved, and a correct targeted answer counts toward resolving a memory. */
  recordDiagnosticHit: async function (gapId, { at = new Date() } = {}) {
    return this._record(gapId, "DRILL_CORRECT", "RESOLVED", at);
  },
  async _record(gapId, source, status, at) {
    const userId = currentUserId();
    const gap = await db().lawKnowledgeGap.findFirst({ where: { id: String(gapId ?? "") } });
    if (!gap) return { error: "not_found" };
    if (gap.status === "DISMISSED" || gap.status === "COVERED") return { error: "gap_closed" };
    let memory = null;
    // Only an admin-reviewed concept may feed the Brain, checked again now (it may have been un-reviewed since the analysis).
    const concept = gap.conceptId ? await rawDb().lawConcept.findUnique({ where: { id: gap.conceptId } }) : null;
    if (concept?.reviewed) {
      // One piece of evidence per gap, per kind, per day: repeating the same question cannot manufacture a confirmed weakness.
      const prior = await rawDb().lawLearnerEvidence.findMany({ where: { refId: gap.id, source, memory: { userId } }, select: { createdAt: true } });
      const today = prior.some((e) => localDate(e.createdAt) === localDate(at));
      const m = today
        ? await rawDb().lawLearnerMemory.findFirst({ where: { userId, kind: "GAP", conceptId: gap.conceptId } })
        : await LawBrain.record(userId, { kind: "GAP", conceptId: gap.conceptId, source, refId: gap.id, ...(source === "DRILL_CORRECT" ? { weight: 0 } : {}), at });
      if (m) memory = { id: m.id, kind: m.kind, status: m.status, strength: m.strength };
    }
    const updated = await rawDb().lawKnowledgeGap.update({ where: { id: gap.id }, data: { status } });
    return { gap: present(updated), memory };
  },
};

module.exports = { LawGap };
