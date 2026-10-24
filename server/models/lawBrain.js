// Phase 10: the Learner Brain. Private per student, academic misconceptions only: every memory is keyed to a reviewed-or-
// pending concept / confusion pair from a CLOSED taxonomy (no free-text traits, no personality, no emotion).
// Collection and injection both stop when the student turns "ذاكرتي" off. Admins never see individual memories.
const { rawDb } = require("../utils/law/dbClient");
const { generate } = require("../utils/law/ai/router");
const { BudgetError, ProviderError, PermanentError } = require("../utils/law/ai/errors");
const { loadPrompt } = require("../utils/law/prompts");
const { evaluate, WEIGHTS } = require("../utils/law/brain/memory");
const { hit } = require("../utils/law/rateLimit");
const { LawSetting } = require("./lawSetting");
const { LawCorpus } = require("./lawCorpus");
const { localDate, addDays } = require("../utils/law/time");
const { serialWrite } = require("../utils/law/writeLock");

const K_ANON = 20;
const CLASSIFY_MIN_CONFIDENCE = 0.75;
const NUDGE_AFTER_DAYS = 3;
const MASTERED_STABILITY_DAYS = 21;

// Starter taxonomy (concept names only). Article references are NEVER seeded: an admin fills them from the corpus
// and the API refuses refs that do not resolve. Everything starts unreviewed.
const CONCEPTS = [
  ["nullite-absolue", "البطلان", "Nullité", "CIVIL"], ["annulabilite", "الإبطال", "Annulabilité", "CIVIL"],
  ["responsabilite-contractuelle", "المسؤولية العقدية", "Responsabilité contractuelle", "CIVIL"], ["responsabilite-delictuelle", "المسؤولية التقصيرية", "Responsabilité délictuelle", "CIVIL"],
  ["prescription", "التقادم", "Prescription", "CIVIL"], ["decheance", "السقوط", "Déchéance", "CIVIL"],
  ["action-publique", "الدعوى العمومية", "Action publique", "PROCEDURE_PENAL"], ["action-civile-accessoire", "الدعوى المدنية التابعة", "Action civile accessoire", "PROCEDURE_PENAL"],
  ["crime", "الجناية", "Crime", "CRIMINAL"], ["delit", "الجنحة", "Délit", "CRIMINAL"], ["contravention", "المخالفة", "Contravention", "CRIMINAL"],
  ["retrait-acte-administratif", "سحب القرار الإداري", "Retrait de l'acte administratif", "ADMIN"], ["annulation-acte-administratif", "إلغاء القرار الإداري", "Annulation de l'acte administratif", "ADMIN"],
];
const PAIRS = [
  ["nullite-absolue", "annulabilite", "البطلان ↔ الإبطال"], ["action-publique", "action-civile-accessoire", "الدعوى العمومية ↔ الدعوى المدنية التابعة"],
  ["prescription", "decheance", "التقادم ↔ السقوط"], ["retrait-acte-administratif", "annulation-acte-administratif", "سحب القرار الإداري ↔ إلغاؤه"],
  ["responsabilite-contractuelle", "responsabilite-delictuelle", "المسؤولية العقدية ↔ التقصيرية"],
  ["crime", "delit", "الجناية ↔ الجنحة"], ["delit", "contravention", "الجنحة ↔ المخالفة"], ["crime", "contravention", "الجناية ↔ المخالفة"],
];
const WEAK_SUBJECT = "تمارين نقاط ضعفي";

const parse = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const pending = new Set();
const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };

/** Memory runs only while the student keeps it on AND has accepted the CURRENT notice (1.1.0 discloses the memory). */
async function memoryOn(userId) {
  const p = await rawDb().lawUserPreferences.findUnique({ where: { userId }, select: { memoryEnabled: true } });
  if (p && !p.memoryEnabled) return false;
  return (await require("./lawConsent").LawConsent.get(userId)).accepted;
}

