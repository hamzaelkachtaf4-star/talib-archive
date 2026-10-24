// RC3 Phase 7 / RC4 Phase 8: the faculty wall. Students post announcements, TD-group exchanges and legal discussions, and reply to them.
// Everything is scoped to the viewer's faculty (profile.facultyCode). Reports hide a post automatically once enough
// different students flagged it; an admin then upholds or dismisses. No images, no reactions, no direct messages.
const { rawDb } = require("../utils/law/dbClient");
const { hit } = require("../utils/law/rateLimit");
const { names, avatarConfigs } = require("./lawSquad");

const KINDS = Object.freeze(["announcement", "td_thread", "legal_discussion", "inquiry", "reply"]);
const POST_KINDS = Object.freeze(["announcement", "td_thread", "legal_discussion", "inquiry"]); // everything but replies
const REASONS = Object.freeze(["INAPPROPRIATE", "VULGARITY", "SPAM_ADS", "MISLEADING_LEGAL", "OTHER"]);
const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_URLS = 2;
const AUTO_HIDE_AT = 3; // distinct reporters
const PAGE = 30;
const MAX_REPLIES = 200;

const err = (error, status) => ({ error, ...(status ? { status } : {}) });
const urlCount = (s) => (String(s).match(/https?:\/\/|www\./gi) || []).length;

async function facultyOf(userId) {
  const p = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { facultyCode: true } });
  return p?.facultyCode || null;
}
async function blockedIds(userId) {
  const rows = await rawDb().lawBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  return rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
}

