// Phase 6: grounded legal chat. Threads are private to their student; every answer is built only from the
// corpus articles retrieved inside the thread's selected references (plus the student's own attachments/notes,
// which are study material, never legal sources). Quota is charged per answer and refunded when WE fail.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { rawDb, db } = require("../utils/law/dbClient");
const { lawPath } = require("../utils/law/storage");
const { generate } = require("../utils/law/ai/router");
const { BudgetError, PermanentError, ProviderError } = require("../utils/law/ai/errors");
const { loadPrompt } = require("../utils/law/prompts");
const { retrieveEvidence, evidenceBlock } = require("../utils/law/grounding");
const { checkChatOutput } = require("../utils/law/chatCitations");
const quota = require("../utils/law/aiQuota");
const { branchBlock } = require("../utils/law/legal/branches");
const { LawBrain } = require("./lawBrain");
const { LawTutorBrain } = require("./lawTutorBrain");
const { LawCorpus } = require("./lawCorpus");
const { lawConfig } = require("../utils/law/config");

const MAX_TEXT = 4000;
const MAX_SLUGS = 10;
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;
const LOCALES = ["ar", "ary", "fr", "en"];
const MIME = {
  "image/jpeg": "IMAGE", "image/png": "IMAGE", "image/webp": "IMAGE",
  "application/pdf": "PDF",
  "audio/mpeg": "AUDIO", "audio/mp3": "AUDIO", "audio/mp4": "AUDIO", "audio/x-m4a": "AUDIO", "audio/m4a": "AUDIO", "audio/3gpp": "AUDIO",
  "audio/wav": "AUDIO", "audio/x-wav": "AUDIO", "audio/webm": "AUDIO", "audio/ogg": "AUDIO", "audio/aac": "AUDIO",
};
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
const extFor = (mime) => EXT[mime] || ".bin";
const MAX_UPLOADS_PER_DAY = 20;
const MAX_UNATTACHED = 10;
const MAX_THREADS = 100;
const MAX_MESSAGES_PER_THREAD = 400;
const STALE_MS = 24 * 3600 * 1000;

const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    citations: { type: "ARRAY", items: { type: "OBJECT", properties: { canonicalId: { type: "STRING" }, quote: { type: "STRING" } }, required: ["canonicalId"] } },
  },
  required: ["answer"],
};
const NO_CONTEXT = "لم أجد في المراجع التي اخترتَها ما يجيب عن سؤالك. أضف إلى «المراجع القانونية» المدونة أو القانون المعني (أو أرفق ملاحظاتك) ثم أعد السؤال؛ ولن أستشهد بمادة لا توجد في مراجعك.";

const parse = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const present = (m) => ({ id: m.id, role: m.role, content: m.content, citations: parse(m.citations, null), createdAt: m.createdAt, attachments: (m.attachments || []).map(presentAttachment) });
const presentAttachment = (a) => ({ id: a.id, kind: a.kind, mime: a.mime, sizeBytes: a.sizeBytes, status: a.status });

async function validateScope(userId, scope = {}) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return { error: "invalid_scope" };
  const out = { codeSlugs: [], noteIds: [], includeAttachments: scope.includeAttachments !== false };
  if (scope.codeSlugs !== undefined) {
    if (!Array.isArray(scope.codeSlugs) || scope.codeSlugs.length > MAX_SLUGS || scope.codeSlugs.some((s) => typeof s !== "string")) return { error: "invalid_scope" };
    const codes = await rawDb().lawCode.findMany({ where: { slug: { in: scope.codeSlugs } }, select: { slug: true } });
    if (codes.length !== new Set(scope.codeSlugs).size) return { error: "unknown_reference" };
    out.codeSlugs = [...new Set(scope.codeSlugs)];
  }
  if (scope.noteIds !== undefined) {
    if (!Array.isArray(scope.noteIds) || scope.noteIds.length > 10 || scope.noteIds.some((s) => typeof s !== "string")) return { error: "invalid_scope" };
    const own = await rawDb().lawNoteAtom.findMany({ where: { id: { in: scope.noteIds }, userId, deletedAt: null }, select: { id: true } });
    if (own.length !== new Set(scope.noteIds).size) return { error: "unknown_reference" };
    out.noteIds = [...new Set(scope.noteIds)];
  }
  return { scope: out };
}

