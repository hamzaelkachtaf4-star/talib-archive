// Phase 10.6: the Tutor Brain: mistakes the AI made, reported by students and VERIFIED by an admin against the corpus.
//  - A report affects only the reporter's own future answers on the same topic, as a prompt to re-check (never as truth).
//  - Only an admin-verified MODEL_ERROR becomes a global <verified_corrections> entry. Every verification also writes an
//    eval case (server/__tests__/ai-evals/cases) so a regression fails the release, the runtime twin of brain/memories.
const fs = require("fs");
const path = require("path");
const { rawDb } = require("../utils/law/dbClient");
const { LawCorpus } = require("./lawCorpus");
const { hit } = require("../utils/law/rateLimit");
const { normalize } = require("../utils/law/arabic");

const ROOT_CAUSES = ["CORPUS_PARSE", "RETRIEVAL_MISS", "MODEL_ERROR", "PROMPT_GAP"];
const MAX_PENDING = 20;
const EVAL_DIR = () => process.env.LAWOS_EVAL_DIR || path.join(__dirname, "../__tests__/ai-evals/cases");
const parse = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const idOf = (r) => `${r.slug}:${r.number}`;
/** Student/admin text that ends up inside a prompt: one line, no angle brackets (cannot open or close a prompt block), bounded. */
const plain = (t, max) => String(t ?? "").replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const MIN_CLAIM = 12;

async function notify(userId, type, payload) {
  await rawDb().lawNotification.create({ data: { userId, type, payload: JSON.stringify(payload) } });
}

