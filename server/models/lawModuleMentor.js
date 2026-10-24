// RC3 Phase 3: the in-module mentor. It sees only this student's material for this module (course-note nodes and the
// text of their lecture sources), so what it says can always be traced back to something the student put there.
//   qa     answers a question; an answer that cites nothing from the sources is replaced by "not found in your sources"
//   build  proposes additions/edits to the course notes; nothing changes until the student accepts (diff review)
// It never grades or drills (the Exam Center does), never cites law from memory (unverifiable citations are stripped
// and reported), and everything it writes is labelled as AI-generated.
const { rawDb } = require("../utils/law/dbClient");
const { generate } = require("../utils/law/ai/router");
const { BudgetError, PermanentError, ProviderError } = require("../utils/law/ai/errors");
const { loadPrompt } = require("../utils/law/prompts");
const { scrubKeepingQuotes } = require("../utils/law/groundedText");
const { materialOf, retrieve, chunkText, labelled, pickMixed, parseMix } = require("../utils/law/moduleMaterial");
const { LawMentorMemory } = require("./lawMentorMemory");
const quota = require("../utils/law/aiQuota");
const { serialWrite } = require("../utils/law/writeLock");
const E = require("../utils/law/enums");
const { LawModule } = require("./lawModule");

const LOCALES = ["ar", "ary", "fr", "en"];
const MAX_QUESTION = 1000;
const TOP_K = 8;
const OUTLINE_MAX = 80;
const MAX_PROPOSALS = 8;
const MAX_PENDING = 50;
const NOT_IN_SOURCES = "لم أجد في مصادر هذه المادة ما يجيب عن سؤالك. أضف محاضرة أو نصا إلى المادة ثم أعد السؤال؛ ولن أجيب من خارج مصادرك.";
const MIX_EXCLUDES = "اخترت في «مصادر المادة» أنواعاً ليس فيها محتوى لهذه المادة بعد. عدّل نسب المصادر أو أضف مصادر من هذا النوع.";
const NO_MATERIAL = "هذه المادة لا تحتوي على مصادر بعد. أضف محاضرة (نصا أو صوتا أو صورا أو ملف PDF) أو اكتب ملاحظاتك أولا.";

const SCHEMAS = {
  qa: {
    type: "OBJECT",
    properties: { answer: { type: "STRING" }, refs: { type: "ARRAY", items: { type: "STRING" } }, remember: { type: "STRING" } },
    required: ["answer", "refs"],
  },
  build: {
    type: "OBJECT",
    properties: {
      proposals: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            op: { type: "STRING" }, nodeId: { type: "STRING" }, parentId: { type: "STRING" }, title: { type: "STRING" }, body: { type: "STRING" },
            refs: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["op", "title", "body", "refs"],
        },
      },
    },
    required: ["proposals"],
  },
};