/** Domain reasoning rules: the governing provisions are QUOTED FROM THE CORPUS into the context, never from memory. */
async function domainEvidence(slugs, at) {
  const codes = await rawDb().lawCode.findMany({ where: { slug: { in: slugs } }, select: { slug: true, domain: true } });
  const out = [];
  for (const c of codes) {
    if (c.domain === "COMMERCIAL") {
      // the Commercial Code's opening provisions fix the hierarchy of commercial sources
      const r = await LawCorpus.resolve([1, 2, 3].map((n) => `${c.slug}:${n}`), at);
      for (const v of Object.values(r)) if (v.exists && v.text) out.push({ canonicalId: v.canonicalId, text: v.text, verifiedByUser: v.verifiedByUser });
    }
    if (c.domain === "CRIMINAL") {
      const ev = await retrieveEvidence({ texts: ["لا جريمة ولا عقوبة إلا بنص قانوني"], at, scopeSlugs: [c.slug] });
      out.push(...ev.slice(0, 2));
    }
  }
  return out;
}

/** Slugs among the evidence whose text has not been spot-checked yet (LawCode.reviewed=false). */
async function unreviewedSlugs(evidence) {
  const slugs = [...new Set(evidence.map((e) => String(e.canonicalId).split(":")[0]))];
  if (!slugs.length) return [];
  const rows = await rawDb().lawCode.findMany({ where: { slug: { in: slugs }, reviewed: false }, select: { slug: true } });
  return rows.map((r) => r.slug);
}

async function attachmentContext(userId, ids) {
  if (!ids.length) return "";
  const rows = await rawDb().lawChatAttachment.findMany({ where: { id: { in: ids }, userId, status: "EXTRACTED" } });
  return rows.map((a, i) => `[مرفق ${i + 1} - مادة دراسية للطالب وليست مصدرا قانونيا]\n${(a.extractedText || "").slice(0, 6000)}`).join("\n\n");
}

async function notesContext(userId, ids) {
  if (!ids.length) return "";
  const rows = await rawDb().lawNoteAtom.findMany({ where: { id: { in: ids }, userId, deletedAt: null } });
  return rows.map((n, i) => `[ملاحظة ${i + 1} - من ملاحظات الطالب]\n${n.body.slice(0, 2000)}`).join("\n\n");
}

