const { db } = require("../utils/law/dbClient");
const { serialWrite } = require("../utils/law/writeLock");
const { currentUserId } = require("../utils/law/tenant");
const { LawSetting } = require("./lawSetting");
const { replay, GRADES } = require("../utils/law/fsrs");
const { localDate, addDays, weekStart } = require("../utils/law/time");
const { computeStreak } = require("../utils/law/streak");

const MAX_BATCH = 500;
const MAX_REVIEW_MS = 60_000; // one review never counts for more than a minute of retrieval
const MAX_CLOCK_SKEW_MS = 24 * 3600_000;

function validateLog(log, now) {
  if (!log || typeof log !== "object") return "invalid";
  if (
    typeof log.clientReviewId !== "string" ||
    log.clientReviewId.length < 8 ||
    log.clientReviewId.length > 100
  )
    return "invalid clientReviewId";
  if (typeof log.cardId !== "string") return "invalid cardId";
  if (!GRADES.includes(log.rating)) return "invalid rating";
  const at = new Date(log.reviewedAt);
  if (isNaN(at)) return "invalid reviewedAt";
  if (at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS)
    return "reviewedAt in the future";
  return null;
}

/**
 * Rebuilds one card's FSRS fields from its full log (order-independent, idempotent).
 * @returns {Promise<{card: object, changedDates: Set<string>}|null>} changedDates: local days whose
 *   logs got a different derived stateBefore (their study-day aggregates must be recomputed)
 */
async function replayCard(cardId, retention) {
  const card = await db().lawFlashcard.findUnique({ where: { id: cardId } });
  if (!card) return null;
  const logs = await db().lawReviewLog.findMany({
    where: { cardId },
    select: {
      id: true,
      rating: true,
      reviewedAt: true,
      clientReviewId: true,
      stateBefore: true,
    },
  });
  const { fields, steps } = replay(card.createdAt, logs, retention);
  // stateBefore is derived, never trusted from the client: two devices reviewing the same new card
  // offline must count as one new card learned, not two.
  const byClientId = new Map(logs.map((l) => [l.clientReviewId, l]));
  const changedDates = new Set();
  for (const step of steps) {
    const log = byClientId.get(step.clientReviewId);
    const before = JSON.stringify(step.before);
    if (log && log.stateBefore !== before) {
      await db().lawReviewLog.update({
        where: { id: log.id },
        data: { stateBefore: before },
      });
      changedDates.add(localDate(log.reviewedAt));
    }
  }
  const updated = await db().lawFlashcard.update({
    where: { id: cardId },
    data: fields,
  });
  return { card: updated, changedDates };
}

/** Recomputes a local day's aggregate from the logs that fall on it. */
async function recomputeStudyDay(date, goalMinutes) {
  // Local day ⊂ [date-1 00:00Z, date+2 00:00Z) for any UTC offset in ±24 h; filter precisely in JS.
  const logs = await db().lawReviewLog.findMany({
    where: {
      reviewedAt: {
        gte: new Date(`${addDays(date, -1)}T00:00:00Z`),
        lt: new Date(`${addDays(date, 2)}T00:00:00Z`),
      },
    },
    select: { reviewedAt: true, durationMs: true, stateBefore: true },
  });
  const mine = logs.filter((l) => localDate(l.reviewedAt) === date);
  const ms = mine.reduce(
    (s, l) => s + Math.min(Math.max(l.durationMs || 0, 0), MAX_REVIEW_MS),
    0
  );
  const newCards = mine.filter((l) => {
    try {
      return JSON.parse(l.stateBefore).state === "new";
    } catch {
      return false;
    }
  }).length;
  const retrievalMinutes = Math.round((ms / 60000) * 10) / 10;
  const data = {
    retrievalMinutes,
    reviewsDone: mine.length,
    newCardsLearned: newCards,
    goalMet: retrievalMinutes >= goalMinutes,
  };
  return db().lawStudyDay.upsert({
    where: { userId_date: { userId: currentUserId(), date } },
    create: { date, ...data },
    update: data,
  });
}

