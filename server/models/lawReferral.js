// Qanouni Collab Phase C: referrals (نظام الإحالات). Every student has one reusable invite code; a sign-up
// with it creates a pending referral. Anti-farming: the referral activates only once the invited student
// has really studied, meaning 3 study sessions (distinct days with reviews or a captured class) OR 20 genuine
// reviews (at least 1 s each, on at least 5 different cards). Activation rewards the referrer with +250 XP
// (models/lawProgress.js), the "سفير الفوج" badge, and one extra seat in their squad (6 → at most 8).
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");
const { localDate } = require("../utils/law/time");
const { serialWrite } = require("../utils/law/writeLock");

const REWARD_XP = 250;
const MIN_SESSIONS = 3;
const MIN_REVIEWS = 20;
const MIN_REVIEW_MS = 1000;
const MIN_DISTINCT_CARDS = 5;
const BASE_SEATS = 6;
const MAX_EXTRA_SEATS = 2;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const normalizeCode = (c) =>
  String(c || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

const LawReferral = {
  REWARD_XP,
  MIN_SESSIONS,
  MIN_REVIEWS,
  BASE_SEATS,
  MAX_EXTRA_SEATS,
  normalizeCode,

  /** The student's invite code (INV-XXXXXX), created on first use. */
  code: async function (userId) {
    return serialWrite(() => this._code(userId));
  },

  _code: async function (userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    if (!p) return null;
    if (p.referralCode) return p.referralCode;
    for (let i = 0; i < 20; i++) {
      const code = `INV-${Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("")}`;
      try {
        await rawDb().lawUserProfile.update({ where: { userId }, data: { referralCode: code } });
        return code;
      } catch (e) {
        if (e?.code !== "P2002") throw e;
      }
    }
    throw new Error("could not allocate a referral code");
  },

  /**
   * Links a brand-new account to the referrer whose code was used. Never blocks a sign-up: an unknown,
   * suspended or self code is simply ignored.
   */
  attach: async function (referredUserId, code) {
    const c = normalizeCode(code);
    if (!c) return { attached: false };
    const owner = await rawDb().lawUserProfile.findUnique({ where: { referralCode: c } });
    if (!owner || owner.userId === referredUserId) return { attached: false };
    const user = await rawDb().users.findUnique({ where: { id: owner.userId } });
    if (!user || user.suspended) return { attached: false };
    try {
      await rawDb().lawReferral.create({ data: { referrerId: owner.userId, referredUserId, code: c } });
      return { attached: true };
    } catch (e) {
      if (e?.code === "P2002") return { attached: false };
      throw e;
    }
  },

  /** The invited student's real study so far, against the activation thresholds. */
  progress: async function (userId) {
    const [reviews, classes] = await Promise.all([
      rawDb().lawReviewLog.findMany({
        where: { userId, durationMs: { gte: MIN_REVIEW_MS } },
        select: { cardId: true, reviewedAt: true },
      }),
      rawDb().lawClassSession.findMany({ where: { userId }, select: { date: true } }),
    ]);
    const days = new Set([...reviews.map((r) => localDate(r.reviewedAt)), ...classes.map((c) => c.date)]);
    const distinctCards = new Set(reviews.map((r) => r.cardId)).size;
    const sessions = days.size;
    const qualifies =
      sessions >= MIN_SESSIONS || (reviews.length >= MIN_REVIEWS && distinctCards >= MIN_DISTINCT_CARDS);
    return { sessions, reviews: reviews.length, distinctCards, qualifies };
  },

  /** Activates the pending referral of this (invited) student once they qualify. Idempotent. */
  checkActivation: async function (referredUserId, now = new Date()) {
    return serialWrite(() => this._checkActivation(referredUserId, now));
  },

  _checkActivation: async function (referredUserId, now = new Date()) {
    const r = await rawDb().lawReferral.findUnique({ where: { referredUserId } });
    if (!r || r.status !== "pending") return { activated: false };
    const p = await this.progress(referredUserId);
    if (!p.qualifies) return { activated: false, progress: p };
    const { count } = await rawDb().lawReferral.updateMany({
      where: { id: r.id, status: "pending" },
      data: { status: "activated", activatedAt: now },
    });
    return { activated: count === 1, progress: p };
  },

  /** Activated referrals of a student (optionally since an instant): XP and badges. */
  activatedCount: async function (referrerId, since = null) {
    return rawDb().lawReferral.count({
      where: { referrerId, status: "activated", ...(since ? { activatedAt: { gte: since } } : {}) },
    });
  },

  /** Seats in a squad: 6, plus one per activated referral of its current members, at most 8. */
  squadCapacity: async function (squadId) {
    const members = await rawDb().lawSquadMember.findMany({ where: { squadId }, select: { userId: true } });
    const extra = await rawDb().lawReferral.count({
      where: { referrerId: { in: members.map((m) => m.userId) }, status: "activated" },
    });
    return BASE_SEATS + Math.min(MAX_EXTRA_SEATS, extra);
  },

  /** The referrer's view: code, invitees with status and progress (pending ones are re-checked first). */
  mine: async function (userId) {
    const code = await this.code(userId);
    let rows = await rawDb().lawReferral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" } });
    for (const r of rows.filter((x) => x.status === "pending")) await this.checkActivation(r.referredUserId);
    rows = await rawDb().lawReferral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" } });
    const profiles = await rawDb().lawUserProfile.findMany({
      where: { userId: { in: rows.map((r) => r.referredUserId) } },
      select: { userId: true, fullName: true },
    });
    const nameOf = new Map(profiles.map((p) => [p.userId, p.fullName]));
    const referrals = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: nameOf.get(r.referredUserId) || "—",
        status: r.status,
        createdAt: r.createdAt,
        activatedAt: r.activatedAt,
        ...(r.status === "pending"
          ? (({ sessions, reviews }) => ({ progress: { sessions, reviews } }))(await this.progress(r.referredUserId))
          : {}),
      }))
    );
    const activated = referrals.filter((r) => r.status === "activated").length;
    return {
      code,
      referrals,
      activated,
      xpEarned: activated * REWARD_XP,
      ambassador: activated > 0,
      rules: { minSessions: MIN_SESSIONS, minReviews: MIN_REVIEWS, rewardXp: REWARD_XP, maxSeats: BASE_SEATS + MAX_EXTRA_SEATS },
    };
  },
};

module.exports = { LawReferral };