const LawCampus = {
  KINDS, REASONS, AUTO_HIDE_AT,

  present: async function (rows, viewerId) {
    const nameOf = await names(rows.map((r) => r.authorId));
    const cfgOf = await avatarConfigs(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id, kind: r.kind, parentId: r.parentId, title: r.title, body: r.body,
      author: { userId: r.authorId, name: nameOf(r.authorId), avatarConfig: cfgOf.get(r.authorId) || null }, mine: r.authorId === viewerId,
      createdAt: r.createdAt, replyCount: r._count?.replies ?? undefined,
    }));
  },

  /** The wall: announcements and TD threads of the viewer's faculty, newest first, paged by `before` (an ISO date). */
  list: async function (userId, { kind, before } = {}) {
    const facultyCode = await facultyOf(userId);
    if (!facultyCode) return err("no_faculty");
    const k = POST_KINDS.includes(kind) ? kind : null;
    // The cursor is "<ISO date>|<id>": posts that share a timestamp are still paged one after the other, none skipped.
    const [dateStr, idStr] = String(before || "").split("|");
    const cursor = dateStr && !Number.isNaN(Date.parse(dateStr)) ? { at: new Date(dateStr), id: idStr || "" } : null;
    const rows = await rawDb().lawCampusPost.findMany({
      where: {
        facultyCode, status: "ACTIVE", kind: k ? k : { in: POST_KINDS },
        authorId: { notIn: await blockedIds(userId) },
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      include: { _count: { select: { replies: { where: { status: "ACTIVE" } } } } },
    });
    const more = rows.length > PAGE;
    return { posts: await this.present(rows.slice(0, PAGE), userId), next: more ? `${rows[PAGE - 1].createdAt.toISOString()}|${rows[PAGE - 1].id}` : null, error: null };
  },

  thread: async function (userId, id) {
    const facultyCode = await facultyOf(userId);
    const post = await rawDb().lawCampusPost.findUnique({ where: { id: String(id || "") } });
    if (!post || !facultyCode || post.facultyCode !== facultyCode || post.kind === "reply" || (post.status !== "ACTIVE" && post.authorId !== userId)) return err("not_found", 404);
    if ((await blockedIds(userId)).includes(post.authorId)) return err("not_found", 404);
    const replies = await rawDb().lawCampusPost.findMany({
      where: { parentId: post.id, status: "ACTIVE", authorId: { notIn: await blockedIds(userId) } },
      orderBy: { createdAt: "asc" },
      take: MAX_REPLIES,
    });
    return { post: (await this.present([post], userId))[0], replies: await this.present(replies, userId), error: null };
  },

  create: async function (userId, role, { kind, title, body, parentId } = {}) {
    const facultyCode = await facultyOf(userId);
    if (!facultyCode) return err("no_faculty");
    if (!KINDS.includes(kind)) return err("invalid_kind");
    const text = typeof body === "string" ? body.trim() : "";
    if (!text || text.length > MAX_BODY) return err("invalid_body");
    if (urlCount(text) > MAX_URLS) return err("too_many_links");
    let t = null;
    if (kind !== "reply") {
      t = typeof title === "string" ? title.trim() : "";
      if (!t || t.length > MAX_TITLE) return err("invalid_title");
      if (urlCount(t)) return err("too_many_links");
    }
    let parent = null;
    if (kind === "reply") {
      parent = await rawDb().lawCampusPost.findUnique({ where: { id: String(parentId || "") } });
      if (!parent || parent.facultyCode !== facultyCode || !POST_KINDS.includes(parent.kind) || parent.status !== "ACTIVE") return err("not_found", 404);
      if ((await blockedIds(userId)).includes(parent.authorId)) return err("not_found", 404);
      if ((await rawDb().lawCampusPost.count({ where: { parentId: parent.id } })) >= MAX_REPLIES) return err("thread_full");
    }
    if (!(await hit(kind === "reply" ? "campus-reply" : "campus-post", userId, kind === "reply" ? 60 : 10))) return err("rate_limited", 429);
    const row = await rawDb().lawCampusPost.create({ data: { facultyCode, kind, parentId: parent?.id ?? null, authorId: userId, title: t, body: text } });
    if (parent && parent.authorId !== userId)
      await rawDb().lawNotification.create({ data: { userId: parent.authorId, type: "CAMPUS_REPLY", payload: JSON.stringify({ postId: parent.id, title: parent.title }) } });
    return { post: (await this.present([row], userId))[0], error: null };
  },

  remove: async function (userId, role, id) {
    const post = await rawDb().lawCampusPost.findUnique({ where: { id: String(id || "") } });
    if (!post || (post.authorId !== userId && role !== "admin")) return err("not_found", 404);
    // An author cannot erase a post that was reported or hidden: that would also erase the moderation record.
    if (role !== "admin" && (post.status !== "ACTIVE" || (await rawDb().lawCampusReport.count({ where: { postId: post.id, status: "OPEN" } })) > 0)) return err("forbidden", 403);
    await rawDb().lawCampusPost.delete({ where: { id: post.id } });
    return { ok: true, error: null };
  },

  report: async function (userId, id, reason) {
    const facultyCode = await facultyOf(userId);
    const post = await rawDb().lawCampusPost.findUnique({ where: { id: String(id || "") } });
    if (!post || !facultyCode || post.facultyCode !== facultyCode || post.authorId === userId) return err("not_found", 404);
    if (!REASONS.includes(reason)) return err("invalid_reason");
    if (!(await hit("campus-report", userId, 20))) return err("rate_limited", 429);
    try {
      await rawDb().lawCampusReport.create({ data: { postId: post.id, reporterId: userId, reason } });
    } catch (e) {
      if (e?.code === "P2002") return { duplicate: true, error: null };
      throw e;
    }
    const distinct = await rawDb().lawCampusReport.count({ where: { postId: post.id, status: "OPEN" } });
    // Three students cannot hide a post an admin wrote (reports queue it for an admin instead).
    const authorIsAdmin = (await rawDb().users.findUnique({ where: { id: post.authorId }, select: { role: true } }))?.role === "admin";
    if (distinct >= AUTO_HIDE_AT && post.status === "ACTIVE" && !authorIsAdmin)
      await rawDb().lawCampusPost.updateMany({ where: { id: post.id, status: "ACTIVE" }, data: { status: "HIDDEN", hiddenReason: "reports" } });
    return { error: null };
  },

  // ---- moderation (admin) ----
  queue: async function () {
    const reports = await rawDb().lawCampusReport.findMany({ where: { status: "OPEN" }, include: { post: true }, orderBy: { createdAt: "asc" }, take: 200 });
    const by = new Map();
    for (const r of reports) {
      const g = by.get(r.postId) || { post: r.post, reasons: {}, reporters: 0 };
      g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
      g.reporters++;
      by.set(r.postId, g);
    }
    return [...by.values()].map((g) => ({ id: g.post.id, kind: g.post.kind, title: g.post.title, body: g.post.body, status: g.post.status, reasons: g.reasons, reporters: g.reporters }));
  },

  /** "uphold" hides the post and closes its reports; "dismiss" closes them and restores an auto-hidden post. */
  decide: async function (adminId, id, decision) {
    if (!["uphold", "dismiss"].includes(decision)) return err("invalid_decision");
    const post = await rawDb().lawCampusPost.findUnique({ where: { id: String(id || "") } });
    if (!post) return err("not_found", 404);
    if (decision === "uphold") {
      await rawDb().lawCampusPost.update({ where: { id: post.id }, data: { status: "HIDDEN", hiddenReason: "upheld" } });
      await rawDb().lawCampusReport.updateMany({ where: { postId: post.id, status: "OPEN" }, data: { status: "UPHELD" } });
      await rawDb().lawNotification.create({ data: { userId: post.authorId, type: "CAMPUS_POST_HIDDEN", payload: JSON.stringify({ postId: post.id }) } });
    } else {
      await rawDb().lawCampusReport.updateMany({ where: { postId: post.id, status: "OPEN" }, data: { status: "DISMISSED" } });
      if (post.status === "HIDDEN" && post.hiddenReason === "reports") await rawDb().lawCampusPost.update({ where: { id: post.id }, data: { status: "ACTIVE", hiddenReason: null } });
    }
    return { error: null };
  },
};

module.exports = { LawCampus };
