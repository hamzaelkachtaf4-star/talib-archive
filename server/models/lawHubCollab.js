// Phase 8: change requests, revisions, co-authors and community moderation for public master notes.
// "Document" = LawMasterNote (public, ACTIVE). Revisions are lazy snapshots: the head revision is (re)created the
// first time its content is needed, so squad edits made through the normal editor stay the source of truth.
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");
const note = require("../utils/law/masterNote");
const { merge3, blockDiff, normalizeDoc } = require("../utils/law/hubMerge");
const { hit } = require("../utils/law/rateLimit");
const { blockedBetween } = require("./lawSocial");
const { names, json } = require("./lawSquad");

const REASONS = ["INAPPROPRIATE", "VULGARITY", "SPAM_ADS", "MISLEADING_LEGAL", "COPYRIGHT", "OTHER"];
const MAX_OPEN_PER_USER = 5;
const MIN_CHANGE_CHARS = 4;
const MAX_REBASES = 10;
const DEFAULT_MOD = { reporters: 5, minAgeDays: 7, copyright: 3 };
/** Characters added + removed (character diff; block diff for very large notes). */
function changedChars(a, b) {
  if (a.length + b.length > 120000)
    return blockDiff(a, b).filter((d) => d.type !== "same").reduce((n, d) => n + d.text.length, 0);
  return require("diff").diffChars(a, b).filter((p) => p.added || p.removed).reduce((n, p) => n + p.value.length, 0);
}
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

async function modSettings() {
  const row = await rawDb().lawSetting.findUnique({ where: { key: "meta:hubModeration" } });
  try { return { ...DEFAULT_MOD, ...(row ? JSON.parse(row.value) : {}) }; } catch { return DEFAULT_MOD; }
}
async function notify(userId, type, payload) {
  await rawDb().lawNotification.create({ data: { userId, type, payload: JSON.stringify(payload) } });
}

/** A note students may interact with: public and not hidden/removed. */
async function liveNote(noteId) {
  const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
  return n && n.visibility === "public" && n.moderationStatus === "ACTIVE" ? n : null;
}

async function ensureHead(n) {
  const hash = sha(n.content);
  const head = n.headRevisionId ? await rawDb().lawNoteRevision.findUnique({ where: { id: n.headRevisionId } }) : null;
  if (head && head.contentHash === hash) return head;
  const rev = await rawDb().lawNoteRevision.create({
    data: { noteId: n.id, parentId: head?.id || null, authorId: n.updatedById || n.createdById, content: n.content, contentHash: hash, message: head ? "edit" : "initial" },
  });
  // compare-and-set: of two concurrent callers only one moves the head; the other adopts it (no duplicate head revisions)
  const won = await rawDb().lawMasterNote.updateMany({ where: { id: n.id, headRevisionId: n.headRevisionId }, data: { headRevisionId: rev.id } });
  if (won.count === 1) return rev;
  await rawDb().lawNoteRevision.delete({ where: { id: rev.id } });
  const fresh = await rawDb().lawMasterNote.findUnique({ where: { id: n.id } });
  return rawDb().lawNoteRevision.findUnique({ where: { id: fresh.headRevisionId } });
}