const LawChat = {
  MAX_ATTACH_BYTES, MIME,

  /** Reference suggestion for an empty scope: codes that actually have articles, ordered by the student's track. */
  suggestedScope: async function (userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { track: true } });
    const codes = await rawDb().lawCode.findMany({ where: { articles: { some: {} } }, select: { slug: true, normLevel: true, domain: true } });
    const pub = p?.track === "PUBLIC";
    const rank = (c) => (pub ? (c.normLevel === "CONSTITUTION" || c.normLevel === "ORGANIC" || c.domain === "ADMIN" ? 0 : 1) : (c.domain === "CIVIL" || c.domain === "CRIMINAL" || c.domain === "FAMILY" ? 0 : 1));
    return { codeSlugs: codes.sort((a, b) => rank(a) - rank(b)).slice(0, 6).map((c) => c.slug) };
  },

  createThread: async function (userId, { title, scope } = {}) {
    const v = await validateScope(userId, scope || {});
    if (v.error) return { error: v.error };
    if ((await rawDb().lawChatThread.count({ where: { userId } })) >= MAX_THREADS) return { error: "too_many_threads", status: 409 };
    const t = await rawDb().lawChatThread.create({ data: { userId, title: typeof title === "string" ? title.slice(0, 120) : null, scope: JSON.stringify(v.scope) } });
    return { thread: this.presentThread(t), error: null };
  },

  presentThread: (t) => ({ id: t.id, title: t.title, scope: parse(t.scope, {}), createdAt: t.createdAt, updatedAt: t.updatedAt }),

  listThreads: async function (userId) {
    const rows = await rawDb().lawChatThread.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 100 });
    return rows.map(this.presentThread);
  },

  getThread: async function (userId, id) {
    const t = await rawDb().lawChatThread.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } } });
    if (!t) return { error: "not_found" };
    return { thread: this.presentThread(t), messages: t.messages.map(present), error: null };
  },

  setScope: async function (userId, id, scope) {
    const t = await rawDb().lawChatThread.findFirst({ where: { id, userId } });
    if (!t) return { error: "not_found" };
    const v = await validateScope(userId, scope);
    if (v.error) return { error: v.error };
    const u = await rawDb().lawChatThread.update({ where: { id }, data: { scope: JSON.stringify(v.scope) } });
    return { thread: this.presentThread(u), error: null };
  },

  deleteThread: async function (userId, id) {
    const t = await rawDb().lawChatThread.findFirst({ where: { id, userId }, select: { id: true } });
    if (!t) return { error: "not_found" };
    const atts = await rawDb().lawChatAttachment.findMany({ where: { userId, message: { threadId: id } } });
    await rawDb().lawChatAttachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
    for (const a of atts) fs.rmSync(lawPath(a.storagePath), { force: true });
    await rawDb().lawChatThread.deleteMany({ where: { id, userId } });
    return { error: null };
  },

  /** One turn: quota -> retrieve (scoped) -> model -> citation check -> store. */
  send: async function (userId, threadId, { text, attachmentIds = [], locale = "ar" } = {}, { now = new Date() } = {}) {
    const q = typeof text === "string" ? text.trim() : "";
    if (!q || q.length > MAX_TEXT) return { error: "invalid_text" };
    if (!Array.isArray(attachmentIds) || attachmentIds.length > 5 || attachmentIds.some((x) => typeof x !== "string")) return { error: "invalid_attachments" };
    const thread = await rawDb().lawChatThread.findFirst({ where: { id: threadId, userId } });
    if (!thread) return { error: "not_found" };
    if ((await rawDb().lawChatMessage.count({ where: { threadId } })) >= MAX_MESSAGES_PER_THREAD) return { error: "thread_full", status: 409 };
    const scope = parse(thread.scope, {});
    const slugs = scope.codeSlugs || [];
    if (attachmentIds.length && scope.includeAttachments === false) return { error: "invalid_attachments" };
    const att = attachmentIds.length ? await rawDb().lawChatAttachment.findMany({ where: { id: { in: attachmentIds }, userId, messageId: null } }) : [];
    if (att.length !== new Set(attachmentIds).size) return { error: "invalid_attachments" };
    const useAtt = att.filter((a) => a.status === "EXTRACTED").map((a) => a.id);
    if (!slugs.length && !useAtt.length && !(scope.noteIds || []).length) return { error: "scope_required", suggested: await this.suggestedScope(userId) };

    // Retrieval first (free): when nothing can ground an answer, say so without spending a model call or a turn.
    const evidence = slugs.length ? await retrieveEvidence({ texts: [q], at: now, scopeSlugs: slugs }) : [];
    const dom = slugs.length ? await domainEvidence(slugs, now) : [];
    const seen = new Set(evidence.map((e) => e.canonicalId));
    const allEvidence = [...evidence, ...dom.filter((d) => !seen.has(d.canonicalId))];
    const material = [await attachmentContext(userId, useAtt), await notesContext(userId, scope.noteIds || [])].filter(Boolean).join("\n\n").replace(/<\/?\s*(?:student_material|branch_rules|verified_corrections|user_disputes|learner_notes)\s*>/gi, "");
    const noContext = !allEvidence.length && !material;

    let answerText, meta, citations;
    if (noContext) {
      answerText = NO_CONTEXT;
      meta = { verified: [], unverified: [], quoteMismatches: [], banner: false, noContext: true };
      citations = [];
    } else {
      let receipt;
      try {
        receipt = await quota.reserve(userId, now);
      } catch (e) {
        if (e instanceof quota.QuotaError) return { error: "AI_QUOTA_EXCEEDED", resetAt: e.resetAt, limit: e.limit, status: 429 };
        throw e;
      }
      let out;
      try {
        const history = await rawDb().lawChatMessage.findMany({ where: { threadId }, orderBy: { createdAt: "desc" }, take: 6 });
        const prompt = loadPrompt("legal_tutor", 3);
        // Brain: how to explain (learner notes, shaped by the student's own weaknesses) and what not to repeat (verified corrections).
        const learner = await LawBrain.learnerNotes(userId, slugs);
        const tutor = await LawTutorBrain.blocksFor(userId, allEvidence.map((e) => e.canonicalId));
        const brainBlocks = [learner.block, tutor.verified, tutor.disputes].filter(Boolean).join("\n\n");
        const loc = LOCALES.includes(locale) ? locale : "ar";
        const domains = slugs.length ? (await rawDb().lawCode.findMany({ where: { slug: { in: slugs } }, select: { domain: true } })).map((c) => c.domain) : [];
        const branch = branchBlock(domains);
        const hist = history.reverse().map((m) => `${m.role === "user" ? "الطالب" : "المدرّس"}: ${m.content.slice(0, 1200)}`).join("\n");
        out = await generate({
          purpose: "legal_chat",
          prompt,
          system: prompt.text,
          parts: [{ text: `لغة الجواب: ${loc}\n\n${evidenceBlock(allEvidence)}\n\n${brainBlocks ? `${brainBlocks}\n\n` : ""}${branch ? `${branch}\n\n` : ""}${material ? `# مواد الطالب\n<student_material>\n${material}\n</student_material>\n\n` : ""}${hist ? `# المحادثة السابقة\n${hist}\n\n` : ""}# السؤال\n${q}` }],
          schema: ANSWER_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 2048,
        }, { now });
      } catch (e) {
        // Only a failed model call gives the turn back, exactly once. After generate() returns, the call was made.
        if (e instanceof BudgetError || e instanceof ProviderError || e instanceof PermanentError) {
          await quota.refund(receipt);
          return { error: "ai_unavailable", status: 503 };
        }
        await quota.refund(receipt); // the call never completed (programming error before/inside generate)
        throw e;
      }
      const knownSlugs = (await rawDb().lawCode.findMany({ select: { slug: true } })).map((c) => c.slug);
      const checked = await checkChatOutput(out.json || { answer: out.text || "" }, allEvidence, { at: now, knownSlugs });
      answerText = checked.answer || NO_CONTEXT;
      citations = checked.citations;
      meta = { ...checked.meta, unreviewed: await unreviewedSlugs(allEvidence) };
      if (meta.unreviewed.length) meta.banner = true;
    }

    const [userMsg, botMsg] = await rawDb().$transaction([
      rawDb().lawChatMessage.create({ data: { threadId, role: "user", content: q, scopeSnapshot: JSON.stringify(scope) } }),
      rawDb().lawChatMessage.create({ data: { threadId, role: "assistant", content: answerText, citations: JSON.stringify({ ...meta, citations }), scopeSnapshot: JSON.stringify(scope) } }),
    ]);
    if (att.length) await rawDb().lawChatAttachment.updateMany({ where: { id: { in: att.map((a) => a.id) }, userId, messageId: null }, data: { messageId: userMsg.id } });
    await rawDb().lawChatThread.update({ where: { id: threadId }, data: { title: thread.title || q.slice(0, 60), updatedAt: new Date() } });
    LawBrain.classifyTurn(userId, q, { refId: userMsg.id, now }); // background: never delays the answer, never charged to the student
    const full = await rawDb().lawChatMessage.findMany({ where: { id: { in: [userMsg.id, botMsg.id] } }, include: { attachments: true }, orderBy: { createdAt: "asc" } });
    return { messages: full.map(present), quota: await quota.status(userId, now), error: null };
  },

  // ---- attachments (max 10 MB, mime allowlist, private per student, rate-limited, charged when AI is used) ----
  /** Removes this student's unattached uploads older than 24h (rows + files). */
  gcAttachments: async function (userId, now = new Date()) {
    const stale = await rawDb().lawChatAttachment.findMany({ where: { userId, messageId: null, createdAt: { lt: new Date(now - STALE_MS) } } });
    for (const a of stale) fs.rmSync(lawPath(a.storagePath), { force: true });
    if (stale.length) await rawDb().lawChatAttachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
  },

  addAttachment: async function (userId, { mime, buffer }, { now = new Date() } = {}) {
    const kind = MIME[mime];
    if (!kind) return { error: "unsupported_type", status: 415 };
    if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: "empty_file" };
    if (buffer.length > MAX_ATTACH_BYTES) return { error: "file_too_large", status: 413 };
    if (!magicOk(kind, mime, buffer)) return { error: "unsupported_type", status: 415 };
    await this.gcAttachments(userId, now);
    const pending = await rawDb().lawChatAttachment.count({ where: { userId, messageId: null } });
    if (pending >= MAX_UNATTACHED) return { error: "too_many_uploads", status: 429 };
    // counted in LawRateCounter, so deleting threads/attachments cannot reset the daily allowance
    if (!(await require("../utils/law/rateLimit").hit("chat-upload", userId, MAX_UPLOADS_PER_DAY, { now }))) return { error: "too_many_uploads", status: 429 };

    // Text PDFs are read locally for free. Anything that needs the AI provider costs a consultation (refunded if it fails).
    let result = null;
    let receipt = null;
    if (kind === "PDF") result = await localPdfText(buffer);
    if (!result) {
      if (!lawConfig().ai.geminiEnabled) result = { status: "UNSUPPORTED", extractedText: null };
      else {
        try {
          receipt = await quota.reserve(userId, now);
        } catch (e) {
          if (e instanceof quota.QuotaError) return { error: "AI_QUOTA_EXCEEDED", resetAt: e.resetAt, limit: e.limit, status: 429 };
          throw e;
        }
        result = await extract({ kind, mime, buffer });
        if (result.status === "FAILED") await quota.refund(receipt); // our failure
      }
    }
    const id = crypto.randomUUID();
    const dir = lawPath("chat", String(userId));
    fs.mkdirSync(dir, { recursive: true });
    const storagePath = path.join("chat", String(userId), `${id}${extFor(mime)}`);
    fs.writeFileSync(lawPath(storagePath), buffer);
    const row = await rawDb().lawChatAttachment.create({ data: { id, userId, kind, mime, sizeBytes: buffer.length, storagePath, status: result.status, extractedText: result.extractedText } });
    return { attachment: presentAttachment(row), error: null };
  },

  attachmentFile: async function (userId, id) {
    const a = await rawDb().lawChatAttachment.findFirst({ where: { id, userId } });
    return a ? { path: lawPath(a.storagePath), mime: a.mime } : null;
  },
};

