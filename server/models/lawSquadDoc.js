// RC3 Phase 7: squad work artifacts (summaries, case briefs, mock exams, questions, resource links) with revisions and
// GitHub-style change requests. No free-text chat and no stickers exist here: every post is a titled work document.
// Who may do what is decided by utils/law/permissions.js; everything is scoped to the caller's own squad.
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");
const P = require("../utils/law/permissions");
const { merge3, blockDiff } = require("../utils/law/hubMerge");
const { hit } = require("../utils/law/rateLimit");
const { names } = require("./lawSquad");

const TYPES = Object.freeze(["summary", "memo", "case_brief", "mock_exam", "question", "resource_link"]);
const MAX_CONTENT = 20000;
const MAX_TITLE = 120;
const MAX_DOCS_PER_SQUAD = 200;
const MAX_OPEN_PER_USER = 5;
const MAX_REBASES = 10;
const MAX_REVISIONS_PER_DOC = 300;
const EDITS_PER_DAY = 120;
const OPEN = ["OPEN", "CONFLICT"];

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const err = (error, status) => ({ error, ...(status ? { status } : {}) });

async function notifyMany(userIds, type, payload) {
  for (const userId of new Set(userIds))
    await rawDb().lawNotification.create({ data: { userId, type, payload: JSON.stringify(payload) } });
}

/** The caller's membership with the normalized role, or null. */
async function membership(userId) {
  const m = await rawDb().lawSquadMember.findUnique({ where: { userId }, include: { squad: { select: { publishMode: true } } } });
  return m ? { ...m, role: P.normalizeRole(m.role) } : null;
}

/** In an "admin only" group, only owners and admins publish: members neither create documents nor send change requests. */
const adminOnlyBlocks = (m) => m.squad?.publishMode === "admin_only" && !P.can(m.role, "doc.edit_any");

/** The doc if it lives in the caller's squad (else null) with their membership. */
async function docFor(userId, docId) {
  const m = await membership(userId);
  if (!m) return null;
  const doc = await rawDb().lawSquadDoc.findUnique({ where: { id: String(docId || "") } });
  return doc && doc.squadId === m.squadId ? { m, doc } : null;
}

const EMPTY = { id: null, content: "", contentHash: sha("") };
/** The current revision of a doc, falling back to its newest one (and to an empty text) so a damaged head never turns into a 500. */
async function headOf(doc) {
  const head = doc.headRevisionId && (await rawDb().lawSquadDocRevision.findUnique({ where: { id: doc.headRevisionId } }));
  if (head) return head;
  return (await rawDb().lawSquadDocRevision.findFirst({ where: { docId: doc.id }, orderBy: { createdAt: "desc" } })) || EMPTY;
}

/** A link must be an https URL; nothing is fetched. */
function validUrl(u) {
  if (typeof u !== "string" || u.length > 500) return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" && x.hostname.includes(".") ? x.toString() : null;
  } catch {
    return null;
  }
}

function checkFields({ type, title, content, url }, { partial = false } = {}) {
  const out = {};
  if (!partial || type !== undefined) {
    if (!TYPES.includes(type)) return { error: "invalid_type" };
    out.type = type;
  }
  if (!partial || title !== undefined) {
    const t = typeof title === "string" ? title.trim() : "";
    if (!t || t.length > MAX_TITLE) return { error: "invalid_title" };
    out.title = t;
  }
  if (!partial || content !== undefined) {
    if (typeof content !== "string" || content.length > MAX_CONTENT) return { error: "invalid_content" };
    out.content = content;
  }
  if (url !== undefined && url !== null) {
    const u = validUrl(url);
    if (!u) return { error: "invalid_url" };
    out.url = u;
  }
  return { data: out };
}

const present = (d) => ({
  id: d.id, type: d.type, title: d.title, url: d.url, headRevisionId: d.headRevisionId,
  createdById: d.createdById, createdAt: d.createdAt, updatedAt: d.updatedAt,
});