const LawHubCollab = {
  REASONS,

  /** The accepted history only (the head's ancestors): proposals, rejected or withdrawn, are not listed. */
  revisions: async function (viewerId, noteId) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    if (!n || (n.moderationStatus !== "ACTIVE" && n.createdById !== viewerId) || (n.visibility !== "public" && n.createdById !== viewerId)) return { error: "not_found" };
    const head = await ensureHead(n);
    const all = await rawDb().lawNoteRevision.findMany({ where: { noteId: n.id }, select: { id: true, parentId: true, authorId: true, message: true, createdAt: true } });
    const byId = new Map(all.map((r) => [r.id, r]));
    const chain = [];
    for (let r = byId.get(head.id); r && chain.length < 200; r = byId.get(r.parentId)) chain.push(r);
    // Names are shown for the owner and the merged co-authors; squad-internal editors stay anonymous (as in the Hub view).
    const co = new Set((await rawDb().lawNoteCoAuthor.findMany({ where: { noteId: n.id } })).map((c) => c.userId));
    const visible = new Set([n.createdById, ...co]);
    const nameOf = await names(chain.map((r) => r.authorId).filter((id) => visible.has(id)));
    return { revisions: chain.map((r) => ({ id: r.id, parentId: r.parentId, message: visible.has(r.authorId) ? r.message : null, createdAt: r.createdAt, author: visible.has(r.authorId) ? nameOf(r.authorId) : null })), error: null };
  },

  coAuthors: async function (noteId) {
    const rows = await rawDb().lawNoteCoAuthor.findMany({ where: { noteId }, orderBy: { addedAt: "asc" } });
    const nameOf = await names(rows.map((r) => r.userId));
    return rows.map((r) => ({ userId: r.userId, name: nameOf(r.userId), addedAt: r.addedAt }));
  },

  // ---- change requests ----
  createCR: async function (userId, noteId, { title, description, content } = {}) {
    const n = await liveNote(noteId);
    if (!n) return { error: "not_found" };
    if (n.createdById === userId) return { error: "cannot_propose_own" };
    if (await blockedBetween(userId, n.createdById)) return { error: "not_found" };
    const t = typeof title === "string" ? title.trim().slice(0, 120) : "";
    if (!t) return { error: "invalid_title" };
    if (typeof content !== "string" || !content.trim() || content.length > note.MAX_CONTENT) return { error: "invalid_content" };
    if (note.hasMediaLinks(content, json(n.sourcePins, []))) return { error: "media_not_allowed" };
    const head = await ensureHead(n);
    if (sha(content) === head.contentHash) return { error: "no_changes" };
    // A trivial edit (a few characters) is not worth a review: it would only farm XP and notifications.
    const changed = changedChars(head.content, content);
    if (changed < MIN_CHANGE_CHARS) return { error: "change_too_small", status: 400 };
    if (!(await hit("cr-create", userId, 10))) return { error: "rate_limited", status: 429 };
    const open = await rawDb().lawChangeRequest.count({ where: { noteId: n.id, authorId: userId, status: { in: ["OPEN", "CONFLICT"] } } });
    if (open >= MAX_OPEN_PER_USER) return { error: "too_many_open" };
    const proposed = await rawDb().lawNoteRevision.create({ data: { noteId: n.id, parentId: head.id, authorId: userId, content, contentHash: sha(content), message: t } });
    const cr = await rawDb().lawChangeRequest.create({
      data: { noteId: n.id, baseRevisionId: head.id, proposedRevisionId: proposed.id, authorId: userId, title: t, description: typeof description === "string" ? description.slice(0, 2000) : null },
    });
    const nameOf = await names([userId]);
    await notify(n.createdById, "HUB_CHANGE_REQUEST", { noteId: n.id, changeRequestId: cr.id, title: t, from: nameOf(userId) });
    return { changeRequest: await this.presentCR(cr), error: null };
  },

  presentCR: async function (cr) {
    const nameOf = await names([cr.authorId, cr.reviewerId].filter(Boolean));
    return { id: cr.id, noteId: cr.noteId, title: cr.title, description: cr.description, status: cr.status, author: { userId: cr.authorId, name: nameOf(cr.authorId) }, reviewNote: cr.reviewNote, createdAt: cr.createdAt, decidedAt: cr.decidedAt };
  },

  /** Visible to the proposer and the note's owner only. Includes the server-computed diff and a merge preview. */
  getCR: async function (userId, id) {
    const cr = await rawDb().lawChangeRequest.findUnique({ where: { id: String(id || "") } });
    if (!cr) return { error: "not_found" };
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: cr.noteId } });
    if (!n || (cr.authorId !== userId && n.createdById !== userId)) return { error: "not_found" };
    // The proposer only keeps access while the note is still public and active; the owner always sees their own.
    const live = n.visibility === "public" && n.moderationStatus === "ACTIVE";
    if (n.createdById !== userId && !live) return { error: "not_found" };
    const [base, proposed] = await Promise.all([rawDb().lawNoteRevision.findUnique({ where: { id: cr.baseRevisionId } }), rawDb().lawNoteRevision.findUnique({ where: { id: cr.proposedRevisionId } })]);
    const head = await ensureHead(n);
    const stale = head.id !== cr.baseRevisionId;
    const preview = stale ? merge3(base.content, head.content, proposed.content) : { clean: true, conflicts: [] };
    return {
      changeRequest: await this.presentCR(cr),
      noteTitle: n.title,
      diff: blockDiff(base.content, proposed.content),
      headChanged: stale,
      mergeable: preview.clean,
      conflicts: preview.conflicts,
      proposedContent: cr.authorId === userId || n.createdById === userId ? proposed.content : undefined,
      headContent: stale ? head.content : undefined,
      error: null,
    };
  },

  inbox: async function (userId, role = "owner") {
    const where = role === "author" ? { authorId: userId } : { note: { createdById: userId } };
    const rows = await rawDb().lawChangeRequest.findMany({ where: { ...where, status: { in: ["OPEN", "CONFLICT"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { note: { select: { title: true } } } });
    return Promise.all(rows.map(async (r) => ({ ...(await this.presentCR(r)), noteTitle: r.note.title })));
  },

  /** Owner only. Fast-forward when the head is still the base; else block-level three-way merge. */
  merge: async function (userId, id) {
    const cr = await rawDb().lawChangeRequest.findUnique({ where: { id: String(id || "") } });
    const n = cr && (await rawDb().lawMasterNote.findUnique({ where: { id: cr.noteId } }));
    if (!cr || !n || n.createdById !== userId) return { error: "not_found" };
    if (cr.status !== "OPEN") return { error: "not_open", status: 409 };
    if (n.visibility !== "public" || n.moderationStatus !== "ACTIVE") return { error: "not_found" };
    const [base, proposed] = await Promise.all([rawDb().lawNoteRevision.findUnique({ where: { id: cr.baseRevisionId } }), rawDb().lawNoteRevision.findUnique({ where: { id: cr.proposedRevisionId } })]);
    const head = await ensureHead(n);
    let content, fastForward = false;
    if (head.id === cr.baseRevisionId) { content = proposed.content; fastForward = true; }
    else {
      const m = merge3(base.content, head.content, proposed.content);
      if (!m.clean) {
        await rawDb().lawChangeRequest.updateMany({ where: { id: cr.id, status: "OPEN" }, data: { status: "CONFLICT" } });
        return { error: "conflict", status: 409, conflicts: m.conflicts };
      }
      content = m.merged;
    }
    if (content.length > note.MAX_CONTENT || note.hasMediaLinks(content, json(n.sourcePins, []))) return { error: "invalid_content" };
    // Claim the request first: a concurrent rebase/withdraw/second merge loses here instead of being overwritten.
    const claim = await rawDb().lawChangeRequest.updateMany({ where: { id: cr.id, status: "OPEN", proposedRevisionId: cr.proposedRevisionId }, data: { status: "MERGED", reviewerId: userId, decidedAt: new Date() } });
    if (claim.count !== 1) return { error: "not_open", status: 409 };
    // Blame compares the BEFORE text normalized the same way as the merged text, so only really changed sections are re-attributed.
    const prev = note.parseSections(normalizeDoc(n.content)), next = note.parseSections(content);
    const authors = note.blame(prev, json(n.sectionAuthors, []), next, cr.authorId);
    const rev = fastForward
      ? proposed
      : await rawDb().lawNoteRevision.create({ data: { noteId: n.id, parentId: head.id, authorId: userId, content, contentHash: sha(content), message: `merge: ${cr.title}` } });
    const upd = await rawDb().lawMasterNote.updateMany({
      where: { id: n.id, version: n.version },
      data: { content, planJson: JSON.stringify(note.outline(next)), sectionAuthors: JSON.stringify(authors), contributors: JSON.stringify(note.contributors(next, authors)), version: { increment: 1 }, updatedById: userId, headRevisionId: rev.id },
    });
    if (upd.count !== 1) {
      // the owner edited in the meantime: give the request back and let them retry
      await rawDb().lawChangeRequest.update({ where: { id: cr.id }, data: { status: "OPEN", reviewerId: null, decidedAt: null } });
      if (!fastForward) await rawDb().lawNoteRevision.delete({ where: { id: rev.id } }).catch(() => {});
      return { error: "edit_conflict", status: 409 };
    }
    await rawDb().lawNoteCoAuthor.upsert({ where: { noteId_userId: { noteId: n.id, userId: cr.authorId } }, create: { noteId: n.id, userId: cr.authorId, viaChangeRequestId: cr.id }, update: {} });
    await notify(cr.authorId, "HUB_MERGED", { noteId: n.id, changeRequestId: cr.id, title: cr.title });
    await notify(userId, "HUB_MERGED", { noteId: n.id, changeRequestId: cr.id, title: cr.title, you: true });
    return { merged: true, fastForward, error: null };
  },

  reject: async function (userId, id, reviewNote) {
    const cr = await rawDb().lawChangeRequest.findUnique({ where: { id: String(id || "") } });
    const n = cr && (await rawDb().lawMasterNote.findUnique({ where: { id: cr.noteId } }));
    if (!cr || !n || n.createdById !== userId) return { error: "not_found" };
    if (!["OPEN", "CONFLICT"].includes(cr.status)) return { error: "not_open", status: 409 };
    await rawDb().lawChangeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", reviewerId: userId, decidedAt: new Date(), reviewNote: typeof reviewNote === "string" ? reviewNote.slice(0, 1000) : null } });
    await notify(cr.authorId, "HUB_CHANGE_REJECTED", { noteId: n.id, changeRequestId: cr.id, title: cr.title });
    return { error: null };
  },

  withdraw: async function (userId, id) {
    const cr = await rawDb().lawChangeRequest.findUnique({ where: { id: String(id || "") } });
    if (!cr || cr.authorId !== userId) return { error: "not_found" };
    if (!["OPEN", "CONFLICT"].includes(cr.status)) return { error: "not_open", status: 409 };
    await rawDb().lawChangeRequest.update({ where: { id: cr.id }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    return { error: null };
  },

  /** Proposer resolves a conflict (or catches up with a moved head): new proposal on top of the current head. */
  rebase: async function (userId, id, content) {
    const cr = await rawDb().lawChangeRequest.findUnique({ where: { id: String(id || "") } });
    if (!cr || cr.authorId !== userId) return { error: "not_found" };
    if (!["OPEN", "CONFLICT"].includes(cr.status)) return { error: "not_open", status: 409 };
    const n = await liveNote(cr.noteId);
    if (!n || (await blockedBetween(userId, n.createdById))) return { error: "not_found" };
    if (!(await hit("cr-rebase", cr.id, MAX_REBASES, { window: "none" }))) return { error: "too_many_rebases", status: 429 };
    if (typeof content !== "string" || !content.trim() || content.length > note.MAX_CONTENT || note.hasMediaLinks(content, json(n.sourcePins, []))) return { error: "invalid_content" };
    const head = await ensureHead(n);
    if (sha(content) === head.contentHash) return { error: "no_changes" };
    const proposed = await rawDb().lawNoteRevision.create({ data: { noteId: n.id, parentId: head.id, authorId: userId, content, contentHash: sha(content), message: `rebase: ${cr.title}` } });
    const upd = await rawDb().lawChangeRequest.update({ where: { id: cr.id }, data: { baseRevisionId: head.id, proposedRevisionId: proposed.id, status: "OPEN" } });
    await notify(n.createdById, "HUB_CHANGE_REQUEST", { noteId: n.id, changeRequestId: cr.id, title: cr.title, rebased: true });
    return { changeRequest: await this.presentCR(upd), error: null };
  },

  // ---- moderation ----
  report: async function (userId, noteId, { reason, detail } = {}, now = new Date()) {
    if (!REASONS.includes(reason)) return { error: "invalid_reason" };
    const n = await liveNote(noteId);
    if (!n) return { error: "not_found" };
    if (n.createdById === userId) return { error: "cannot_report_own" };
    if (await blockedBetween(userId, n.createdById)) return { error: "not_found" };
    try {
      await rawDb().lawNoteReport.create({ data: { noteId: n.id, reporterId: userId, reason, detail: typeof detail === "string" ? detail.slice(0, 500) : null } });
    } catch (e) {
      if (e.code === "P2002") return { error: "already_reported", status: 409 };
      throw e;
    }
    return { hidden: await this._maybeHide(n, now), error: null };
  },

  /** Auto-hide: >= N distinct reporters whose accounts are >= 7 days old (anti-brigading), or >= 3 COPYRIGHT reports. */
  _maybeHide: async function (n, now) {
    const cfg = await modSettings();
    const reports = await rawDb().lawNoteReport.findMany({ where: { noteId: n.id, status: "OPEN" } });
    const users = await rawDb().users.findMany({ where: { id: { in: reports.map((r) => r.reporterId) } }, select: { id: true, createdAt: true } });
    const old = new Set(users.filter((u) => now - new Date(u.createdAt) >= cfg.minAgeDays * 86400000).map((u) => u.id));
    const seasoned = new Set(reports.filter((r) => old.has(r.reporterId)).map((r) => r.reporterId));
    // Copyright reports need seasoned accounts too: three fresh sign-ups must not be able to take a note down.
    const copyright = new Set(reports.filter((r) => r.reason === "COPYRIGHT" && old.has(r.reporterId)).map((r) => r.reporterId));
    const why = copyright.size >= cfg.copyright ? "COPYRIGHT" : seasoned.size >= cfg.reporters ? reports.map((r) => r.reason).sort((a, b) => reports.filter((x) => x.reason === b).length - reports.filter((x) => x.reason === a).length)[0] : null;
    if (!why) return false;
    await rawDb().lawMasterNote.update({ where: { id: n.id }, data: { moderationStatus: "HIDDEN", hiddenReason: why } });
    await notify(n.createdById, "HUB_REPORT_ACTION", { noteId: n.id, action: "hidden", reason: why });
    return true;
  },

  appeal: async function (userId, noteId) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    if (!n || n.createdById !== userId || n.moderationStatus !== "HIDDEN") return { error: "not_found" };
    await rawDb().lawMasterNote.update({ where: { id: n.id }, data: { appealedAt: new Date() } });
    return { error: null };
  },

  queue: async function () {
    const rows = await rawDb().lawMasterNote.findMany({ where: { moderationStatus: "HIDDEN" }, orderBy: [{ appealedAt: "desc" }, { updatedAt: "desc" }], include: { reports: true }, take: 100 });
    return rows.map((n) => ({ noteId: n.id, title: n.title, hiddenReason: n.hiddenReason, appealed: !!n.appealedAt, reports: n.reports.map((r) => ({ reason: r.reason, detail: r.detail, status: r.status })) }));
  },

  decide: async function (adminId, noteId, decision) {
    const n = await rawDb().lawMasterNote.findUnique({ where: { id: String(noteId || "") } });
    if (!n || !["uphold", "restore"].includes(decision) || n.moderationStatus === "ACTIVE") return { error: n ? "invalid_decision" : "not_found" };
    const uphold = decision === "uphold";
    await rawDb().$transaction([
      rawDb().lawMasterNote.update({ where: { id: n.id }, data: { moderationStatus: uphold ? "REMOVED" : "ACTIVE", hiddenReason: uphold ? n.hiddenReason : null, appealedAt: null } }),
      rawDb().lawNoteReport.updateMany({ where: { noteId: n.id, status: "OPEN" }, data: { status: uphold ? "UPHELD" : "DISMISSED" } }),
    ]);
    await notify(n.createdById, "HUB_REPORT_ACTION", { noteId: n.id, action: uphold ? "removed" : "restored", reason: n.hiddenReason });
    return { error: null };
  },
};

module.exports = { LawHubCollab };