const LawReview = {
  MAX_BATCH,
  MAX_REVIEW_MS,

  /**
   * Idempotent batch submit (spec §6.2, §9.6). Already-known clientReviewIds are acknowledged as
   * duplicates and never inserted twice. Every touched card is replayed from its complete log, so the
   * result does not depend on arrival order or on which device synced first.
   */
  submitBatch: async function (
    logs,
    { deviceId = null, now = new Date() } = {}
  ) {
    if (!Array.isArray(logs)) return { error: "logs must be an array" };
    if (logs.length > MAX_BATCH)
      return { error: `at most ${MAX_BATCH} logs per batch` };

    const accepted = [];
    const duplicates = [];
    const rejected = [];
    const touchedCards = new Set();
    const touchedDays = new Set();
    const lapses = []; // concept-tagged cards answered "again" (feeds the learner memory)

    for (const log of logs) {
      const reason = validateLog(log, now);
      if (reason) {
        rejected.push({ clientReviewId: log?.clientReviewId ?? null, reason });
        continue;
      }
      if (
        await db().lawReviewLog.findUnique({
          where: { clientReviewId: log.clientReviewId },
        })
      ) {
        duplicates.push(log.clientReviewId);
        continue;
      }
      const card = await db().lawFlashcard.findUnique({
        where: { id: log.cardId },
      });
      if (!card) {
        rejected.push({
          clientReviewId: log.clientReviewId,
          reason: "unknown card",
        });
        continue;
      }
      try {
        await db().lawReviewLog.create({
          data: {
            cardId: log.cardId,
            rating: log.rating,
            reviewedAt: new Date(log.reviewedAt),
            durationMs: Number.isFinite(log.durationMs)
              ? Math.round(log.durationMs)
              : 0,
            stateBefore: JSON.stringify({ state: card.state }), // replaced by replay below
            deviceId: log.deviceId || deviceId,
            clientReviewId: log.clientReviewId,
          },
        });
      } catch (e) {
        if (e?.code === "P2002") {
          duplicates.push(log.clientReviewId); // a concurrent request inserted it first
          continue;
        }
        throw e;
      }
      accepted.push(log.clientReviewId);
      if (log.rating === 1 && card.conceptIds && card.conceptIds !== "[]") lapses.push({ card, at: new Date(log.reviewedAt), refId: log.clientReviewId });
      touchedCards.add(log.cardId);
      touchedDays.add(localDate(log.reviewedAt));
    }

    for (const l of lapses) {
      try {
        await require("./lawBrain").LawBrain.onLapse(l.card.userId, l.card, l);
      } catch (e) {
        console.error("[brain] lapse hook failed:", e.message); // the review itself must never fail because of the memory
      }
    }
    const settings = await LawSetting.all();
    const cards = [];
    for (const id of touchedCards) {
      const result = await replayCard(id, settings.desiredRetention);
      if (!result) continue;
      cards.push(result.card);
      for (const d of result.changedDates) touchedDays.add(d);
    }
    for (const day of touchedDays)
      await recomputeStudyDay(day, settings.dailyGoalMinutes);
    const streak = touchedDays.size
      ? await this.recomputeStreak(now)
      : await this.streak(now);
    if (deviceId)
      await db().lawDevice.updateMany({
        where: { id: deviceId },
        data: { lastSeenAt: now },
      });

    return { accepted, duplicates, rejected, cards, streak, error: null };
  },

  recomputeStreak: async function (now = new Date()) {
    // Queued with LAW-OS's other on-load writes (utils/law/writeLock.js): pages read the streak in parallel.
    return serialWrite(() => this._recomputeStreak(now));
  },

  _recomputeStreak: async function (now = new Date()) {
    const days = await db().lawStudyDay.findMany({
      select: { date: true, goalMet: true },
      orderBy: { date: "asc" },
    });
    const today = localDate(now);
    const s = computeStreak(days, today);
    const used = new Set(s.freezeUsedDates);
    for (const d of days) {
      const shouldBe = used.has(d.date);
      await db().lawStudyDay.updateMany({
        where: { date: d.date, NOT: { freezeUsed: shouldBe } },
        data: { freezeUsed: shouldBe },
      });
    }
    // Frozen days that had no activity at all have no row yet; record them so the history shows the freeze.
    for (const d of s.freezeUsedDates)
      await db().lawStudyDay.upsert({
        where: { userId_date: { userId: currentUserId(), date: d } },
        create: { date: d, freezeUsed: true },
        update: { freezeUsed: true },
      });
    const weeklyTargetMinutes = await LawSetting.get("weeklyTargetMinutes");
    const data = {
      current: s.current,
      longest: s.longest,
      freezesAvailable: s.freezesAvailable,
      freezesEarnedTotal: s.freezesEarnedTotal,
      weeklyTargetMinutes,
      lastComputedDate: today,
    };
    await db().lawStreak.upsert({
      where: { userId: currentUserId() },
      create: data,
      update: data,
    });
    return this.streak(now);
  },

  /** Streak + this week's minutes + recent days (spec §8.5: weekly total shown prominently). */
  streak: async function (now = new Date()) {
    const today = localDate(now);
    let row = await db().lawStreak.findFirst();
    if (!row || row.lastComputedDate !== today)
      return this.recomputeStreak(now);
    const monday = weekStart(today);
    const recentDays = await db().lawStudyDay.findMany({
      where: { date: { gte: addDays(today, -27) } },
      orderBy: { date: "asc" },
    });
    const weekMinutes = recentDays
      .filter((d) => d.date >= monday)
      .reduce((s, d) => s + d.retrievalMinutes, 0);
    const todayRow = recentDays.find((d) => d.date === today);
    return {
      ...row,
      today,
      todayMinutes: todayRow?.retrievalMinutes || 0,
      todayGoalMet: !!todayRow?.goalMet,
      dailyGoalMinutes: await LawSetting.get("dailyGoalMinutes"),
      weekMinutes: Math.round(weekMinutes * 10) / 10,
      recentDays,
    };
  },
};

module.exports = { LawReview, recomputeStudyDay, replayCard };