const LawSquadDoc = {
  TYPES, MAX_CONTENT,

  list: async function (userId, { type } = {}) {
    const m = await membership(userId);
    if (!m) return err("not_in_squad");
    if (!P.can(m.role, "doc.read")) return err("forbidden", 403);
    const docs = await rawDb().lawSquadDoc.findMany({
      where: { squadId: m.squadId, ...(TYPES.includes(type) ? { type } : {}) },
      orderBy: { updatedAt: "desc" },
      take: MAX_DOCS_PER_SQUAD,
    });
    const nameOf = await names(docs.map((d) => d.createdById));
    const open = await rawDb().lawSquadChangeRequest.groupBy({ by: ["docId"], where: { docId: { in: docs.map((d) => d.id) }, status: { in: OPEN } }, _count: true });
    const openBy = new Map(open.map((o) => [o.docId, o._count]));
    return { docs: docs.map((d) => ({ ...present(d), author: nameOf(d.createdById), openChangeRequests: openBy.get(d.id) || 0 })), myRole: m.role, error: null };
  },

  isMember: async function (userId) {
    return !!(await membership(userId));
  },

  create: async function (userId, body = {}) {
    const m = await membership(userId);
    if (!m) return err("not_in_squad");
    if (!P.can(m.role, "doc.create")) return err("forbidden", 403);
    if (adminOnlyBlocks(m)) return err("admin_only_publish", 403);
    const v = checkFields(body);
    if (v.error) return v;
    const d = v.data;
    if (d.type === "resource_link" && !d.url) return err("invalid_url");
    if (d.type !== "resource_link") delete d.url;
    if (!d.content.trim() && d.type !== "resource_link") return err("invalid_content");
    if (!(await hit("squad-doc-create", userId, 30))) return err("rate_limited", 429);
    // One transaction: the cap holds under concurrent creates and a doc never exists without its first revision.
    const head = await rawDb().$transaction(async (tx) => {
      if ((await tx.lawSquadDoc.count({ where: { squadId: m.squadId } })) >= MAX_DOCS_PER_SQUAD) return null;
      const doc = await tx.lawSquadDoc.create({ data: { squadId: m.squadId, createdById: userId, ...d } });
      const rev = await tx.lawSquadDocRevision.create({ data: { docId: doc.id, authorId: userId, content: d.content, contentHash: sha(d.content), message: d.title } });
      return tx.lawSquadDoc.update({ where: { id: doc.id }, data: { headRevisionId: rev.id } });
    });
    if (!head) return err("too_many_docs");
    const doc = head;
    const members = await rawDb().lawSquadMember.findMany({ where: { squadId: m.squadId } });
    const nameOf = await names([userId]);
    await notifyMany(members.map((x) => x.userId).filter((id) => id !== userId), "SQUAD_DOC_NEW", { docId: doc.id, title: d.title, docType: d.type, from: nameOf(userId) });
    return { doc: present(head), error: null };
  },

  get: async function (userId, id) {
    const f = await docFor(userId, id);
    if (!f) return err("not_found", 404);
    const head = await headOf(f.doc);
    const nameOf = await names([f.doc.createdById]);
    const open = await rawDb().lawSquadChangeRequest.count({ where: { docId: f.doc.id, status: { in: OPEN } } });
    return {
      doc: { ...present(f.doc), content: head.content, author: nameOf(f.doc.createdById) },
      myRole: f.m.role,
      canEditDirect: P.canEditDirect(f.m.role, f.doc.createdById === userId) && !adminOnlyBlocks(f.m),
      canPropose: P.can(f.m.role, "cr.create") && !adminOnlyBlocks(f.m),
      canReview: P.can(f.m.role, "cr.review"),
      openChangeRequests: open,
      error: null,
    };
  },

  /**
   * Direct edit by the doc's author or an admin. The caller names the revision they started from: if the head moved on
   * (a merged change request, another admin) the edit is refused as stale instead of silently overwriting.
   */
  edit: async function (userId, id, { content, title, message, baseRevisionId } = {}) {
    const f = await docFor(userId, id);
    if (!f) return err("not_found", 404);
    if (!P.canEditDirect(f.m.role, f.doc.createdById === userId)) return err("forbidden", 403);
    if (adminOnlyBlocks(f.m)) return err("admin_only_publish", 403);
    const v = checkFields({ title, content }, { partial: true });
    if (v.error) return v;
    if (typeof baseRevisionId !== "string" || !baseRevisionId) return err("base_required");
    if (baseRevisionId !== f.doc.headRevisionId) return err("stale_base", 409);
    const d = v.data;
    if (d.content === undefined && d.title === undefined) return err("no_changes");
    const head = await headOf(f.doc);
    const nextContent = d.content ?? head.content;
    if (f.doc.type !== "resource_link" && !nextContent.trim()) return err("invalid_content");
    if (nextContent === head.content && (d.title === undefined || d.title === f.doc.title)) return err("no_changes");
    if (!(await hit("squad-doc-edit", userId, EDITS_PER_DAY))) return err("rate_limited", 429);
    if ((await rawDb().lawSquadDocRevision.count({ where: { docId: f.doc.id } })) >= MAX_REVISIONS_PER_DOC) return err("too_many_revisions");
    const rev = await rawDb().lawSquadDocRevision.create({
      data: { docId: f.doc.id, parentId: head.id, authorId: userId, content: nextContent, contentHash: sha(nextContent), message: typeof message === "string" ? message.slice(0, 200) : null },
    });
    // Move the head only if nobody did in the meantime.
    const moved = await rawDb().lawSquadDoc.updateMany({ where: { id: f.doc.id, headRevisionId: baseRevisionId }, data: { headRevisionId: rev.id, ...(d.title ? { title: d.title } : {}) } });
    if (moved.count !== 1) {
      await rawDb().lawSquadDocRevision.delete({ where: { id: rev.id } }).catch(() => {});
      return err("stale_base", 409);
    }
    return { revisionId: rev.id, error: null };
  },

  remove: async function (userId, id) {
    const f = await docFor(userId, id);
    if (!f) return err("not_found", 404);
    if (!P.canEditDirect(f.m.role, f.doc.createdById === userId)) return err("forbidden", 403);
    if (adminOnlyBlocks(f.m)) return err("admin_only_publish", 403);
    await rawDb().lawSquadDoc.delete({ where: { id: f.doc.id } });
    return { ok: true, error: null };
  },

  revisions: async function (userId, id) {
    const f = await docFor(userId, id);
    if (!f) return err("not_found", 404);
    // The history is the chain of accepted revisions behind the head: open, rejected and withdrawn proposals are not part of it
    // (their titles and authors are visible to the author and reviewers only, through the change-request views).
    const all = await rawDb().lawSquadDocRevision.findMany({ where: { docId: f.doc.id } });
    const byId = new Map(all.map((r) => [r.id, r]));
    const chain = [];
    for (let r = byId.get(f.doc.headRevisionId); r && chain.length < 200; r = byId.get(r.parentId)) chain.push(r);
    const nameOf = await names(chain.map((r) => r.authorId));
    return { revisions: chain.map((r) => ({ id: r.id, parentId: r.parentId, message: r.message, createdAt: r.createdAt, author: nameOf(r.authorId), head: r.id === f.doc.headRevisionId })), error: null };
  },

  // ---- change requests -------------------------------------------------------------------------------
  presentCR: async function (cr) {
    const nameOf = await names([cr.authorId, cr.reviewerId].filter(Boolean));
    return { id: cr.id, docId: cr.docId, title: cr.title, description: cr.description, status: cr.status, author: { userId: cr.authorId, name: nameOf(cr.authorId) }, reviewNote: cr.reviewNote, createdAt: cr.createdAt, decidedAt: cr.decidedAt };
  },

  createCR: async function (userId, docId, { title, description, content } = {}) {
    const f = await docFor(userId, docId);
    if (!f) return err("not_found", 404);
    if (!P.can(f.m.role, "cr.create")) return err("forbidden", 403);
    if (adminOnlyBlocks(f.m)) return err("admin_only_publish", 403);
    const t = typeof title === "string" ? title.trim().slice(0, MAX_TITLE) : "";
    if (!t) return err("invalid_title");
    if (typeof content !== "string" || !content.trim() || content.length > MAX_CONTENT) return err("invalid_content");
    const head = await headOf(f.doc);
    if (sha(content) === head.contentHash) return err("no_changes");
    if (!(await hit("squad-cr-create", userId, 10))) return err("rate_limited", 429);
    if ((await rawDb().lawSquadDocRevision.count({ where: { docId: f.doc.id } })) >= MAX_REVISIONS_PER_DOC) return err("too_many_revisions");
    const open = await rawDb().lawSquadChangeRequest.count({ where: { authorId: userId, docId: f.doc.id, status: { in: OPEN } } });
    if (open >= MAX_OPEN_PER_USER) return err("too_many_open");
    const proposed = await rawDb().lawSquadDocRevision.create({ data: { docId: f.doc.id, parentId: head.id, authorId: userId, content, contentHash: sha(content), message: t } });
    const cr = await rawDb().lawSquadChangeRequest.create({
      data: { docId: f.doc.id, baseRevisionId: head.id, proposedRevisionId: proposed.id, authorId: userId, title: t, description: typeof description === "string" ? description.slice(0, 2000) : null },
    });
    const members = await rawDb().lawSquadMember.findMany({ where: { squadId: f.m.squadId } });
    const nameOf = await names([userId]);
    await notifyMany(members.filter((x) => P.can(x.role, "cr.review") && x.userId !== userId).map((x) => x.userId), "SQUAD_CR_OPENED", { docId: f.doc.id, changeRequestId: cr.id, title: t, from: nameOf(userId) });
    return { changeRequest: await this.presentCR(cr), error: null };
  },

  listCR: async function (userId, { docId, mine } = {}) {
    const m = await membership(userId);
    if (!m) return err("not_in_squad");
    const where = { doc: { squadId: m.squadId }, status: { in: OPEN }, ...(docId ? { docId: String(docId) } : {}) };
    // Reviewers see the whole squad's queue; an editor sees their own requests only.
    if (mine || !P.can(m.role, "cr.review")) where.authorId = userId;
    const rows = await rawDb().lawSquadChangeRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { doc: { select: { title: true } } } });
    return { changeRequests: await Promise.all(rows.map(async (r) => ({ ...(await this.presentCR(r)), docTitle: r.doc.title }))), error: null };
  },

  /** Visible to the author and to reviewers of the squad. Server-computed diff, stale-base flag and merge preview. */
  getCR: async function (userId, id) {
    const cr = await rawDb().lawSquadChangeRequest.findUnique({ where: { id: String(id || "") } });
    if (!cr) return err("not_found", 404);
    const f = await docFor(userId, cr.docId);
    if (!f || (cr.authorId !== userId && !P.can(f.m.role, "cr.review"))) return err("not_found", 404);
    const [base, proposed, head] = await Promise.all([
      rawDb().lawSquadDocRevision.findUnique({ where: { id: cr.baseRevisionId } }),
      rawDb().lawSquadDocRevision.findUnique({ where: { id: cr.proposedRevisionId } }),
      headOf(f.doc),
    ]);
    if (!base || !proposed) return err("not_found", 404);
    const stale = head.id !== cr.baseRevisionId;
    const preview = stale ? merge3(base.content, head.content, proposed.content) : { clean: true, conflicts: [], merged: proposed.content };
    return {
      changeRequest: await this.presentCR(cr),
      docTitle: f.doc.title,
      diff: blockDiff(base.content, proposed.content),
      headChanged: stale,
      mergeable: preview.clean,
      conflicts: preview.conflicts,
      headContent: stale ? head.content : undefined,
      proposedContent: proposed.content,
      // What the author should start from when rebasing: the current text with their non-conflicting changes applied
      // (conflicting blocks keep the current wording; the conflicts list shows both sides).
      suggestedContent: preview.merged,
      canReview: P.canReviewCR(f.m.role, cr.authorId === userId),
      error: null,
    };
  },

  /** Fast-forward when the head is still the base; otherwise a block-level three-way merge, refused (CONFLICT) when it is not clean. */
  merge: async function (userId, id) {
    const cr = await rawDb().lawSquadChangeRequest.findUnique({ where: { id: String(id || "") } });
    const f = cr && (await docFor(userId, cr.docId));
    if (!cr || !f) return err("not_found", 404);
    if (!P.canReviewCR(f.m.role, cr.authorId === userId)) return err(P.can(f.m.role, "cr.review") ? "cannot_review_own" : "forbidden", 403);
    if (cr.status !== "OPEN") return err("not_open", 409);
    const [base, proposed, head] = await Promise.all([
      rawDb().lawSquadDocRevision.findUnique({ where: { id: cr.baseRevisionId } }),
      rawDb().lawSquadDocRevision.findUnique({ where: { id: cr.proposedRevisionId } }),
      headOf(f.doc),
    ]);
    if (!base || !proposed || !head.id) return err("not_found", 404);
    let content, fastForward = false;
    if (head.id === cr.baseRevisionId) { content = proposed.content; fastForward = true; }
    else {
      const m = merge3(base.content, head.content, proposed.content);
      if (!m.clean) {
        await rawDb().lawSquadChangeRequest.updateMany({ where: { id: cr.id, status: "OPEN", proposedRevisionId: cr.proposedRevisionId }, data: { status: "CONFLICT" } });
        return { error: "conflict", status: 409, conflicts: m.conflicts };
      }
      content = m.merged;
    }
    if (content.length > MAX_CONTENT) return err("invalid_content");
    // Claim first: a concurrent merge, rebase or withdraw loses here instead of overwriting.
    const claim = await rawDb().lawSquadChangeRequest.updateMany({ where: { id: cr.id, status: "OPEN", proposedRevisionId: cr.proposedRevisionId }, data: { status: "MERGED", reviewerId: userId, decidedAt: new Date() } });
    if (claim.count !== 1) return err("not_open", 409);
    const rev = fastForward
      ? proposed
      : await rawDb().lawSquadDocRevision.create({ data: { docId: f.doc.id, parentId: head.id, authorId: userId, content, contentHash: sha(content), message: `merge: ${cr.title}` } });
    const moved = await rawDb().lawSquadDoc.updateMany({ where: { id: f.doc.id, headRevisionId: head.id }, data: { headRevisionId: rev.id } });
    if (moved.count !== 1) {
      await rawDb().lawSquadChangeRequest.update({ where: { id: cr.id }, data: { status: "OPEN", reviewerId: null, decidedAt: null } });
      if (!fastForward) await rawDb().lawSquadDocRevision.delete({ where: { id: rev.id } }).catch(() => {});
      return err("edit_conflict", 409);
    }
    await notifyMany([cr.authorId], "SQUAD_CR_MERGED", { docId: f.doc.id, changeRequestId: cr.id, title: cr.title });
    return { merged: true, fastForward, error: null };
  },

  reject: async function (userId, id, reviewNote) {
    const cr = await rawDb().lawSquadChangeRequest.findUnique({ where: { id: String(id || "") } });
    const f = cr && (await docFor(userId, cr.docId));
    if (!cr || !f) return err("not_found", 404);
    if (!P.canReviewCR(f.m.role, cr.authorId === userId)) return err(P.can(f.m.role, "cr.review") ? "cannot_review_own" : "forbidden", 403);
    const claim = await rawDb().lawSquadChangeRequest.updateMany({ where: { id: cr.id, status: { in: OPEN } }, data: { status: "REJECTED", reviewerId: userId, decidedAt: new Date(), reviewNote: typeof reviewNote === "string" ? reviewNote.slice(0, 1000) : null } });
    if (claim.count !== 1) return err("not_open", 409);
    await notifyMany([cr.authorId], "SQUAD_CR_REJECTED", { docId: f.doc.id, changeRequestId: cr.id, title: cr.title });
    return { error: null };
  },

  withdraw: async function (userId, id) {
    const cr = await rawDb().lawSquadChangeRequest.findUnique({ where: { id: String(id || "") } });
    if (!cr || cr.authorId !== userId || !(await docFor(userId, cr.docId))) return err("not_found", 404);
    const claim = await rawDb().lawSquadChangeRequest.updateMany({ where: { id: cr.id, status: { in: OPEN } }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    if (claim.count !== 1) return err("not_open", 409);
    return { error: null };
  },

  /** The author resolves a conflict (or catches up with a moved head): a new proposal on top of the current head. */
  rebase: async function (userId, id, content) {
    const cr = await rawDb().lawSquadChangeRequest.findUnique({ where: { id: String(id || "") } });
    const f = cr && cr.authorId === userId && (await docFor(userId, cr.docId));
    if (!f) return err("not_found", 404);
    if (!OPEN.includes(cr.status)) return err("not_open", 409);
    if (!P.can(f.m.role, "cr.create")) return err("forbidden", 403);
    if (adminOnlyBlocks(f.m)) return err("admin_only_publish", 403);
    if (typeof content !== "string" || !content.trim() || content.length > MAX_CONTENT) return err("invalid_content");
    const head = await headOf(f.doc);
    if (sha(content) === head.contentHash) return err("no_changes");
    // The old proposal sent back untouched would put the document back to its old state and undo every edit made since:
    // the author has to start from the current text (the page offers a suggestion).
    const oldProposal = await rawDb().lawSquadDocRevision.findUnique({ where: { id: cr.proposedRevisionId } });
    if (head.id !== cr.baseRevisionId && oldProposal && sha(content) === oldProposal.contentHash) return err("incorporate_head", 409);
    if (!(await hit("squad-cr-rebase", cr.id, MAX_REBASES, { window: "none" }))) return err("too_many_rebases", 429);
    const proposed = await rawDb().lawSquadDocRevision.create({ data: { docId: f.doc.id, parentId: head.id, authorId: userId, content, contentHash: sha(content), message: cr.title } });
    const upd = await rawDb().lawSquadChangeRequest.updateMany({ where: { id: cr.id, status: { in: OPEN }, proposedRevisionId: cr.proposedRevisionId }, data: { baseRevisionId: head.id, proposedRevisionId: proposed.id, status: "OPEN" } });
    if (upd.count !== 1) {
      await rawDb().lawSquadDocRevision.delete({ where: { id: proposed.id } }).catch(() => {});
      return err("not_open", 409);
    }
    return { error: null };
  },

  // ---- roles -----------------------------------------------------------------------------------------
  setRole: async function (actorId, targetUserId, role) {
    const a = await membership(actorId);
    if (!a) return err("not_in_squad");
    if (!P.ROLES.includes(role)) return err("invalid_role");
    const t = await rawDb().lawSquadMember.findUnique({ where: { userId: Number(targetUserId) || -1 } });
    if (!t || t.squadId !== a.squadId) return err("not_found", 404);
    if (t.userId === actorId) return err("cannot_change_own_role");
    if (!P.canAssign(a.role, t.role, role)) return err("forbidden", 403);
    await rawDb().lawSquadMember.update({ where: { id: t.id }, data: { role } });
    if (role === "viewer") await require("./lawSquad").LawSquad.rotateInvite(a.squadId); // a demoted member must not rejoin as an editor with the code they already know
    await notifyMany([t.userId], "SQUAD_ROLE_CHANGED", { role });
    return { role, error: null };
  },

  /** The owner hands the squad to another member and becomes an admin. */
  transferOwnership: async function (ownerId, targetUserId) {
    const a = await membership(ownerId);
    if (!a) return err("not_in_squad");
    if (a.role !== "owner") return err("forbidden", 403);
    const t = await rawDb().lawSquadMember.findUnique({ where: { userId: Number(targetUserId) || -1 } });
    if (!t || t.squadId !== a.squadId || t.userId === ownerId) return err("not_found", 404);
    // Conditional, in one transaction: two simultaneous transfers cannot leave two owners.
    const ok = await rawDb().$transaction(async (tx) => {
      const demoted = await tx.lawSquadMember.updateMany({ where: { id: a.id, role: "owner" }, data: { role: "admin" } });
      if (demoted.count !== 1) return false;
      await tx.lawSquadMember.update({ where: { id: t.id }, data: { role: "owner" } });
      return true;
    });
    if (!ok) return err("forbidden", 403);
    await notifyMany([t.userId], "SQUAD_ROLE_CHANGED", { role: "owner" });
    return { error: null };
  },
};

module.exports = { LawSquadDoc, TYPES };