const LawBrain = {
  K_ANON, CONCEPTS, PAIRS,
  /** Resolves when the background classifier calls started by chat have finished (tests, graceful shutdown). */
  drain: async () => { while (pending.size) await Promise.allSettled([...pending]); },
  memoryOn,

  // ---- taxonomy ----
  ensureTaxonomySeed: async function () {
    const db = rawDb();
    const ids = {};
    // Two requests may seed at once (upsert is not atomic): a lost race is fine, the row exists either way.
    const once = async (fn) => { try { return await fn(); } catch (e) { if (e.code !== "P2002") throw e; } };
    for (const [slug, titleAr, titleFr, domain] of CONCEPTS) {
      await once(() => db.lawConcept.upsert({ where: { slug }, create: { slug, titleAr, titleFr, domain }, update: {} }));
      ids[slug] = (await db.lawConcept.findUnique({ where: { slug } })).id;
    }
    for (const [a, b, labelAr] of PAIRS) {
      const [x, y] = [ids[a], ids[b]].sort();
      await once(() => db.lawConfusionPair.upsert({ where: { conceptAId_conceptBId: { conceptAId: x, conceptBId: y } }, create: { conceptAId: x, conceptBId: y, labelAr }, update: {} }));
    }
  },

  taxonomy: async function () {
    if ((await rawDb().lawConcept.count()) < CONCEPTS.length || (await rawDb().lawConfusionPair.count()) < PAIRS.length) await this.ensureTaxonomySeed();
    const [concepts, pairs] = await Promise.all([rawDb().lawConcept.findMany({ orderBy: { slug: "asc" } }), rawDb().lawConfusionPair.findMany({ orderBy: { labelAr: "asc" } })]);
    return { concepts: concepts.map(presentConcept), pairs };
  },

  /** Every legalRef must resolve in the corpus (the Brain never carries a made-up article). */
  async _checkRefs(refs) {
    if (!Array.isArray(refs) || refs.length > 30 || refs.some((r) => typeof r?.slug !== "string" || typeof r?.number !== "string")) return "invalid_refs";
    if (!refs.length) return null;
    const res = await LawCorpus.resolve(refs.map((r) => `${r.slug}:${r.number}`));
    return Object.values(res).every((r) => r.exists) ? null : "unknown_article";
  },

  createConcept: async function (b = {}) {
    if (!/^[a-z0-9-]{2,60}$/.test(b.slug || "") || !b.titleAr || !b.domain) return { error: "invalid_concept" };
    const refErr = await this._checkRefs(b.legalRefs || []);
    if (refErr) return { error: refErr };
    try {
      const c = await rawDb().lawConcept.create({ data: { slug: b.slug, titleAr: String(b.titleAr).slice(0, 120), titleFr: b.titleFr ? String(b.titleFr).slice(0, 120) : null, domain: String(b.domain).slice(0, 40), legalRefs: JSON.stringify(b.legalRefs || []), moduleIds: JSON.stringify(b.moduleIds || []) } });
      return { concept: presentConcept(c), error: null };
    } catch (e) {
      if (e.code === "P2002") return { error: "slug_taken", status: 409 };
      throw e;
    }
  },
  updateConcept: async function (id, b = {}) {
    const data = {};
    if (b.titleAr !== undefined) data.titleAr = String(b.titleAr).slice(0, 120);
    if (b.titleFr !== undefined) data.titleFr = b.titleFr ? String(b.titleFr).slice(0, 120) : null;
    if (b.domain !== undefined) data.domain = String(b.domain).slice(0, 40);
    if (b.legalRefs !== undefined) { const e = await this._checkRefs(b.legalRefs); if (e) return { error: e }; data.legalRefs = JSON.stringify(b.legalRefs); }
    if (b.moduleIds !== undefined) data.moduleIds = JSON.stringify(b.moduleIds);
    if (b.reviewed !== undefined) {
      if (b.reviewed === true && !parse((await rawDb().lawConcept.findUnique({ where: { id: String(id) } }))?.legalRefs, []).length && !(data.legalRefs && JSON.parse(data.legalRefs).length)) return { error: "refs_required_to_review" };
      data.reviewed = !!b.reviewed;
    }
    const r = await rawDb().lawConcept.updateMany({ where: { id: String(id) }, data });
    return r.count ? { error: null } : { error: "not_found" };
  },
  updatePair: async function (id, b = {}) {
    const data = {};
    if (b.labelAr !== undefined) data.labelAr = String(b.labelAr).slice(0, 160);
    if (b.contrastMd !== undefined) data.contrastMd = b.contrastMd ? String(b.contrastMd).slice(0, 8000) : null;
    if (b.reviewed !== undefined) data.reviewed = !!b.reviewed;
    const r = await rawDb().lawConfusionPair.updateMany({ where: { id: String(id) }, data });
    return r.count ? { error: null } : { error: "not_found" };
  },
  createPair: async function (b = {}) {
    const [x, y] = [String(b.conceptAId), String(b.conceptBId)].sort();
    const both = await rawDb().lawConcept.count({ where: { id: { in: [x, y] } } });
    if (x === y || both !== 2 || !b.labelAr) return { error: "invalid_pair" };
    try {
      return { pair: await rawDb().lawConfusionPair.create({ data: { conceptAId: x, conceptBId: y, labelAr: String(b.labelAr).slice(0, 160) } }), error: null };
    } catch (e) {
      if (e.code === "P2002") return { error: "pair_exists", status: 409 };
      throw e;
    }
  },

  // ---- evidence -> memory ----
  /**
   * Records one piece of evidence and re-evaluates the memory. Does nothing when the student switched memory off.
   * `at` is injectable for tests.
   */
  record: function (userId, args) {
    // SQLite: the background classifier and a request can write at once; serialize them (see utils/law/writeLock.js)
    return serialWrite(() => this._record(userId, args));
  },
  _record: async function (userId, { kind = "CONFUSION", conceptId = "", pairId = "", source, refId, excerpt = null, weight, at = new Date() }) {
    if (!(await memoryOn(userId))) return null;
    if (!conceptId && !pairId) return null;
    const db = rawDb();
    const key = { userId, kind, conceptId, confusionPairId: pairId };
    let m = await db.lawLearnerMemory.findUnique({ where: { userId_kind_conceptId_confusionPairId: key } });
    if (!m) {
      if (source === "DRILL_CORRECT") return null; // nothing to remediate yet
      try {
        m = await db.lawLearnerMemory.create({ data: { ...key, summaryAr: await this._summary(kind, conceptId, pairId), lastSeenAt: at } });
      } catch (e) {
        if (e.code !== "P2002") throw e; // a concurrent signal created it first
        m = await db.lawLearnerMemory.findUnique({ where: { userId_kind_conceptId_confusionPairId: key } });
      }
    }
    await db.lawLearnerEvidence.create({ data: { memoryId: m.id, source, refId: String(refId || ""), excerpt: excerpt ? String(excerpt).slice(0, 200) : null, weight: weight ?? WEIGHTS[source] ?? 0, createdAt: at } });
    return this._reevaluate(m.id, at);
  },

  async _summary(kind, conceptId, pairId) {
    if (pairId) { const p = await rawDb().lawConfusionPair.findUnique({ where: { id: pairId } }); return `تخلط أحياناً بين ${p?.labelAr || "مفهومين متقاربين"}`; }
    const c = await rawDb().lawConcept.findUnique({ where: { id: conceptId } });
    return `نقطة تستحق التعزيز: ${c?.titleAr || "مفهوم"}`;
  },

  async _reevaluate(memoryId, now = new Date()) {
    const db = rawDb();
    const m = await db.lawLearnerMemory.findUnique({ where: { id: memoryId }, include: { evidence: true } });
    if (!m) return null;
    const { status, strength } = evaluate(m, m.evidence, now);
    const lastRem = m.evidence.filter((e) => e.source === "DRILL_CORRECT").reduce((t, e) => Math.max(t, +e.createdAt), 0);
    const lastSeen = m.evidence.reduce((t, e) => Math.max(t, +e.createdAt), +m.lastSeenAt);
    return db.lawLearnerMemory.update({ where: { id: m.id }, data: { status, strength, evidenceCount: m.evidence.length, lastSeenAt: new Date(lastSeen), ...(lastRem ? { lastRemediatedAt: new Date(lastRem) } : {}) } });
  },

  /** Time passes: strengths decay and weak confirmed memories fade, so reads re-evaluate. */
  refresh: function (userId, now = new Date()) { return serialWrite(() => this._refresh(userId, now)); },
  _refresh: async function (userId, now = new Date()) {
    const ms = await rawDb().lawLearnerMemory.findMany({ where: { userId, NOT: { status: "RESOLVED" } }, select: { id: true } });
    for (const m of ms) await this._reevaluate(m.id, now);
  },

  // ---- signals ----
  /** FSRS lapse on a concept-tagged card (+0.5). Lapses on cards of BOTH sides of a pair within 14 days = a confusion. */
  onLapse: async function (userId, card, { at = new Date(), refId } = {}) {
    if (!(await memoryOn(userId))) return;
    const conceptIds = parse(card.conceptIds, []);
    for (const conceptId of conceptIds) {
      await this.record(userId, { kind: "GAP", conceptId, source: "FSRS_LAPSE", refId: refId || card.id, at });
      const pairs = await rawDb().lawConfusionPair.findMany({ where: { OR: [{ conceptAId: conceptId }, { conceptBId: conceptId }] } });
      for (const p of pairs) {
        const other = p.conceptAId === conceptId ? p.conceptBId : p.conceptAId;
        // the other side must have lapsed on a DIFFERENT review (one card tagged with both concepts is not a confusion)
        const recent = await rawDb().lawLearnerEvidence.count({ where: { source: "FSRS_LAPSE", refId: { not: String(refId || card.id) }, createdAt: { gte: new Date(at - 14 * 86400000) }, memory: { userId, kind: "GAP", conceptId: other } } });
        if (recent) await this.record(userId, { kind: "CONFUSION", pairId: p.id, source: "FSRS_LAPSE", refId: refId || card.id, at });
      }
    }
  },

  // ---- chat classifier (async, cheap, closed taxonomy) ----
  classifyTurn: function (userId, text, { refId, now = new Date() } = {}) {
    return track(this._classify(userId, text, { refId, now }).catch((e) => { console.error("[brain] classifier skipped:", e.message); }));
  },
  async _classify(userId, text, { refId, now }) {
    if (!(await memoryOn(userId))) return;
    const budget = Number(await LawSetting.get("aiBrainDailyBudget"));
    if (!(await hit("brain-classify", "all", budget, { now }))) return; // budget spent: quiz/FSRS detection keeps working
    const { pairs } = await this.taxonomy();
    const prompt = loadPrompt("brain_classify", 1);
    let out;
    try {
      out = await generate({
        purpose: "brain_classify", prompt, system: prompt.text,
        parts: [{ text: `# الأزواج\n${pairs.map((p) => `${p.id} | ${p.labelAr}`).join("\n")}\n\n# رسالة الطالب\n${text}` }],
        schema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { pairId: { type: "STRING" }, confidence: { type: "NUMBER" }, span: { type: "STRING" } }, required: ["pairId", "confidence", "span"] } } }, required: ["items"] },
        temperature: 0, maxOutputTokens: 400,
      }, { now });
    } catch (e) {
      if (e instanceof BudgetError || e instanceof ProviderError || e instanceof PermanentError) return;
      throw e;
    }
    const valid = new Set(pairs.map((p) => p.id));
    for (const it of out.json?.items || []) {
      // closed taxonomy, confident enough, quoting the STUDENT's own words
      if (!valid.has(it.pairId) || !(it.confidence >= CLASSIFY_MIN_CONFIDENCE) || typeof it.span !== "string" || !it.span.trim() || !text.includes(it.span)) continue;
      await this.record(userId, { kind: "CONFUSION", pairId: it.pairId, source: "CHAT", refId, excerpt: it.span, weight: 0.4, at: now });
    }
  },

  // ---- reading / control (transparency) ----
  list: async function (userId, { full = false } = {}) {
    await this.refresh(userId);
    const ms = await rawDb().lawLearnerMemory.findMany({ where: { userId }, orderBy: [{ strength: "desc" }], include: { evidence: { orderBy: { createdAt: "desc" }, ...(full ? {} : { take: 20 }) } } });
    return {
      enabled: await memoryOn(userId),
      memories: ms.map((m) => ({ id: m.id, kind: m.kind, status: m.status, strength: m.strength, summaryAr: m.summaryAr, conceptId: m.conceptId || null, pairId: m.confusionPairId || null, lastSeenAt: m.lastSeenAt, lastRemediatedAt: m.lastRemediatedAt, evidence: m.evidence.map((e) => ({ source: e.source, refId: e.refId, excerpt: e.excerpt, createdAt: e.createdAt })) })),
    };
  },
  dismiss: function (userId, id) { return serialWrite(() => this._dismiss(userId, id)); },
  _dismiss: async function (userId, id) {
    const r = await rawDb().lawLearnerMemory.updateMany({ where: { id: String(id), userId }, data: { status: "DISMISSED", dismissedAt: new Date() } });
    return r.count ? { error: null } : { error: "not_found" };
  },
  remove: function (userId, id) { return serialWrite(() => this._remove(userId, id)); },
  _remove: async function (userId, id) {
    await rawDb().lawNotification.deleteMany({ where: { userId, type: "BRAIN_REMINDER", payload: { contains: `"memoryId":"${String(id)}"` } } });
    const r = await rawDb().lawLearnerMemory.deleteMany({ where: { id: String(id), userId } });
    return r.count ? { error: null } : { error: "not_found" };
  },
  resetAll: function (userId) { return serialWrite(() => this._resetAll(userId)); },
  _resetAll: async function (userId) {
    // everything derived from the memory goes too: mastery, reminders, and the weak-spot cards that carry concept tags
    const weak = await rawDb().lawSubject.findMany({ where: { userId, name: WEAK_SUBJECT }, select: { id: true } });
    await rawDb().$transaction([
      rawDb().lawLearnerMemory.deleteMany({ where: { userId } }),
      rawDb().lawMentorMemory.deleteMany({ where: { userId } }), // the notes the module mentor keeps are part of the same memory
      rawDb().lawConceptMastery.deleteMany({ where: { userId } }),
      rawDb().lawNotification.deleteMany({ where: { userId, type: "BRAIN_REMINDER" } }),
      rawDb().lawFlashcard.deleteMany({ where: { userId, subjectId: { in: weak.map((w) => w.id) } } }),
      rawDb().lawFlashcard.updateMany({ where: { userId }, data: { conceptIds: "[]" } }),
    ]);
    return { error: null };
  },
  exportAll: async function (userId) {
    const l = await this.list(userId, { full: true }); // the export has every piece of evidence, the screen shows the latest
    const mastery = await rawDb().lawConceptMastery.findMany({ where: { userId } });
    const mentorNotes = (await rawDb().lawMentorMemory.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((n) => ({ moduleId: n.moduleId, content: n.content, source: n.source, createdAt: n.createdAt }));
    return { exportedAt: new Date().toISOString(), enabled: l.enabled, memories: l.memories, mastery, mentorNotes };
  },

  // ---- mastery (from the student's FSRS cards) ----
  refreshMastery: function (userId) { return serialWrite(() => this._refreshMastery(userId)); },
  _refreshMastery: async function (userId) {
    const cards = await rawDb().lawFlashcard.findMany({ where: { userId, deletedAt: null, suspended: false, NOT: { conceptIds: "[]" } }, select: { conceptIds: true, state: true, stability: true } });
    const by = new Map();
    for (const c of cards) for (const id of parse(c.conceptIds, [])) { const x = by.get(id) || { n: 0, m: 0 }; x.n++; if (c.state === "review" && c.stability >= MASTERED_STABILITY_DAYS) x.m++; by.set(id, x); }
    for (const [conceptId, x] of by) {
      const r = x.m / x.n;
      const level = x.n < 3 ? 0 : r >= 0.85 ? 3 : r >= 0.6 ? 2 : r >= 0.3 ? 1 : 0;
      await rawDb().lawConceptMastery.upsert({ where: { userId_conceptId: { userId, conceptId } }, create: { userId, conceptId, level }, update: { level } });
    }
  },

  // ---- use: chat injection ----
  /**
   * <learner_notes> for the tutor: up to 5 ACTIVE/IMPROVING memories relevant to the selected references, plus concepts
   * the student has mastered. Shapes HOW to explain, never WHAT the law says. Empty string when memory is off.
   */
  learnerNotes: async function (userId, scopeSlugs) {
    if (!(await memoryOn(userId)) || !scopeSlugs.length) return { block: "", memoryIds: [] };
    await this.refresh(userId);
    await this.refreshMastery(userId);
    const codes = await rawDb().lawCode.findMany({ where: { slug: { in: scopeSlugs } }, select: { slug: true, domain: true } });
    const slugs = new Set(codes.map((c) => c.slug));
    const domains = new Set(codes.map((c) => c.domain).filter(Boolean));
    const concepts = new Map((await rawDb().lawConcept.findMany()).map((c) => [c.id, c]));
    const relevant = (conceptId) => { const c = concepts.get(conceptId); if (!c) return false; const refs = parse(c.legalRefs, []); return refs.some((r) => slugs.has(r.slug)) || (!refs.length && domains.has(c.domain)); };
    const ms = await rawDb().lawLearnerMemory.findMany({ where: { userId, status: { in: ["ACTIVE", "IMPROVING"] } }, orderBy: { strength: "desc" } });
    const pairs = new Map((await rawDb().lawConfusionPair.findMany()).map((p) => [p.id, p]));
    const picked = [];
    for (const m of ms) {
      const p = m.confusionPairId ? pairs.get(m.confusionPairId) : null;
      const ok = p ? relevant(p.conceptAId) || relevant(p.conceptBId) : relevant(m.conceptId);
      if (ok) picked.push({ m, p });
      if (picked.length === 5) break;
    }
    const mastered = (await rawDb().lawConceptMastery.findMany({ where: { userId, level: { gte: 2 } } })).map((x) => concepts.get(x.conceptId)).filter((c) => c && relevant(c.id)).slice(0, 8);
    if (!picked.length && !mastered.length) return { block: "", memoryIds: [] };
    const lines = [];
    for (const { m, p } of picked) {
      lines.push(`- ${m.summaryAr} (${m.status === "IMPROVING" ? "يتحسن" : "نشط"})`);
      if (p?.reviewed && p.contrastMd) lines.push(`  أداة مقارنة مراجَعة:\n${p.contrastMd.split("\n").map((l) => `  ${l}`).join("\n")}`);
    }
    if (mastered.length) lines.push(`- مفاهيم متقنة (اختصر شرحها): ${mastered.map((c) => c.titleAr).join("، ")}`);
    return { block: `<learner_notes>\n${lines.join("\n")}\n</learner_notes>`, memoryIds: picked.map((x) => x.m.id) };
  },

  // ---- Today ----
  todayPoint: async function (userId) {
    if (!(await memoryOn(userId))) return { enabled: false, memory: null, drill: null };
    await this.refresh(userId);
    const m = await rawDb().lawLearnerMemory.findFirst({ where: { userId, status: { in: ["ACTIVE", "IMPROVING"] }, NOT: { confusionPairId: "" } }, orderBy: { strength: "desc" } });
    if (!m) return { enabled: true, memory: null, drill: null };
    const items = await this.drills(userId, { limit: 1, pairId: m.confusionPairId });
    return { enabled: true, memory: { id: m.id, summaryAr: m.summaryAr, status: m.status, pairId: m.confusionPairId }, drill: items[0] || null };
  },

  /** Daily nudge: a reminder for students whose active weakness has been left alone for 3+ days (respects notification prefs). */
  nudgeAll: function (now = new Date()) { return serialWrite(() => this._nudgeAll(now)); },
  _nudgeAll: async function (now = new Date()) {
    const cutoff = new Date(now - NUDGE_AFTER_DAYS * 86400000);
    const ms = await rawDb().lawLearnerMemory.findMany({ where: { status: "ACTIVE", OR: [{ lastRemediatedAt: null }, { lastRemediatedAt: { lt: cutoff } }], lastSeenAt: { lt: cutoff } }, orderBy: { strength: "desc" } });
    const seen = new Set();
    let sent = 0;
    for (const m of ms) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      const prefs = await rawDb().lawUserPreferences.findUnique({ where: { userId: m.userId } });
      if (prefs && (!prefs.notifyReminders || !prefs.memoryEnabled)) continue;
      const day = localDate(now);
      if (await rawDb().lawNotification.findFirst({ where: { userId: m.userId, type: "BRAIN_REMINDER", payload: { contains: day } } })) continue;
      await rawDb().lawNotification.create({ data: { userId: m.userId, type: "BRAIN_REMINDER", payload: JSON.stringify({ day, memoryId: m.id }) } });
      sent++;
    }
    return sent;
  },

  // ---- drills ----
  /** Items for the student's pair memories; reviewed bank items first. Correct answers are NEVER returned. */
  drills: async function (userId, { limit = 5, pairId = null } = {}) {
    if (!(await memoryOn(userId))) return [];
    const ms = await rawDb().lawLearnerMemory.findMany({ where: { userId, status: { in: ["ACTIVE", "IMPROVING"] }, ...(pairId ? { confusionPairId: pairId } : { NOT: { confusionPairId: "" } }) }, orderBy: { strength: "desc" } });
    const pairIds = [...new Set(ms.map((m) => m.confusionPairId))];
    if (!pairIds.length) return [];
    // Shared bank = reviewed items only. An AI-written item stays private to the student it was made for until an admin reviews it.
    let items = await rawDb().lawDrillItem.findMany({ where: { pairId: { in: pairIds }, OR: [{ reviewed: true }, { ownerUserId: userId }] } });
    const reported = new Set((await rawDb().lawRateCounter.findMany({ where: { key: { in: items.map((i) => `drill-report:${i.id}:${userId}`) } }, select: { key: true } })).map((c) => c.key));
    items = items.filter((i) => !reported.has(`drill-report:${i.id}:${userId}`));
    const answered = new Map();
    for (const e of await rawDb().lawLearnerEvidence.findMany({ where: { memory: { userId }, source: { in: ["DRILL_CORRECT", "QUIZ_DISTRACTOR"] } }, orderBy: { createdAt: "desc" }, take: 200 }))
      if (!answered.has(e.refId.replace(/^ai:/, ""))) answered.set(e.refId.replace(/^ai:/, ""), +e.createdAt);
    items.sort((a, b) => (b.reviewed - a.reviewed) || ((answered.get(a.id) || 0) - (answered.get(b.id) || 0)));
    return items.slice(0, Math.min(10, limit)).map(presentDrill);
  },

  answerDrill: async function (userId, itemId, optionIndex, now = new Date()) {
    const item = await rawDb().lawDrillItem.findUnique({ where: { id: String(itemId || "") } });
    const options = item ? parse(item.options, []) : [];
    if (!item || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) return { error: "not_found" };
    // Only items the student may be served (reviewed, or their own AI item) and only for a weakness they actually have:
    // otherwise anyone could mint memories (and, through aggregates, fake cohorts) by answering arbitrary items.
    if (!item.reviewed && item.ownerUserId !== userId) return { error: "not_found" };
    const memory = await rawDb().lawLearnerMemory.findFirst({ where: { userId, confusionPairId: item.pairId, kind: "CONFUSION", status: { in: ["ACTIVE", "IMPROVING", "SUSPECTED"] } } });
    if (!memory || !(await memoryOn(userId))) return { error: "not_found" };
    const chosen = options[optionIndex];
    const correctIndex = options.findIndex((o) => o.correct);
    const unreviewedAi = item.source === "AI" && !item.reviewed;
    const refId = unreviewedAi ? `ai:${item.id}` : item.id;
    let updated = null;
    if (chosen.correct) updated = await this.record(userId, { kind: "CONFUSION", pairId: item.pairId, source: "DRILL_CORRECT", refId, weight: 0, at: now });
    else if (!unreviewedAi) {
      // an unreviewed AI item's answer key is only the model's claim: a "wrong" pick on it never counts against the student
      updated = await this.record(userId, { kind: "CONFUSION", pairId: chosen.distractorPairId || item.pairId, source: "QUIZ_DISTRACTOR", refId, weight: 1.0, at: now });
      await this._cardFromMiss(userId, item, options[correctIndex]);
    }
    const m = updated || memory;
    return { correct: !!chosen.correct, correctIndex, explanation: item.explanation, citedIds: parse(item.citedIds, []), aiGenerated: unreviewedAi, memory: m ? { id: m.id, status: m.status, strength: m.strength } : null, error: null };
  },

  /** A missed drill becomes a flashcard in a "weak spots" subject, so FSRS brings it back. */
  async _cardFromMiss(userId, item, correct) {
    if (!(await memoryOn(userId))) return;
    const db = rawDb();
    let subject = await db.lawSubject.findFirst({ where: { userId, name: WEAK_SUBJECT } });
    if (!subject) subject = await db.lawSubject.create({ data: { userId, name: WEAK_SUBJECT, color: "#b48a2c" } });
    if (await db.lawFlashcard.findFirst({ where: { userId, subjectId: subject.id, front: item.prompt } })) return;
    const pair = await db.lawConfusionPair.findUnique({ where: { id: item.pairId } });
    await db.lawFlashcard.create({ data: { userId, subjectId: subject.id, origin: "failed_retrieval", front: item.prompt, back: `${correct?.text || ""}${item.explanation ? `\n${item.explanation}` : ""}`, canonicalIds: item.citedIds, conceptIds: JSON.stringify(pair ? [pair.conceptAId, pair.conceptBId] : []) } });
  },

  createDrillItem: async function (b = {}, { source = "BANK", reviewed = false, ownerUserId = null } = {}) {
    const pair = await rawDb().lawConfusionPair.findUnique({ where: { id: String(b.pairId || "") } });
    const err = validateDrill(b);
    if (!pair || err) return { error: pair ? err : "invalid_pair" };
    const cited = Array.isArray(b.citedIds) ? b.citedIds : [];
    if (cited.length) { const res = await LawCorpus.resolve(cited); if (!Object.values(res).every((r) => r.exists)) return { error: "unknown_article" }; }
    const item = await rawDb().lawDrillItem.create({ data: { pairId: pair.id, kind: b.kind, prompt: b.prompt.trim().slice(0, 1200), options: JSON.stringify(b.options.map((o) => ({ text: String(o.text).slice(0, 400), correct: !!o.correct, ...(o.correct ? {} : { distractorPairId: pair.id }) }))), explanation: b.explanation ? String(b.explanation).slice(0, 800) : null, citedIds: JSON.stringify(cited), source, reviewed, ownerUserId } });
    return { item, error: null };
  },
  /**
   * A student flags a bad item: it disappears for THEM at once, and the shared report counter (one count per student)
   * pulls a reviewed item back to "unreviewed" only after 3 different students flagged it.
   */
  reportDrill: async function (userId, itemId) {
    const item = await rawDb().lawDrillItem.findUnique({ where: { id: String(itemId || "") } });
    if (!item) return { error: "not_found" };
    const first = await hit("drill-report", `${item.id}:${userId}`, 1, { window: "none" });
    if (first) {
      await hit("drill-reports", item.id, 1000000, { window: "none" });
      const c = await rawDb().lawRateCounter.findUnique({ where: { key: `drill-reports:${item.id}` } });
      if ((c?.count || 0) >= 3) await rawDb().lawDrillItem.update({ where: { id: item.id }, data: { reviewed: false } });
    }
    return { error: null };
  },
  listDrillItems: async function () {
    const items = await rawDb().lawDrillItem.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const counters = await rawDb().lawRateCounter.findMany({ where: { key: { in: items.map((i) => `drill-reports:${i.id}`) } } });
    const by = new Map(counters.map((c) => [c.key, c.count]));
    return items.map((i) => ({ id: i.id, pairId: i.pairId, kind: i.kind, prompt: i.prompt, options: parse(i.options, []), explanation: i.explanation, source: i.source, reviewed: i.reviewed, reports: by.get(`drill-reports:${i.id}`) || 0 }));
  },
  updateDrillItem: async function (id, b = {}) {
    const data = {};
    if (b.reviewed !== undefined) data.reviewed = !!b.reviewed;
    if (b.explanation !== undefined) data.explanation = b.explanation ? String(b.explanation).slice(0, 800) : null;
    const r = await rawDb().lawDrillItem.updateMany({ where: { id: String(id) }, data });
    return r.count ? { error: null } : { error: "not_found" };
  },

  /** AI-written item built ONLY from the pair's cited corpus articles. Stored as AI-generated and unreviewed. */
  generateDrill: async function (userId, pairId, { now = new Date() } = {}) {
    if (!(await memoryOn(userId))) return { error: "memory_off" };
    const pair = await rawDb().lawConfusionPair.findUnique({ where: { id: String(pairId || "") } });
    if (!pair) return { error: "not_found" };
    // only for a weakness the student really has, and only a few a day: generation spends the shared Brain budget
    const has = await rawDb().lawLearnerMemory.findFirst({ where: { userId, confusionPairId: pair.id, status: { in: ["ACTIVE", "IMPROVING"] } } });
    if (!has) return { error: "not_found" };
    if (!(await hit("drill-generate", userId, 5, { now }))) return { error: "rate_limited", status: 429 };
    const cs = await rawDb().lawConcept.findMany({ where: { id: { in: [pair.conceptAId, pair.conceptBId] } } });
    const refs = cs.flatMap((c) => parse(c.legalRefs, []).map((r) => `${r.slug}:${r.number}`));
    if (!refs.length) return { error: "no_corpus_refs", status: 409 };
    const res = await LawCorpus.resolve(refs);
    const evidence = Object.values(res).filter((r) => r.exists && r.text);
    if (!evidence.length) return { error: "no_corpus_refs", status: 409 };
    // its own global bucket, so drill generation can never starve the chat classifier
    if (!(await hit("brain-drill", "all", Math.max(0, Math.floor(Number(await LawSetting.get("aiBrainDailyBudget")) / 3)), { now }))) return { error: "brain_budget_spent", status: 429 };
    const prompt = loadPrompt("brain_drill", 1);
    let out;
    try {
      out = await generate({
        purpose: "brain_drill", prompt, system: prompt.text,
        parts: [{ text: `# المفهومان\n${pair.labelAr}\n\n# النصوص المتاحة\n${evidence.map((e) => `[${e.canonicalId}]\n${e.text.slice(0, 1200)}`).join("\n\n")}` }],
        schema: { type: "OBJECT", properties: { kind: { type: "STRING" }, prompt: { type: "STRING" }, options: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, correct: { type: "BOOLEAN" } }, required: ["text", "correct"] } }, explanation: { type: "STRING" }, citedIds: { type: "ARRAY", items: { type: "STRING" } } }, required: ["prompt", "options"] },
        temperature: 0.3, maxOutputTokens: 900,
      }, { now });
    } catch (e) {
      if (e instanceof BudgetError || e instanceof ProviderError || e instanceof PermanentError) return { error: "ai_unavailable", status: 503 };
      throw e;
    }
    const j = out.json || {};
    const allowed = new Set(evidence.map((e) => e.canonicalId));
    const cited = (j.citedIds || []).filter((id) => allowed.has(id));
    if (!j.prompt?.trim() || (j.citedIds || []).some((id) => !allowed.has(id))) return { error: "invalid_generation", status: 502 }; // a citation outside the provided articles voids the item
    // free model text never carries an article the prompt did not provide: scrub every string like a chat answer
    const { scrub } = require("../utils/law/chatCitations");
    const knownSlugs = (await rawDb().lawCode.findMany({ select: { slug: true } })).map((c) => c.slug);
    const clean = (t) => scrub(String(t || ""), allowed, knownSlugs).text;
    const made = await this.createDrillItem({ pairId: pair.id, kind: ["WHICH_APPLIES", "CRITERIA", "TRUE_FALSE"].includes(j.kind) ? j.kind : "WHICH_APPLIES", prompt: clean(j.prompt), options: (j.options || []).map((o) => ({ text: clean(o.text), correct: o.correct === true })), explanation: clean(j.explanation), citedIds: cited }, { source: "AI", reviewed: false, ownerUserId: userId });
    if (made.error) return { error: made.error === "unknown_article" ? "invalid_generation" : made.error, status: 502 };
    return { item: presentDrill(made.item), error: null };
  },

  // ---- admin aggregates (k-anonymity) ----
  /**
   * Cohort-level statistics only. To resist differencing and padding: the exact cohort size is never returned (just
   * ">= 20"), a cell appears only if >= 20 students share it AND >= 20 students do not (no "everyone"/"all but one"),
   * percentages are rounded to 10%, and only memories backed by >= 2 pieces of evidence on accounts >= 7 days old count.
   */
  aggregates: async function (semester, now = new Date()) {
    const students = await rawDb().lawUserProfile.findMany({ where: { semester: String(semester || "") }, select: { userId: true } });
    const ids = students.map((s) => s.userId);
    const off = new Set((await rawDb().lawUserPreferences.findMany({ where: { userId: { in: ids }, memoryEnabled: false }, select: { userId: true } })).map((p) => p.userId));
    const users = await rawDb().users.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } });
    const seasoned = new Set(users.filter((u) => now - new Date(u.createdAt) >= 7 * 86400000).map((u) => u.id));
    const cohort = ids.filter((i) => !off.has(i) && seasoned.has(i));
    if (cohort.length < K_ANON * 2) return { semester, cohort: `<${K_ANON * 2}`, rows: [] }; // too few students to split into >= 20 vs >= 20
    const ms = await rawDb().lawLearnerMemory.findMany({ where: { userId: { in: cohort }, status: { in: ["ACTIVE", "IMPROVING"] }, evidenceCount: { gte: 2 }, NOT: { confusionPairId: "" } }, select: { userId: true, confusionPairId: true } });
    const by = new Map();
    for (const m of ms) { const s2 = by.get(m.confusionPairId) || new Set(); s2.add(m.userId); by.set(m.confusionPairId, s2); }
    const pairs = new Map((await rawDb().lawConfusionPair.findMany()).map((p) => [p.id, p]));
    const rows = [...by]
      .filter(([, set]) => set.size >= K_ANON && cohort.length - set.size >= K_ANON)
      .map(([pairId, set]) => ({ pairId, labelAr: pairs.get(pairId)?.labelAr, percent: Math.round(((set.size / cohort.length) * 100) / 10) * 10 }))
      .sort((a, b) => b.percent - a.percent);
    return { semester, cohort: `>=${K_ANON * 2}`, rows };
  },
};

function presentConcept(c) { return { id: c.id, slug: c.slug, titleAr: c.titleAr, titleFr: c.titleFr, domain: c.domain, legalRefs: parse(c.legalRefs, []), moduleIds: parse(c.moduleIds, []), reviewed: c.reviewed }; }
function presentDrill(i) { return { id: i.id, pairId: i.pairId, kind: i.kind, prompt: i.prompt, options: parse(i.options, []).map((o) => ({ text: o.text })), aiGenerated: i.source === "AI" && !i.reviewed }; }
function validateDrill(b) {
  if (!["WHICH_APPLIES", "CRITERIA", "TRUE_FALSE"].includes(b.kind)) return "invalid_drill";
  if (typeof b.prompt !== "string" || !b.prompt.trim()) return "invalid_drill";
  if (!Array.isArray(b.options) || b.options.length < 2 || b.options.length > 4 || b.options.some((o) => typeof o?.text !== "string" || !o.text.trim())) return "invalid_drill";
  return b.options.filter((o) => o.correct === true).length === 1 ? null : "invalid_drill";
}

module.exports = { LawBrain, WEAK_SUBJECT };
