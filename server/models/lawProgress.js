// Qanouni profile progress (Duolingo-style): XP, legal levels, study hours, friend codes and study buddies.
// XP is derived from what the student actually did (review logs, submitted case attempts, written
// dissertation drafts, completed captures, goal-met study days), so it counts past work, can never be
// double-counted by a retried request, and needs no ledger. Friendships cross users: unscoped client with
// explicit userId filters, and a friend's numbers are only read once the friendship is accepted.
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");
const { runAs } = require("../utils/law/tenant");
const { localDate, weekStart } = require("../utils/law/time");
const { serialWrite } = require("../utils/law/writeLock");

const XP = {
  review: 10,
  caseAttempt: 50,
  dissertationDraft: 60,
  capture: 20,
  streakDay: 30,
  verifiedCorrection: 25, // Phase 10: an AI mistake the student reported and an admin verified
  pathNode: 15, // Phase 9: a course-path node completed (once per node)
  mergedChangeRequest: 40, // Phase 8: a Hub edit the note's owner accepted
  referral: 250, // Phase C: an invited student who really studied (models/lawReferral.js)
};

// Level n starts at LEVELS[n-1].min. Past the last named level, a new level every 2500 XP (same title).
const LEVELS = [
  { level: 1, min: 0, title: "طالب مبتدئ" },
  { level: 2, min: 201, title: "ممارس واعد" },
  { level: 3, min: 501, title: "باحث في القانون" },
  { level: 4, min: 1001, title: "مستشار قانوني" },
  { level: 5, min: 2501, title: "قاضي / محام مقيد بالجدول" },
];
const STEP_AFTER_TOP = 2500;

function levelMin(level) {
  if (level <= LEVELS.length) return LEVELS[level - 1].min;
  return LEVELS[LEVELS.length - 1].min + (level - LEVELS.length) * STEP_AFTER_TOP;
}

/** {level, title, min, next, progress 0..1} for an XP total. */
function levelFor(xp) {
  const top = LEVELS[LEVELS.length - 1];
  let level;
  if (xp >= top.min) level = LEVELS.length + Math.floor((xp - top.min) / STEP_AFTER_TOP);
  else level = [...LEVELS].reverse().find((l) => xp >= l.min).level;
  const min = levelMin(level);
  const next = levelMin(level + 1);
  const title = LEVELS[Math.min(level, LEVELS.length) - 1].title;
  return { level, title, min, next, progress: Math.min(1, (xp - min) / (next - min)) };
}

/** The instant a local YYYY-MM-DD day starts (the server's time zone, see utils/law/time.js). */
function dayStartInstant(dateStr) {
  const guess = Date.parse(`${dateStr}T00:00:00Z`);
  let best = null;
  for (let h = -14; h <= 14; h++) {
    const t = guess - h * 3600_000;
    if (localDate(new Date(t)) === dateStr && localDate(new Date(t - 1)) !== dateStr)
      best = best === null ? t : Math.min(best, t);
  }
  return new Date(best ?? guess);
}