async function proposalsOf(userId, moduleId, status) {
  const rows = await rawDb().lawModuleProposal.findMany({ where: { userId, moduleId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map(presentProposal);
}

const parseJson = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
const fenceText = (x) => String(x).replace(/<\s*\/?\s*module_sources\s*>/gi, "");
const presentProposal = (p) => ({ id: p.id, op: p.op, nodeId: p.nodeId, parentId: p.parentId, title: p.title, body: p.body, baseBody: p.baseBody, sourceRefs: parseJson(p.sourceRefs, []), status: p.status, createdAt: p.createdAt });

const LawModuleMentor = {
  NOT_IN_SOURCES, NO_MATERIAL, MIX_EXCLUDES, retrieve, chunkText,

  ask: async function (userId, moduleId, input, { now = new Date() } = {}) {
    const m = await LawModule.visible(userId, moduleId);
    if (!m) return { error: "not_found" };
    const b = input && typeof input === "object" ? input : {};
    if (!E.isOneOf(E.MENTOR_MODES, b.mode)) return { error: "invalid_mode" };
    const question = typeof b.question === "string" ? b.question.trim() : "";
    if (!question || question.length > MAX_QUESTION) return { error: "invalid_question" };
    const locale = LOCALES.includes(b.locale) ? b.locale : "ar";
    const id = String(moduleId);

    await LawModule.refreshPending(userId, id);
    const { pieces, nodes } = await materialOf(userId, id);
    if (!pieces.length) return { answer: NO_MATERIAL, refs: [], grounded: false, aiGenerated: false, proposals: [], error: null };
    const profile = await rawDb().lawModuleProfile.findUnique({ where: { userId_moduleId: { userId, moduleId: id } } });
    const picked = pickMixed(pieces, parseMix(profile?.sourceMix), question, TOP_K, { broad: b.mode === "build" }); // the student's own share of lectures / handout / texts
    const mix = parseMix(profile?.sourceMix);
    if (!picked.length && mix && !pickMixed(pieces, mix, "", 1).length) return { answer: MIX_EXCLUDES, refs: [], grounded: false, aiGenerated: false, proposals: [], error: null }; // the mix, not the question, left nothing to read
    if (!picked.length) return { answer: NOT_IN_SOURCES, refs: [], grounded: false, aiGenerated: false, proposals: [], error: null };

    // Short labels the model can cite; validated against this map afterwards.
    const { labelOf, block: sourcesBlock } = labelled(picked);
    const sourcesText = picked.map((p) => p.text).join("\n");
    const nodeLabel = new Map();
    nodes.slice(0, OUTLINE_MAX).forEach((n, i) => nodeLabel.set(`N${i + 1}`, n));
    if (b.mode === "build") {
      const pending = await rawDb().lawModuleProposal.count({ where: { userId, moduleId: id, status: "pending" } });
      if (pending >= MAX_PENDING) return { error: "too_many_pending", status: 409 };
    }

    const [card, memory] = await Promise.all([
      rawDb().lawProfessorCard.findUnique({ where: { userId_moduleId: { userId, moduleId: id } } }),
      LawMentorMemory.forPrompt(userId, id),
    ]);
    const hints = [
      `العمق: ${profile?.depth === "detailed" ? "مفصل وشامل" : profile?.depth === "verbatim" ? "غير ملخص: احتفظ بنص المصدر كما هو دون اختصار" : "مختصر ولاصق"}`,
      card?.examTendency && card.examTendency !== "unknown" ? `ميل الأستاذ في الامتحان (حسب الطالب): ${card.examTendency}` : null,
    ].filter(Boolean).join("\n");
    const memoryBlock = memory.length ? `# <student_memory>\n${memory.map((x) => `- ${fenceText(x).replace(/<\s*\/?\s*student_memory\s*>/gi, "")}`).join("\n")}\n</student_memory>\n\n` : "";
    const outline = b.mode === "build" && nodeLabel.size ? `# بنية الملاحظات الحالية\n${[...nodeLabel].map(([k, n]) => `[${k}] ${"–".repeat(n.level)} ${fenceText(n.title)}`).join("\n")}\n\n` : "";

    let receipt;
    try {
      receipt = await quota.reserve(userId, now);
    } catch (e) {
      if (e instanceof quota.QuotaError) return { error: "AI_QUOTA_EXCEEDED", resetAt: e.resetAt, limit: e.limit, status: 429 };
      throw e;
    }
    let out;
    try {
      const prompt = loadPrompt("module_mentor", 1);
      out = await generate({
        purpose: "module_mentor",
        prompt,
        system: prompt.text,
        parts: [{ text: `الوضع: ${b.mode}\nلغة الاستجابة: ${locale}\nالمادة: ${m.title}\n${hints}\n\n${memoryBlock}${outline}# <module_sources>\n${sourcesBlock}\n</module_sources>\n\n# طلب الطالب\n${question}` }],
        schema: SCHEMAS[b.mode],
        temperature: 0.2,
        maxOutputTokens: b.mode === "build" ? 4096 : 2048,
      }, { now });
    } catch (e) {
      await quota.refund(receipt); // the answer was not produced: give the turn back, exactly once
      if (e instanceof BudgetError || e instanceof ProviderError || e instanceof PermanentError) return { error: "ai_unavailable", status: 503 };
      throw e;
    }

    const knownSlugs = (await rawDb().lawCode.findMany({ select: { slug: true } })).map((c) => c.slug);
    const cite = (refs) => [...new Set((Array.isArray(refs) ? refs : []).map((r) => String(r).replace(/[\[\]\s]/g, "")).filter((r) => labelOf.has(r)))];
    const sourcesOf = (labels) => labels.map((l) => labelOf.get(l).ref);
    const refsInfo = (labels) => labels.map((l) => ({ label: l, ref: labelOf.get(l).ref, title: labelOf.get(l).label }));
    const status = await quota.status(userId, now);

    if (b.mode === "qa") {
      const j = out.json || { answer: out.text || "", refs: [] };
      const labels = cite(j.refs);
      if (!labels.length || !String(j.answer || "").trim()) return { answer: NOT_IN_SOURCES, refs: [], grounded: false, aiGenerated: false, proposals: [], quota: status, error: null };
      const s = scrubKeepingQuotes(String(j.answer), sourcesText, knownSlugs);
      // A note about how the student learns, offered (never saved) when the memory switch is on.
      const rem = typeof j.remember === "string" ? j.remember.replace(/\s+/g, " ").trim() : "";
      const remScrubbed = rem ? scrubKeepingQuotes(rem, sourcesText, knownSlugs) : { text: "", stripped: [] };
      const memorySuggestion = rem && remScrubbed.stripped.length === 0 && rem.length <= LawMentorMemory.MAX_LEN && (await LawMentorMemory.enabled(userId)) ? rem : null; // a suggestion that cites law from nowhere is dropped
      return { answer: s.text || NOT_IN_SOURCES, refs: refsInfo(labels), grounded: !!s.text, aiGenerated: true, unverifiedCitations: s.stripped, memorySuggestion, proposals: [], quota: status, error: null };
    }

    // build: keep only well-formed proposals that cite the sources they used
    const raw = Array.isArray(out.json?.proposals) ? out.json.proposals.slice(0, MAX_PROPOSALS) : [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const resolveNode = (v) => (v ? nodeLabel.get(String(v).replace(/[\[\]\s]/g, ""))?.id || (byId.has(String(v)) ? String(v) : null) : null);
    const rows = [];
    const stripped = new Set();
    for (const r of raw) {
      const labels = cite(r?.refs);
      const title = typeof r?.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
      const bodyS = scrubKeepingQuotes(typeof r?.body === "string" ? r.body.slice(0, 20000) : "", sourcesText, knownSlugs);
      bodyS.stripped.forEach((x) => stripped.add(x));
      if (!labels.length || !title || (r.op !== "add" && r.op !== "edit")) continue;
      if (r.op === "edit") {
        const target = resolveNode(r.nodeId);
        if (!target) continue;
        rows.push({ op: "edit", nodeId: target, parentId: null, title, body: bodyS.text, baseBody: byId.get(target).body, baseTitle: byId.get(target).title, sourceRefs: sourcesOf(labels) });
      } else {
        const parent = r.parentId ? resolveNode(r.parentId) : null;
        if (r.parentId && !parent) continue;
        rows.push({ op: "add", nodeId: null, parentId: parent, title, body: bodyS.text, baseBody: null, baseTitle: null, sourceRefs: sourcesOf(labels) });
      }
    }
    // Re-checked here, inside the serialised write: two builds started together cannot both fill the last slots.
    const created = await serialWrite(async () => {
      const pending = await rawDb().lawModuleProposal.count({ where: { userId, moduleId: id, status: "pending" } });
      const room = Math.max(0, MAX_PENDING - pending);
      return rawDb().$transaction(rows.slice(0, room).map((d) => rawDb().lawModuleProposal.create({ data: { userId, moduleId: id, ...d, sourceRefs: JSON.stringify(sourceIds(d.sourceRefs)) } })));
    });
    return { answer: "", refs: [], grounded: created.length > 0, aiGenerated: true, unverifiedCitations: [...stripped], proposals: created.map(presentProposal), quota: status, error: null };
  },

  proposals: async function (userId, moduleId, status) {
    if (!(await LawModule.visible(userId, moduleId))) return { error: "not_found" };
    if (status && !["pending", "accepted", "rejected"].includes(status)) return { error: "invalid_status" };
    return { proposals: await proposalsOf(userId, String(moduleId), status), error: null };
  },

  /** Applies a proposal to the content tree. A proposal made against an older version of the node is stale (409). */
  accept: async function (userId, moduleId, proposalId) {
    if (!(await LawModule.visible(userId, moduleId))) return { error: "not_found" };
    const id = String(moduleId);
    return serialWrite(async () => {
      const p = await rawDb().lawModuleProposal.findFirst({ where: { id: String(proposalId || ""), userId, moduleId: id } });
      if (!p) return { error: "not_found" };
      if (p.status !== "pending") return { error: "already_decided", status: 409 };
      const refs = parseJson(p.sourceRefs, []);
      let node;
      if (p.op === "edit") {
        const n = await rawDb().lawModuleNode.findFirst({ where: { id: p.nodeId || "", userId, moduleId: id } });
        if (!n) return { error: "node_missing", status: 409 };
        if (n.body !== (p.baseBody ?? "") || (p.baseTitle != null && n.title !== p.baseTitle)) return { error: "stale", status: 409 };
        node = await rawDb().lawModuleNode.update({ where: { id: n.id }, data: { title: p.title, body: p.body, aiDraft: true, sourceRefs: JSON.stringify([...new Set([...parseJson(n.sourceRefs, []), ...refs])]) } });
      } else {
        let parent = null;
        if (p.parentId) {
          parent = await rawDb().lawModuleNode.findFirst({ where: { id: p.parentId, userId, moduleId: id } });
          if (!parent) return { error: "node_missing", status: 409 };
        }
        const level = parent ? parent.level + 1 : 0;
        if (level >= 6) {
          await rawDb().lawModuleProposal.update({ where: { id: p.id }, data: { status: "rejected" } }); // it can never be applied: do not leave it pending forever
          return { error: "too_deep" };
        }
        const last = await rawDb().lawModuleNode.findFirst({ where: { userId, moduleId: id, parentId: parent ? parent.id : null }, orderBy: { ord: "desc" } });
        node = await rawDb().lawModuleNode.create({ data: { userId, moduleId: id, parentId: parent ? parent.id : null, level, kind: level === 0 ? "lecture" : "section", title: p.title, body: p.body, ord: (last?.ord ?? -1) + 1, sourceRefs: JSON.stringify(refs), aiDraft: true } });
      }
      await rawDb().lawModuleProposal.update({ where: { id: p.id }, data: { status: "accepted" } });
      return { node: { id: node.id, title: node.title, body: node.body, aiDraft: node.aiDraft }, error: null };
    });
  },

  reject: async function (userId, moduleId, proposalId) {
    if (!(await LawModule.visible(userId, moduleId))) return { error: "not_found" };
    const r = await rawDb().lawModuleProposal.updateMany({ where: { id: String(proposalId || ""), userId, moduleId: String(moduleId), status: "pending" }, data: { status: "rejected" } });
    if (r.count) return { error: null };
    const exists = await rawDb().lawModuleProposal.findFirst({ where: { id: String(proposalId || ""), userId, moduleId: String(moduleId) } });
    return exists ? { error: "already_decided", status: 409 } : { error: "not_found" };
  },
};

/** "s:12:3" / "n:abc" -> source ids (integers); node refs carry no source id. */
function sourceIds(refs) {
  return [...new Set(refs.map((r) => /^s:(\d+):/.exec(r)).filter(Boolean).map((m) => Number(m[1])))];
}

module.exports = { LawModuleMentor, scrubKeepingQuotes };
