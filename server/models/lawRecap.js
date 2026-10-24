// Sunday recap (spec §8.5): articles/decisions encountered, cards learned, weakest topics by lapse rate,
// unprocessed Inbox items, next week's sessions. Built deterministically from the logs; an optional short
// AI summary (Gemini fast) is added when available and never blocks the recap.
const { db } = require("../utils/law/dbClient");
const { currentUserId } = require("../utils/law/tenant");
const { LawInbox } = require("./lawInbox");
const { LawTimetable } = require("./lawTimetable");
const { addDays, weekStart, localDate } = require("../utils/law/time");

const parse = (v, f) => {
  try {
    return JSON.parse(v);
  } catch {
    return f;
  }
};

async function buildContent(weekStartStr) {
  const from = new Date(`${addDays(weekStartStr, -1)}T00:00:00Z`);
  const to = new Date(`${addDays(weekStartStr, 8)}T00:00:00Z`);
  const inWeek = (d) => {
    const ld = localDate(d);
    return ld >= weekStartStr && ld <= addDays(weekStartStr, 6);
  };

  const logs = (
    await db().lawReviewLog.findMany({
      where: { reviewedAt: { gte: from, lt: to } },
      include: { card: true },
    })
  ).filter((l) => inWeek(l.reviewedAt));
  const days = await db().lawStudyDay.findMany({
    where: { date: { gte: weekStartStr, lte: addDays(weekStartStr, 6) } },
  });
  const subjects = await db().lawSubject.findMany({
    select: { id: true, name: true },
  });
  const subjectName = Object.fromEntries(subjects.map((s) => [s.id, s.name]));

  // Weakest topics: subjects with the highest "Again" rate this week (≥ 5 reviews to be meaningful).
  const bySubject = new Map();
  for (const l of logs) {
    const s = bySubject.get(l.card.subjectId) || { reviews: 0, lapses: 0 };
    s.reviews++;
    if (l.rating === 1) s.lapses++;
    bySubject.set(l.card.subjectId, s);
  }
  const weakest = [...bySubject.entries()]
    .filter(([, s]) => s.reviews >= 5)
    .map(([id, s]) => ({
      subjectId: id,
      subject: subjectName[id] || "—",
      reviews: s.reviews,
      lapseRate: Math.round((s.lapses / s.reviews) * 100) / 100,
    }))
    .sort((a, b) => b.lapseRate - a.lapseRate)
    .slice(0, 3);
  const lapsedCards = Object.values(
    logs
      .filter((l) => l.rating === 1)
      .reduce((acc, l) => {
        acc[l.cardId] = acc[l.cardId] || {
          cardId: l.cardId,
          front: l.card.front.slice(0, 140),
          lapses: 0,
        };
        acc[l.cardId].lapses++;
        return acc;
      }, {})
  )
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 5);

  // Articles and decisions encountered: cited by reviewed cards, new atoms, case attempts; decisions added.
  const articles = new Set();
  for (const l of logs)
    for (const id of parse(l.card.canonicalIds, [])) articles.add(id);
  const atoms = await db().lawNoteAtom.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      articleVersionId: { not: null },
    },
  });
  if (atoms.length) {
    const versions = await db().lawArticleVersion.findMany({
      where: { id: { in: atoms.map((a) => a.articleVersionId) } },
      include: { article: true },
    });
    for (const v of versions) articles.add(v.article.canonicalId);
  }
  for (const a of await db().lawCaseAttempt.findMany({
    where: { submittedAt: { gte: from, lt: to } },
  }))
    for (const p of Object.values(parse(a.phases, {})))
      for (const id of p.citedIds || []) articles.add(id);
  const decisions = (
    await db().lawDecision.findMany({
      where: { createdAt: { gte: from, lt: to } },
    })
  )
    .filter((d) => inWeek(d.createdAt))
    .map((d) => ({
      id: d.id,
      court: d.court,
      decisionNumber: d.decisionNumber,
      verified: d.verified,
    }));

  // Next week's sessions from the timetable.
  const next = addDays(weekStartStr, 7);
  const nextWeek = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(next, i);
    for (const s of await LawTimetable.forDate(date))
      nextWeek.push({
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        subject: s.subject?.name || null,
        placeholder: s.placeholder,
      });
  }

  return {
    weekStart: weekStartStr,
    weekEnd: addDays(weekStartStr, 6),
    minutes: Math.round(days.reduce((s, d) => s + d.retrievalMinutes, 0)),
    goalDays: days.filter((d) => d.goalMet).length,
    reviews: logs.length,
    cardsLearned: days.reduce((s, d) => s + d.newCardsLearned, 0),
    casesSolved:
      (await db().lawCaseAttempt.count({
        where: { submittedAt: { gte: from, lt: to } },
      })) || 0,
    articles: [...articles].sort(),
    decisions,
    weakest,
    lapsedCards,
    inboxPending: await LawInbox.count(),
    nextWeek,
    aiSummary: null,
  };
}

const LawRecap = {
  buildContent,

  /** Create or refresh the recap of the week containing `now` (local). */
  generate: async function (now = new Date(), { aiSummary } = {}) {
    const ws = weekStart(localDate(now));
    const content = await buildContent(ws);
    if (aiSummary) {
      try {
        content.aiSummary = await aiSummary(content);
      } catch (e) {
        console.error("[LAW-OS] recap summary skipped:", e.message);
      }
    }
    const data = { content: JSON.stringify(content), generatedAt: new Date() };
    return db().lawWeeklyRecap.upsert({
      where: { userId_weekStart: { userId: currentUserId(), weekStart: ws } },
      create: { weekStart: ws, ...data },
      update: data,
    });
  },

  latest: async function () {
    const r = await db().lawWeeklyRecap.findFirst({
      orderBy: { weekStart: "desc" },
    });
    return r ? { ...r, content: parse(r.content, {}) } : null;
  },

  byWeek: async function (ws) {
    const r = await db().lawWeeklyRecap.findFirst({
      where: { weekStart: ws },
    });
    return r ? { ...r, content: parse(r.content, {}) } : null;
  },

  markViewed: async function (id) {
    const r = await db().lawWeeklyRecap.updateMany({
      where: { id, viewedAt: null },
      data: { viewedAt: new Date() },
    });
    return r.count;
  },
};

module.exports = { LawRecap };