/** Activity counts for one user, all time or since a local date. */
async function activity(userId, sinceDate = null) {
  const since = sinceDate ? dayStartInstant(sinceDate) : null;
  const at = (field) => (since ? { [field]: { gte: since } } : {});
  const d = rawDb();
  const [reviews, cases, dissertations, captures, streakDays, minutes, caseSeconds] =
    await Promise.all([
      d.lawReviewLog.count({ where: { userId, ...at("reviewedAt") } }),
      d.lawCaseAttempt.count({ where: { userId, submittedAt: { not: null, ...(since ? { gte: since } : {}) } } }),
      d.lawDissertation.count({
        where: { userId, draftBody: { not: null }, NOT: { draftBody: "" }, ...at("createdAt") },
      }),
      d.lawCaptureBatch.count({
        where: {
          userId,
          status: "complete",
          kind: { in: ["photo_batch", "audio_recording"] },
          ...at("createdAt"),
        },
      }),
      d.lawStudyDay.count({
        where: { userId, goalMet: true, ...(sinceDate ? { date: { gte: sinceDate } } : {}) },
      }),
      d.lawStudyDay.aggregate({
        where: { userId, ...(sinceDate ? { date: { gte: sinceDate } } : {}) },
        _sum: { retrievalMinutes: true },
      }),
      d.lawCaseAttempt.aggregate({
        where: { userId, submittedAt: { not: null }, ...at("startedAt") },
        _sum: { durationSec: true },
      }),
    ]);
  // Activated referrals count in the window of their activation.
  const referrals = await d.lawReferral.count({
    where: { referrerId: userId, status: "activated", ...(since ? { activatedAt: { gte: since } } : {}) },
  });
  // One reward per note (not per request): splitting an edit into many tiny requests earns nothing extra.
  const mergedCRs = (
    await d.lawChangeRequest.findMany({
      where: { authorId: userId, status: "MERGED", note: { moderationStatus: "ACTIVE" }, ...(since ? { decidedAt: { gte: since } } : {}) },
      distinct: ["noteId"],
      select: { noteId: true },
    })
  ).length;
  const nodesDone = await d.lawNodeProgress.count({
    where: { userId, state: "COMPLETED", xpAwarded: true, ...(since ? { updatedAt: { gte: since } } : {}) },
  });
  const corrections = await d.lawAiCorrection.count({
    where: { reporterId: userId, status: "VERIFIED", ...(since ? { decidedAt: { gte: since } } : {}) },
  });
  const xp =
    corrections * XP.verifiedCorrection +
    nodesDone * XP.pathNode +
    mergedCRs * XP.mergedChangeRequest +
    referrals * XP.referral +
    reviews * XP.review +
    cases * XP.caseAttempt +
    dissertations * XP.dissertationDraft +
    captures * XP.capture +
    streakDays * XP.streakDay;
  const studyMinutes = (minutes._sum.retrievalMinutes || 0) + (caseSeconds._sum.durationSec || 0) / 60;
  return { xp, reviews, cases, dissertations, captures, streakDays, studyMinutes, referrals };
}

async function currentStreak(userId, now) {
  // LawReview.streak recomputes from study days when stale; it runs as that user (scoped client).
  const { LawReview } = require("./lawReview");
  try {
    const s = await runAs({ userId, role: "default" }, () => LawReview.streak(now));
    return { current: s.current || 0, longest: s.longest || 0 };
  } catch {
    return { current: 0, longest: 0 };
  }
}

// ---- friend codes --------------------------------------------------------------------------------------
const FRIEND_CODE = /^QAN-[A-Z0-9]{2,10}-\d{4}$/;
const shareCodes = require("../utils/law/shareCode");