function magicOk(kind, mime, b) {
  const h = b.subarray(0, 12);
  if (mime === "image/jpeg") return h[0] === 0xff && h[1] === 0xd8;
  if (mime === "image/png") return h.subarray(0, 4).toString("hex") === "89504e47";
  if (mime === "image/webp") return h.subarray(0, 4).toString() === "RIFF" && h.subarray(8, 12).toString() === "WEBP";
  if (kind === "PDF") return h.subarray(0, 4).toString() === "%PDF";
  // audio: mp3 (ID3 / frame sync), mp4/m4a/3gp (ftyp), wav, ogg, webm/matroska, aac (ADTS)
  const hex = h.toString("hex");
  return (
    h.subarray(0, 3).toString() === "ID3" || /^ff[ef][0-9a-f]/.test(hex) || h.subarray(4, 8).toString() === "ftyp" ||
    (h.subarray(0, 4).toString() === "RIFF" && h.subarray(8, 12).toString() === "WAVE") || h.subarray(0, 4).toString() === "OggS" ||
    hex.startsWith("1a45dfa3") || /^ff[f][19]/.test(hex)
  );
}

/** Text layer of a PDF without any AI call (null when it has none, e.g. a scan). Bounded in time. */
async function localPdfText(buffer) {
  try {
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const r = await Promise.race([pdfParse(buffer, { max: 50 }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))]);
    const t = r.text.trim();
    return t.length >= 80 ? { status: "EXTRACTED", extractedText: t.slice(0, 40000) } : null;
  } catch {
    return null;
  }
}