const LawTutorBrain = {
  ROOT_CAUSES,

  /** A student disputes one sentence of one assistant message, citing at least one corpus article. */
  report: async function (userId, messageId, b = {}) {
    const msg = await rawDb().lawChatMessage.findUnique({ where: { id: String(messageId || "") }, include: { thread: true } });
    if (!msg || msg.role !== "assistant" || msg.thread.userId !== userId) return { error: "not_found" };
    const claim = typeof b.claim === "string" ? plain(b.claim, 600) : "";
    const correction = typeof b.correction === "string" ? plain(b.correction, 1000) : "";
    if (claim.length < MIN_CLAIM || !normalize(msg.content).includes(normalize(claim))) return { error: "claim_not_in_message" };
    if (correction.length < MIN_CLAIM) return { error: "invalid_correction" };
    const cites = Array.isArray(b.citations) ? b.citations : [];
    if (!cites.length || cites.length > 10 || cites.some((c) => typeof c?.slug !== "string" || typeof c?.number !== "string")) return { error: "citation_required" };
    const res = await LawCorpus.resolve(cites.map(idOf));
    if (!Object.values(res).every((r) => r.exists)) return { error: "unknown_article" }; // the correction itself must be grounded in the corpus
    if (!(await hit("ai-correction", userId, 10))) return { error: "rate_limited", status: 429 };
    if ((await rawDb().lawAiCorrection.count({ where: { reporterId: userId, status: "PENDING" } })) >= MAX_PENDING) return { error: "too_many_pending", status: 429 };
    const evidenceIds = parse(msg.citations, {})?.verified || [];
    // topic = the few articles the correction rests on (+ what the answer cited): a report cannot be pinned to arbitrary articles
    const topicKeys = [...new Set([...cites.slice(0, 3).map(idOf), ...evidenceIds.filter((id) => cites.some((c) => idOf(c) === id))])];
    const c = await rawDb().lawAiCorrection.create({ data: { messageId: msg.id, reporterId: userId, claim, correction, citations: JSON.stringify(cites), topicKeys: JSON.stringify(topicKeys) } });
    return { correction: present(c), error: null };
  },

  mine: async function (userId) {
    return (await rawDb().lawAiCorrection.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" }, take: 50 })).map(present);
  },

  /** Blocks for the tutor prompt for the topics (canonical ids) of this turn. */
  blocksFor: async function (userId, topicIds) {
    if (!topicIds.length) return { verified: "", disputes: "" };
    const overlap = (c) => parse(c.topicKeys, []).some((k) => topicIds.includes(k));
    const globals = (await rawDb().lawAiCorrection.findMany({ where: { status: "VERIFIED", scope: "GLOBAL", rootCause: "MODEL_ERROR" }, orderBy: { decidedAt: "desc" }, take: 100 })).filter(overlap).slice(0, 5);
    const mine = (await rawDb().lawAiCorrection.findMany({ where: { reporterId: userId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 })).filter(overlap).slice(0, 3);
    const refs = (c) => parse(c.citations, []).map((r) => `[${idOf(r)}]`).join(" ");
    return {
      verified: globals.length ? `<verified_corrections>\n${globals.map((c) => `- خطأ سابق: «${plain(c.claim, 300)}» ← الصحيح: ${plain(c.correction, 500)} ${refs(c)}`).join("\n")}\n</verified_corrections>` : "",
      disputes: mine.length ? `<user_disputes>\n${mine.map((c) => `- اعترض الطالب على: «${plain(c.claim, 300)}» مستندا إلى ${refs(c)}؛ أعد التحقق من النص قبل أن تجيب.`).join("\n")}\n</user_disputes>` : "",
    };
  },

  // ---- admin ----
  /** Admin view: the claim, the proposed fix and the TEXT of the cited articles (never the student's conversation). */
  list: async function (status) {
    const where = ["PENDING", "VERIFIED", "REJECTED"].includes(status) ? { status } : {};
    const rows = await rawDb().lawAiCorrection.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    const out = [];
    for (const c of rows) {
      const refs = parse(c.citations, []);
      const res = refs.length ? await LawCorpus.resolve(refs.map(idOf)) : {};
      out.push({ ...present(c), articles: refs.map((r) => ({ canonicalId: idOf(r), text: res[idOf(r)]?.text || null })) });
    }
    return out;
  },

  /** decision "verify" needs a rootCause; only MODEL_ERROR becomes a global correction. Returns the generated eval case. */
  decide: async function (adminId, id, { decision, rootCause, note, correction, evalQuestion } = {}, { writeEval = true } = {}) {
    const c = await rawDb().lawAiCorrection.findUnique({ where: { id: String(id || "") } });
    if (!c) return { error: "not_found" };
    if (c.status !== "PENDING") return { error: "already_decided", status: 409 };
    if (decision === "reject") {
      const won = await rawDb().lawAiCorrection.updateMany({ where: { id: c.id, status: "PENDING" }, data: { status: "REJECTED", reviewerId: adminId, decidedAt: new Date() } });
      if (won.count !== 1) return { error: "already_decided", status: 409 };
      await notify(c.reporterId, "AI_CORRECTION_REJECTED", { correctionId: c.id });
      return { error: null };
    }
    if (decision !== "verify" || !ROOT_CAUSES.includes(rootCause)) return { error: "invalid_decision" };
    // re-check the supporting articles at decision time (the corpus may have changed since the report)
    const res = await LawCorpus.resolve(parse(c.citations, []).map(idOf));
    if (!Object.values(res).every((r) => r.exists)) return { error: "unknown_article" };
    // The admin owns the final wording (a global correction is never the student's raw text) and writes the neutral eval question.
    const finalText = correction === undefined ? c.correction : plain(correction, 1000);
    if (finalText.length < MIN_CLAIM) return { error: "invalid_correction" };
    const won = await rawDb().lawAiCorrection.updateMany({ where: { id: c.id, status: "PENDING" }, data: { status: "VERIFIED", correction: finalText, rootCause, scope: rootCause === "MODEL_ERROR" ? "GLOBAL" : "USER", reviewerId: adminId, decidedAt: new Date() } });
    if (won.count !== 1) return { error: "already_decided", status: 409 };
    const updated = await rawDb().lawAiCorrection.findUnique({ where: { id: c.id } });
    const evalCase = await this._evalCase(updated, note, evalQuestion);
    if (writeEval) {
      try {
        fs.mkdirSync(EVAL_DIR(), { recursive: true });
        fs.writeFileSync(path.join(EVAL_DIR(), `${updated.id}.json`), JSON.stringify(evalCase, null, 2));
      } catch (e) {
        console.error("[brain] eval case not written (copy it from the API response):", e.message);
      }
    }
    await notify(c.reporterId, "AI_CORRECTION_VERIFIED", { correctionId: c.id, rootCause });
    return { correction: present(updated), evalCase, error: null };
  },

  /** An eval case holds only the admin's neutral question, the verified claim/fix and corpus ids: no student conversation. */
  async _evalCase(c, note, question) {
    const msg = await rawDb().lawChatMessage.findUnique({ where: { id: c.messageId }, include: { thread: true } });
    return {
      id: c.id,
      question: question ? plain(question, 400) : "", // empty => the runner skips the case until a human writes the question
      scope: { codeSlugs: parse(msg?.scopeSnapshot, {}).codeSlugs || [...new Set(parse(c.citations, []).map((r) => r.slug))] },
      mustCite: parse(c.citations, []).map(idOf),
      mustNotSay: [c.claim],
      expected: c.correction,
      rootCause: c.rootCause,
      note: note ? plain(note, 300) : null,
    };
  },
};

function present(c) {
  return { id: c.id, messageId: c.messageId, claim: c.claim, correction: c.correction, citations: parse(c.citations, []), rootCause: c.rootCause, scope: c.scope, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt };
}

module.exports = { LawTutorBrain };
