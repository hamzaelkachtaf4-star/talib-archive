// Phase 7: social graph. Directed follows (public target = ACCEPTED, private target = PENDING until approved), blocks,
// opt-in phone discovery (HMAC only), notifications and the suggestion engine. "Friends" = mutual ACCEPTED follows.
// Everything here works on explicit userIds through rawDb (the graph is cross-user by nature).
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");
const { localDate, addDays } = require("../utils/law/time");
const { hit } = require("../utils/law/rateLimit");
const { phoneKey } = require("../utils/law/phoneKey");

const REREQUEST_AFTER_DAYS = 7;
const CONTACT_DAILY_LIMIT = 3;
const CONTACT_MAX_NUMBERS = 500;
const FRIEND_CODE = /^QAN-[A-Z0-9]{2,10}-\d{4}$/;

const flagOn = () => process.env.FEATURE_CONTACT_MATCH === "true";

/** E.164 with +212 as the default country. Returns null when it cannot be a real number. */
function normalizePhone(raw) {
  let s = String(raw ?? "").trim().replace(/[\s().-]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    if (/^0[5-7]\d{8}$/.test(s)) s = "+212" + s.slice(1);
    else if (/^212[5-7]\d{8}$/.test(s)) s = "+" + s;
    else if (/^[5-7]\d{8}$/.test(s)) s = "+212" + s;
    else return null;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith("+212") && !/^\+212[5-7]\d{8}$/.test(s)) return null;
  return s;
}

function phoneHash(e164) {
  const key = phoneKey();
  if (!key) return null;
  return crypto.createHmac("sha256", key).update(e164).digest("hex");
}

const card = (p, extra = {}) => ({
  userId: p.userId,
  name: p.fullName,
  handle: p.handle,
  avatarConfig: p.avatarConfig ? safe(p.avatarConfig) : null,
  isPrivate: p.isPrivate,
  ...extra,
});
function safe(s) { try { return JSON.parse(s); } catch { return null; } }

const DEDUPED = new Set(["FOLLOW_REQUEST", "NEW_FOLLOWER"]);
async function notify(userId, type, payload = {}) {
  // A follow/unfollow loop must not spam: one notification per (type, person) per 24h.
  if (DEDUPED.has(type) && payload.userId != null) {
    const dup = await rawDb().lawNotification.findFirst({ where: { userId, type, createdAt: { gte: new Date(Date.now() - 86400000) }, payload: { contains: `"userId":${payload.userId},` } } });
    if (dup) return;
  }
  await rawDb().lawNotification.create({ data: { userId, type, payload: JSON.stringify(payload) } });
}

async function blockedBetween(a, b) {
  return !!(await rawDb().lawBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } }));
}