function codeBase(profile, username) {
  const fromName = String(profile?.fullName || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  const fromUser = String(username || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const base = (fromName.length >= 2 ? fromName : fromUser).slice(0, 10);
  return base.length >= 2 ? base : "ETUDIANT".slice(0, 8);
}

/** Keeps the Phase 7 follow graph in step with the legacy friend-code flow: a friendship = two ACCEPTED follows. */
async function mirrorFriendship(a, b, accepted) {
  const db = rawDb();
  if (!accepted) {
    await db.lawFollow.deleteMany({ where: { OR: [{ followerId: a, followeeId: b }, { followerId: b, followeeId: a }] } });
    return;
  }
  const now = new Date();
  for (const [f, t] of [[a, b], [b, a]])
    await db.lawFollow.upsert({
      where: { followerId_followeeId: { followerId: f, followeeId: t } },
      create: { followerId: f, followeeId: t, status: "ACCEPTED", decidedAt: now },
      update: { status: "ACCEPTED", decidedAt: now },
    });
}

const LawProgress = {
  XP,
  LEVELS,
  levelFor,
  activity,
  dayStartInstant,
  FRIEND_CODE,

  /** The user's friend code, created on first use (QAN-NAME-1234). */
  friendCode: async function (userId) {
    return serialWrite(() => this._friendCode(userId));
  },

  /** The user's XXXX-XXXX share code (RC3 Phase 7), created on first use. */
  shareCode: async function (userId) {
    return serialWrite(async () => {
      const profile = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { shareCode: true } });
      if (!profile) return null;
      if (profile.shareCode) return profile.shareCode;
      for (let i = 0; i < 20; i++) {
        const code = shareCodes.generate();
        try {
          await rawDb().lawUserProfile.update({ where: { userId }, data: { shareCode: code } });
          return code;
        } catch (e) {
          if (e?.code !== "P2002") throw e;
        }
      }
      throw new Error("could not allocate a share code");
    });
  },

  _friendCode: async function (userId) {
    const profile = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    if (!profile) return null;
    if (profile.friendCode) return profile.friendCode;
    const user = await rawDb().users.findUnique({ where: { id: userId } });
    const base = codeBase(profile, user?.username);
    for (let i = 0; i < 20; i++) {
      const code = `QAN-${base}-${crypto.randomInt(1000, 10000)}`;
      try {
        await rawDb().lawUserProfile.update({ where: { userId }, data: { friendCode: code } });
        return code;
      } catch (e) {
        if (e?.code !== "P2002") throw e;
      }
    }
    throw new Error("could not allocate a friend code");
  },

  /** XP (all time and this week) and streak for any user: squad member lists and friend lists. */
  memberStats: async function (userId, now = new Date()) {
    // The streak may be recomputed (a write): never in parallel with other writes (SQLite has one writer).
    const streak = await currentStreak(userId, now);
    const [all, week] = await Promise.all([activity(userId), activity(userId, weekStart(localDate(now)))]);
    return { xp: all.xp, weeklyXp: week.xp, level: levelFor(all.xp).level, streak: streak.current };
  },

  /** Full profile summary for the signed-in student. */
  summary: async function (userId, now = new Date()) {
    const today = localDate(now);
    // Writes first and one at a time (friend code creation, streak recompute), then the reads in parallel.
    const friendCode = await this.friendCode(userId);
    const shareCode = await this.shareCode(userId);
    const streak = await currentStreak(userId, now);
    const [all, week] = await Promise.all([activity(userId), activity(userId, weekStart(today))]);
    return {
      xp: all.xp,
      weeklyXp: week.xp,
      level: levelFor(all.xp),
      streak,
      studyHours: Math.round((all.studyMinutes / 60) * 10) / 10,
      counts: {
        reviews: all.reviews,
        cases: all.cases,
        dissertations: all.dissertations,
        captures: all.captures,
        streakDays: all.streakDays,
        referrals: all.referrals,
      },
      ambassador: all.referrals > 0, // "سفير الفوج"
      xpRules: XP,
      friendCode,
      shareCode,
    };
  },

  /** A notification for the other student of a friendship: { type, payload }. Failure to notify never fails the friendship. */
  _notifyFriend: async function (toUserId, fromUserId, type, extra = {}) {
    try {
      const from = await rawDb().lawUserProfile.findUnique({ where: { userId: fromUserId }, select: { fullName: true } });
      await rawDb().lawNotification.create({ data: { userId: toUserId, type, payload: JSON.stringify({ userId: fromUserId, name: from?.fullName || "", ...extra }) } });
    } catch (e) {
      console.error("[friends] notification failed:", e.message);
    }
  },

  // ---- study buddies -----------------------------------------------------------------------------------
  /** Sends a request to the owner of `code`; accepts at once when they had already asked us. */
  addFriend: async function (userId, code) {
    const normalized = String(code || "").trim().toUpperCase();
    const share = shareCodes.normalize(normalized);
    if (!share && !FRIEND_CODE.test(normalized)) return { error: "invalid_friend_code" };
    const target = await rawDb().lawUserProfile.findUnique({ where: share ? { shareCode: share } : { friendCode: normalized } });
    if (!target) return { error: "invalid_friend_code" };
    if (target.userId === userId) return { error: "cannot_add_self" };
    if (await require("./lawSocial").blockedBetween(userId, target.userId)) return { error: "invalid_friend_code" }; // a block looks like an unknown code
    const reverse = await rawDb().lawFriendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: target.userId, addresseeId: userId } },
    });
    if (reverse) {
      if (reverse.status !== "accepted")
        await rawDb().lawFriendship.update({ where: { id: reverse.id }, data: { status: "accepted" } });
      await mirrorFriendship(userId, target.userId, true);
      if (reverse.status !== "accepted") await this._notifyFriend(target.userId, userId, "FRIEND_ACCEPTED");
      return { status: "accepted" };
    }
    const existing = await rawDb().lawFriendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: userId, addresseeId: target.userId } },
    });
    if (existing) return { status: existing.status };
    const created = await rawDb().lawFriendship.create({
      data: { requesterId: userId, addresseeId: target.userId },
    });
    await this._notifyFriend(target.userId, userId, "FRIEND_REQUEST", { friendshipId: created.id });
    return { status: "pending" };
  },

  /** Accept or decline a request addressed to userId. */
  respond: async function (userId, friendshipId, accept) {
    const row = await rawDb().lawFriendship.findUnique({ where: { id: String(friendshipId || "") } });
    if (!row || row.addresseeId !== userId || row.status !== "pending") return { error: "not_found" };
    if (await require("./lawSocial").blockedBetween(row.requesterId, row.addresseeId)) return { error: "not_found" };
    if (accept) {
      await rawDb().lawFriendship.update({ where: { id: row.id }, data: { status: "accepted" } });
      await mirrorFriendship(row.requesterId, row.addresseeId, true);
      await this._notifyFriend(row.requesterId, userId, "FRIEND_ACCEPTED");
    } else await rawDb().lawFriendship.delete({ where: { id: row.id } });
    return { ok: true };
  },

  /** Removes a friend or cancels a request, from either side. */
  remove: async function (userId, friendshipId) {
    const row = await rawDb().lawFriendship.findUnique({ where: { id: String(friendshipId || "") } });
    if (!row || (row.requesterId !== userId && row.addresseeId !== userId))
      return { error: "not_found" };
    await rawDb().lawFriendship.delete({ where: { id: row.id } });
    await mirrorFriendship(row.requesterId, row.addresseeId, false);
    return { ok: true };
  },

  /** Accepted friends with streak and weekly XP, the weekly leaderboard (me included), and pending requests. */
  friends: async function (userId, now = new Date()) {
    let rows = await rawDb().lawFriendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      orderBy: { createdAt: "asc" },
    });
    const otherId = (r) => (r.requesterId === userId ? r.addresseeId : r.requesterId);
    const followIds = (await require("./lawSocial").LawSocial.friendIds(userId));
    // Blocked people never show up, whichever system the friendship came from.
    const blockedRows = await rawDb().lawBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    const blockedIds = new Set(blockedRows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
    rows = rows.filter((r) => !blockedIds.has(r.requesterId === userId ? r.addresseeId : r.requesterId));
    const profiles = await rawDb().lawUserProfile.findMany({
      where: { userId: { in: [userId, ...rows.map(otherId), ...followIds] } },
    });
    const nameOf = new Map(profiles.map((p) => [p.userId, p.fullName]));
    const monday = weekStart(localDate(now));

    const accepted = rows.filter((r) => r.status === "accepted");
    // Friends made through the follow graph (no legacy row): shown too, without a friendshipId.
    const legacyIds = new Set(accepted.map(otherId));
    const { LawSocial } = require("./lawSocial");
    const followFriendIds = (await LawSocial.friendIds(userId)).filter((id) => !legacyIds.has(id));
    for (const id of followFriendIds) accepted.push({ id: null, requesterId: userId, addresseeId: id });
    // One person at a time: each streak may be recomputed (a write).
    const people = [];
    for (const p of [{ id: null, userId, me: true }, ...accepted.map((r) => ({ id: r.id, userId: otherId(r), me: false }))]) {
      const streak = await currentStreak(p.userId, now);
      const [all, week] = await Promise.all([activity(p.userId), activity(p.userId, monday)]);
      people.push({
        friendshipId: p.id,
        me: p.me,
        name: nameOf.get(p.userId) || "—",
        level: levelFor(all.xp).level,
        xp: all.xp,
        weeklyXp: week.xp,
        streak: streak.current,
      });
    }
    const leaderboard = [...people]
      .sort((a, b) => b.weeklyXp - a.weeklyXp || b.xp - a.xp)
      .map((p, i) => ({ ...p, rank: i + 1 }));
    return {
      weekStart: monday,
      friends: people.filter((p) => !p.me),
      leaderboard,
      incoming: rows
        .filter((r) => r.status === "pending" && r.addresseeId === userId)
        .map((r) => ({ friendshipId: r.id, name: nameOf.get(r.requesterId) || "—", createdAt: r.createdAt })),
      outgoing: rows
        .filter((r) => r.status === "pending" && r.requesterId === userId)
        .map((r) => ({ friendshipId: r.id, name: nameOf.get(r.addresseeId) || "—", createdAt: r.createdAt })),
    };
  },
};

module.exports = { LawProgress };