/** Images/PDF: the same Gemini extraction prompts as Capture. Audio: only when a transcription provider is configured. */
async function extract({ kind, mime, buffer }) {
  const cfg = lawConfig();
  try {
    if (!cfg.ai.geminiEnabled) return { status: "UNSUPPORTED", extractedText: null };
    const part = { inlineData: { mimeType: mime, data: buffer.toString("base64") } };
    if (kind === "AUDIO") {
      const prompt = loadPrompt("transcribe_audio", 1);
      const out = await generate({ purpose: "transcription", prompt, system: prompt.text, parts: [part], schema: { type: "OBJECT", properties: { segments: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] } } }, required: ["segments"] }, temperature: 0, maxOutputTokens: 32768 });
      return { status: "EXTRACTED", extractedText: (out.json.segments || []).map((s) => s.text).join("\n").slice(0, 40000) };
    }
    if (kind === "PDF") {
      const prompt = loadPrompt("extract_pdf_vision", 1);
      const out = await generate({ purpose: "pdf_vision", prompt, system: prompt.text, parts: [{ text: "كل الصفحات" }, part], schema: { type: "OBJECT", properties: { pages: { type: "ARRAY", items: { type: "OBJECT", properties: { page: { type: "INTEGER" }, text: { type: "STRING" } }, required: ["page", "text"] } } }, required: ["pages"] }, temperature: 0, maxOutputTokens: 65536 });
      return { status: "EXTRACTED", extractedText: (out.json.pages || []).map((p) => p.text).join("\n\n").slice(0, 40000) };
    }
    const prompt = loadPrompt("ocr_photo_batch", 1);
    const out = await generate({ purpose: "ocr", prompt, system: prompt.text, parts: [part], schema: { type: "OBJECT", properties: { pages: { type: "ARRAY", items: { type: "OBJECT", properties: { index: { type: "INTEGER" }, text: { type: "STRING" } }, required: ["index", "text"] } } }, required: ["pages"] }, temperature: 0, maxOutputTokens: 16384 });
    return { status: "EXTRACTED", extractedText: (out.json.pages || []).map((p) => p.text).join("\n\n").slice(0, 40000) };
  } catch {
    return { status: "FAILED", extractedText: null };
  }
}

module.exports = { LawChat, NO_CONTEXT };