/** ids blocked by me or blocking me */
async function blockedSet(userId) {
  const rows = await rawDb().lawBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

// Notification types behind each Settings switch. Anything not listed (moderation outcomes, AI corrections, role changes) always shows.
const CATEGORY_TYPES = Object.freeze({
  notifyFriends: ["FOLLOW_REQUEST", "FOLLOW_ACCEPTED", "FRIEND_REQUEST", "FRIEND_ACCEPTED", "NEW_FOLLOWER"],
  notifyHub: ["HUB_CHANGE_REQUEST", "HUB_MERGED", "HUB_CHANGE_REJECTED"],
  notifyForum: ["CAMPUS_REPLY", "SQUAD_DOC_NEW", "SQUAD_CR_OPENED"],
  notifyReminders: ["BRAIN_REMINDER", "SESSION_REMINDER", "SESSION_SOON"],
});
/** Types the student turned off. Missing preferences row = everything on. */
const hiddenTypes = (prefs) => (prefs ? Object.entries(CATEGORY_TYPES).filter(([flag]) => prefs[flag] === false).flatMap(([, types]) => types) : []);

const LawSocial = {
  normalizePhone, phoneHash, flagOn,

  /** Relationship of `me` to `other`: none | pending | following | requested_by_them | friends | blocked. */
  status: async function (me, other) {
    if (await blockedBetween(me, other)) return "blocked";
    const [mine, theirs] = await Promise.all([
      rawDb().lawFollow.findUnique({ where: { followerId_followeeId: { followerId: me, followeeId: other } } }),
      rawDb().lawFollow.findUnique({ where: { followerId_followeeId: { followerId: other, followeeId: me } } }),
    ]);
    if (mine?.status === "ACCEPTED" && theirs?.status === "ACCEPTED") return "friends";
    if (mine?.status === "ACCEPTED") return "following";
    if (mine?.status === "PENDING") return "pending";
    if (theirs?.status === "PENDING") return "requested_by_them";
    return "none";
  },

  follow: async function (me, targetId, now = new Date()) {
    if (me === targetId) return { error: "cannot_follow_self" };
    const target = await rawDb().lawUserProfile.findUnique({ where: { userId: targetId } });
    if (!target || (await blockedBetween(me, targetId))) return { error: "not_found" }; // a block is indistinguishable from absence
    const existing = await rawDb().lawFollow.findUnique({ where: { followerId_followeeId: { followerId: me, followeeId: targetId } } });
    if (existing?.status === "ACCEPTED" || existing?.status === "PENDING") return { status: await this.status(me, targetId), error: null };
    if (existing?.status === "REJECTED" && existing.decidedAt && now - existing.decidedAt < REREQUEST_AFTER_DAYS * 86400000)
      return { error: "request_cooldown", status: 429 };
    const status = target.isPrivate ? "PENDING" : "ACCEPTED";
    const data = { status, decidedAt: status === "ACCEPTED" ? now : null, createdAt: now };
    if (existing) await rawDb().lawFollow.update({ where: { id: existing.id }, data });
    else await rawDb().lawFollow.create({ data: { followerId: me, followeeId: targetId, ...data } });
    const mine = await rawDb().lawUserProfile.findUnique({ where: { userId: me }, select: { fullName: true } });
    await notify(targetId, status === "PENDING" ? "FOLLOW_REQUEST" : "NEW_FOLLOWER", { userId: me, name: mine?.fullName || "" });
    return { status: await this.status(me, targetId), error: null };
  },

  unfollow: async function (me, targetId) {
    // A REJECTED row is kept: deleting it would let the follower skip the re-request cooldown.
    await rawDb().lawFollow.deleteMany({ where: { followerId: me, followeeId: targetId, status: { not: "REJECTED" } } });
    // The legacy friend-code friendship was mutual; once one side stops following it no longer holds.
    await rawDb().lawFriendship.deleteMany({ where: { OR: [{ requesterId: me, addresseeId: targetId }, { requesterId: targetId, addresseeId: me }] } });
    return { status: await this.status(me, targetId), error: null };
  },

  /** Pending requests addressed to me. */
  requests: async function (me) {
    const rows = await rawDb().lawFollow.findMany({ where: { followeeId: me, status: "PENDING" }, orderBy: { createdAt: "asc" } });
    const profiles = await rawDb().lawUserProfile.findMany({ where: { userId: { in: rows.map((r) => r.followerId) } } });
    const by = new Map(profiles.map((p) => [p.userId, p]));
    return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, from: card(by.get(r.followerId) || { userId: r.followerId, fullName: "—" }) }));
  },

  /** Only the followee can decide. */
  decide: async function (me, requestId, accept, now = new Date()) {
    const r = await rawDb().lawFollow.findUnique({ where: { id: String(requestId) } });
    if (!r || r.followeeId !== me || r.status !== "PENDING") return { error: "not_found" };
    if (await blockedBetween(me, r.followerId)) return { error: "not_found" };
    await rawDb().lawFollow.update({ where: { id: r.id }, data: { status: accept ? "ACCEPTED" : "REJECTED", decidedAt: now } });
    if (accept) {
      const mine = await rawDb().lawUserProfile.findUnique({ where: { userId: me }, select: { fullName: true } });
      await notify(r.followerId, "FOLLOW_ACCEPTED", { userId: me, name: mine?.fullName || "" });
    }
    return { error: null };
  },

  block: async function (me, targetId) {
    if (me === targetId) return { error: "cannot_block_self" };
    if (!(await rawDb().lawUserProfile.findUnique({ where: { userId: targetId } }))) return { error: "not_found" };
    await rawDb().$transaction([
      rawDb().lawBlock.upsert({ where: { blockerId_blockedId: { blockerId: me, blockedId: targetId } }, create: { blockerId: me, blockedId: targetId }, update: {} }),
      rawDb().lawFollow.deleteMany({ where: { OR: [{ followerId: me, followeeId: targetId }, { followerId: targetId, followeeId: me }] } }),
      rawDb().lawFriendship.deleteMany({ where: { OR: [{ requesterId: me, addresseeId: targetId }, { requesterId: targetId, addresseeId: me }] } }),
      rawDb().lawNotification.deleteMany({ where: { userId: me, type: "FOLLOW_REQUEST", payload: { contains: `"userId":${targetId},` } } }),
    ]);
    return { error: null };
  },

  unblock: async function (me, targetId) {
    await rawDb().lawBlock.deleteMany({ where: { blockerId: me, blockedId: targetId } });
    return { error: null };
  },

  blocked: async function (me) {
    const rows = await rawDb().lawBlock.findMany({ where: { blockerId: me } });
    const profiles = await rawDb().lawUserProfile.findMany({ where: { userId: { in: rows.map((r) => r.blockedId) } } });
    return profiles.map((p) => card(p));
  },

  friendIds: async function (me) {
    const out = await rawDb().lawFollow.findMany({ where: { followerId: me, status: "ACCEPTED" }, select: { followeeId: true } });
    if (!out.length) return [];
    const back = await rawDb().lawFollow.findMany({ where: { followeeId: me, status: "ACCEPTED", followerId: { in: out.map((o) => o.followeeId) } }, select: { followerId: true } });
    const blocked = await blockedSet(me);
    return back.map((b) => b.followerId).filter((id) => !blocked.has(id));
  },

  friends: async function (me) {
    const ids = await this.friendIds(me);
    const profiles = await rawDb().lawUserProfile.findMany({ where: { userId: { in: ids } } });
    return profiles.map((p) => card(p, { status: "friends" }));
  },

  /** Find by @handle prefix (discoverable only) or an exact friend code. Blocked users never appear. */
  find: async function (me, q) {
    const term = String(q || "").trim();
    if (!term) return [];
    const share = term.includes("-") ? require("../utils/law/shareCode").normalize(term) : null; // a bare 8 letters is a handle search
    const isCode = !!share || FRIEND_CODE.test(term.toUpperCase());
    // Friend codes are guessable (4 digits): a few attempts a day is plenty for honest use; handles are cheaper.
    if (!(await hit(isCode ? "find-code" : "find-handle", me, isCode ? 30 : 300))) return { error: "rate_limited", status: 429 };
    const blocked = await blockedSet(me);
    let rows = [];
    if (isCode) {
      const p = await rawDb().lawUserProfile.findUnique({ where: share ? { shareCode: share } : { friendCode: term.toUpperCase() } });
      rows = p ? [p] : [];
    } else {
      const h = term.replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_.]{3,20}$/.test(h)) return [];
      rows = await rawDb().lawUserProfile.findMany({ where: { handle: { startsWith: h }, discoverable: true }, take: 20 });
    }
    rows = rows.filter((p) => p.userId !== me && !blocked.has(p.userId));
    const out = [];
    for (const p of rows) out.push(card(p, { status: await this.status(me, p.userId) }));
    return out;
  },

  // ---- phone discovery (opt-in, flagged) ----
  setPhone: async function (me, raw, now = new Date()) {
    if (!flagOn()) return { error: "feature_disabled", status: 404 };
    const e164 = normalizePhone(raw);
    if (!e164) return { error: "invalid_phone" };
    const hash = phoneHash(e164);
    if (!hash) return { error: "phone_matching_unavailable", status: 503 };
    if (!(await hit("phone-set", me, 3, { now }))) return { error: "rate_limited", status: 429 };
    // No ownership proof exists yet (no SMS provider), so a taken number is NOT revealed: the answer is the same and
    // nothing is stored. Do not enable the feature in production before phone verification exists (docs/PROGRESS.md).
    const taken = await rawDb().lawPhoneHash.findUnique({ where: { hash } });
    if (taken && taken.userId !== me) return { error: null };
    await rawDb().lawPhoneHash.upsert({ where: { userId: me }, create: { userId: me, hash, consentAt: now }, update: { hash, consentAt: now } });
    return { error: null };
  },
  removePhone: async function (me) {
    await rawDb().lawPhoneHash.deleteMany({ where: { userId: me } });
    return { error: null };
  },
  hasPhone: async (me) => !!(await rawDb().lawPhoneHash.findUnique({ where: { userId: me } })),

  /** Numbers arrive over TLS, are hashed here and discarded; the list is never stored or logged. */
  matchContacts: async function (me, numbers, now = new Date()) {
    if (!flagOn()) return { error: "feature_disabled", status: 404 };
    if (!Array.isArray(numbers) || !numbers.length || numbers.length > CONTACT_MAX_NUMBERS) return { error: "invalid_contacts" };
    if (!phoneKey()) return { error: "phone_matching_unavailable", status: 503 };
    // 3 matches a day per student, claimed atomically (parallel requests cannot multiply the allowance)
    if (!(await hit("contact-match", me, CONTACT_DAILY_LIMIT, { now }))) return { error: "rate_limited", status: 429 };
    const hashes = [...new Set(numbers.map(normalizePhone).filter(Boolean).map(phoneHash))];
    const hits = hashes.length ? await rawDb().lawPhoneHash.findMany({ where: { hash: { in: hashes } } }) : [];
    const blocked = await blockedSet(me);
    const profiles = await rawDb().lawUserProfile.findMany({ where: { userId: { in: hits.map((h) => h.userId) }, discoverable: true } });
    const out = [];
    for (const p of profiles) if (p.userId !== me && !blocked.has(p.userId)) out.push(card(p, { status: await this.status(me, p.userId) }));
    return { matches: out, error: null };
  },

  // ---- notifications ----
  notifications: async function (me, { limit = 30 } = {}) {
    // A category the student switched off in Settings is hidden here (list and unread count); safety and moderation notices always show.
    const prefs = await rawDb().lawUserPreferences.findUnique({ where: { userId: me } });
    const off = hiddenTypes(prefs);
    const base = { userId: me, ...(off.length ? { type: { notIn: off } } : {}) };
    const rows = await rawDb().lawNotification.findMany({ where: base, orderBy: { createdAt: "desc" }, take: Math.min(100, limit) });
    const unread = await rawDb().lawNotification.count({ where: { ...base, readAt: null } });
    return { unread, items: rows.map((n) => ({ id: n.id, type: n.type, payload: safe(n.payload) || {}, readAt: n.readAt, createdAt: n.createdAt })) };
  },
  /** One notification of mine; null when it does not exist or belongs to someone else. */
  markOneRead: async function (me, id) {
    const n = await rawDb().lawNotification.findFirst({ where: { id: String(id), userId: me }, select: { id: true } });
    if (!n) return null;
    const r = await rawDb().lawNotification.updateMany({ where: { id: n.id, userId: me, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  },
  markRead: async function (me, ids) {
    const where = { userId: me, readAt: null, ...(Array.isArray(ids) && ids.length ? { id: { in: ids.map(String) } } : {}) };
    const r = await rawDb().lawNotification.updateMany({ where, data: { readAt: new Date() } });
    return { updated: r.count };
  },

  // ---- suggestions ----
  /**
   * Candidates: discoverable, not me, not followed / pending, not blocked either way. Score = academic match
   * (faculty 20, semester 25, track 20, language 10, group 25) + diligence (streak up to 25, active in the last 3 days
   * +10) + mutual friends (8 each, cap 24). Computed on request over at most 200 candidates (same faculty first):
   * at this deployment's size that is a few ms, so no nightly cache table is needed.
   */
  suggestions: async function (me, { limit = 20, now = new Date() } = {}) {
    const mine = await rawDb().lawUserProfile.findUnique({ where: { userId: me } });
    if (!mine) return [];
    const blocked = await blockedSet(me);
    const followed = await rawDb().lawFollow.findMany({ where: { followerId: me }, select: { followeeId: true } });
    const exclude = new Set([me, ...blocked, ...followed.map((f) => f.followeeId)]);
    const sameFaculty = await rawDb().lawUserProfile.findMany({ where: { discoverable: true, isPrivate: false, userId: { notIn: [...exclude] }, ...(mine.facultyCode ? { facultyCode: mine.facultyCode } : {}) }, take: 200, orderBy: { updatedAt: "desc" } });
    let cands = sameFaculty;
    if (cands.length < 200) {
      const more = await rawDb().lawUserProfile.findMany({ where: { discoverable: true, isPrivate: false, userId: { notIn: [...exclude, ...cands.map((c) => c.userId)] } }, take: 200 - cands.length, orderBy: { updatedAt: "desc" } });
      cands = cands.concat(more);
    }
    if (!cands.length) return [];
    const ids = cands.map((c) => c.userId);
    const streaks = new Map((await rawDb().lawStreak.findMany({ where: { userId: { in: ids } }, select: { userId: true, current: true } })).map((s) => [s.userId, s.current]));
    const since = addDays(localDate(now), -3);
    const active = new Set((await rawDb().lawStudyDay.findMany({ where: { userId: { in: ids }, date: { gte: since } }, select: { userId: true } })).map((d) => d.userId));
    // mutual friends: my friends' accepted-follow edges to each candidate
    const myFriends = await this.friendIds(me);
    const edges = myFriends.length ? await rawDb().lawFollow.findMany({ where: { followerId: { in: myFriends }, followeeId: { in: ids }, status: "ACCEPTED" }, select: { followeeId: true } }) : [];
    const mutual = new Map();
    for (const e of edges) mutual.set(e.followeeId, (mutual.get(e.followeeId) || 0) + 1);

    const scored = cands.map((c) => {
      const reasons = [];
      let score = 0;
      if (mine.facultyCode && c.facultyCode === mine.facultyCode) score += 20;
      if (c.semester === mine.semester) { score += 25; reasons.push({ code: "same_semester" }); }
      if (mine.track && c.track === mine.track) score += 20;
      if (mine.studyLang && c.studyLang === mine.studyLang) score += 10;
      if (c.tdGroup === mine.tdGroup && c.semester === mine.semester) { score += 25; reasons.unshift({ code: "same_group" }); }
      const streak = streaks.get(c.userId) || 0;
      score += (Math.min(streak, 60) / 60) * 25;
      if (streak >= 3) reasons.push({ code: "diligent", streak });
      if (active.has(c.userId)) score += 10;
      const m = mutual.get(c.userId) || 0;
      score += Math.min(m * 8, 24);
      if (m) reasons.push({ code: "mutual_friends", count: m });
      return { c, score, reasons };
    });
    scored.sort((a, b) => b.score - a.score || a.c.userId - b.c.userId);
    return scored.slice(0, Math.min(50, limit)).map(({ c, score, reasons }) => card(c, { score: Math.round(score), reasons }));
  },
};

module.exports = { LawSocial, blockedBetween };
