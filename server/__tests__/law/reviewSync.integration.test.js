// Phase 1 acceptance (spec §11), on a real SQLite DB built from the Prisma schema:
// - 50 offline reviews sync with no duplicates, even when the batch is replayed;
// - phone + laptop reviews of the same card on the same day converge to one state, in any arrival order;
// - streak freezes behave as specified when history arrives late.
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { LawReview } = require("../../models/lawReview");
const { LawFlashcard } = require("../../models/lawFlashcard");
const { LawSubject } = require("../../models/lawSubject");
const { LawTimetable } = require("../../models/lawTimetable");
const { localDate, addDays } = require("../../utils/law/time");

jest.setTimeout(60000);

let tmp;
beforeEach(async () => {
  tmp = await createTempDb();
});
afterEach(async () => {
  await tmp.cleanup();
});

const NOW = new Date();
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
let seq = 0;
const rid = (prefix) => `${prefix}-${String(++seq).padStart(6, "0")}-xxxx`;

async function subjectWithCards(n, createdAt = new Date(NOW.getTime() - 30 * 86400000)) {
  const { subject } = await LawSubject.create({ name: "القانون المدني" });
  const cards = [];
  for (let i = 0; i < n; i++)
    cards.push(
      await db().lawFlashcard.create({
        data: { subjectId: subject.id, origin: "definition", front: `س ${i}`, back: `ج ${i}`, createdAt },
      })
    );
  return { subject, cards };
}

const fsrsFields = (c) => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  scheduledDays: c.scheduledDays,
  learningSteps: c.learningSteps,
  lastReview: c.lastReview?.toISOString() ?? null,
});

describe("review sync", () => {
  test("50 offline reviews: one batch, replayed twice, no duplicates", async () => {
    const { cards } = await subjectWithCards(50);
    const logs = cards.map((c, i) => ({
      clientReviewId: rid("phone"),
      cardId: c.id,
      rating: (i % 4) + 1,
      reviewedAt: minutesAgo(120 - i),
      durationMs: 8000,
    }));

    const first = await LawReview.submitBatch(logs, { now: NOW });
    expect(first.accepted).toHaveLength(50);
    expect(first.duplicates).toHaveLength(0);
    expect(first.rejected).toHaveLength(0);
    const statesAfterFirst = (await db().lawFlashcard.findMany({ orderBy: { id: "asc" } })).map(fsrsFields);

    // The phone lost the ack and replays everything, plus a partial overlap.
    const second = await LawReview.submitBatch([...logs, ...logs.slice(0, 10)], { now: NOW });
    expect(second.accepted).toHaveLength(0);
    expect(second.duplicates).toHaveLength(60);

    expect(await db().lawReviewLog.count()).toBe(50);
    const statesAfterSecond = (await db().lawFlashcard.findMany({ orderBy: { id: "asc" } })).map(fsrsFields);
    expect(statesAfterSecond).toEqual(statesAfterFirst);

    const day = await db().lawStudyDay.findUnique({ where: { date: localDate(NOW) } });
    const dayOf = (iso) => localDate(new Date(iso));
    const expectedToday = logs.filter((l) => dayOf(l.reviewedAt) === localDate(NOW)).length;
    expect(day?.reviewsDone ?? 0).toBe(expectedToday);
  });

  test("phone + laptop on the same card, same day: same state in any arrival order", async () => {
    const createdAt = new Date(NOW.getTime() - 10 * 86400000);
    const phone = [
      { rating: 3, reviewedAt: minutesAgo(300) },
      { rating: 1, reviewedAt: minutesAgo(200) },
    ];
    const laptop = [
      { rating: 3, reviewedAt: minutesAgo(250) },
      { rating: 4, reviewedAt: minutesAgo(100) },
    ];
    const ids = { phone: phone.map(() => rid("phone")), laptop: laptop.map(() => rid("laptop")) };

    async function run(order) {
      const { cards } = await subjectWithCards(1, createdAt);
      const mk = (who, list) =>
        list.map((l, i) => ({ ...l, clientReviewId: `${ids[who][i]}-${cards[0].id}`, cardId: cards[0].id }));
      const batches = { phone: mk("phone", phone), laptop: mk("laptop", laptop) };
      for (const who of order) await LawReview.submitBatch(batches[who], { now: NOW });
      return fsrsFields(await db().lawFlashcard.findUnique({ where: { id: cards[0].id } }));
    }

    const a = await run(["phone", "laptop"]);
    const b = await run(["laptop", "phone"]);
    expect(b).toEqual(a);
    expect(a.reps).toBe(4);
  });

  test("a new card reviewed offline on two devices counts as one new card learned", async () => {
    const { cards } = await subjectWithCards(1, new Date(NOW.getTime() - 86400000));
    const c = cards[0].id;
    await LawReview.submitBatch(
      [{ clientReviewId: rid("phone"), cardId: c, rating: 3, reviewedAt: minutesAgo(30), stateBefore: { state: "new" } }],
      { now: NOW }
    );
    await LawReview.submitBatch(
      [{ clientReviewId: rid("laptop"), cardId: c, rating: 3, reviewedAt: minutesAgo(20), stateBefore: { state: "new" } }],
      { now: NOW }
    );
    const days = await db().lawStudyDay.findMany();
    expect(days.reduce((s, d) => s + d.newCardsLearned, 0)).toBe(1);
  });

  test("late history: 7 goal days, a gap, then a goal day → the freeze is consumed", async () => {
    const { cards } = await subjectWithCards(30, new Date(NOW.getTime() - 40 * 86400000));
    const today = localDate(NOW);
    const logs = [];
    // Days -9..-3 meet the 20-minute goal (20 reviews × 60 s), day -2 is missed, day -1 meets it.
    for (const offset of [-9, -8, -7, -6, -5, -4, -3, -1]) {
      const noon = new Date(`${addDays(today, offset)}T12:00:00Z`);
      for (let i = 0; i < 20; i++)
        logs.push({
          clientReviewId: rid(`d${offset}`),
          cardId: cards[i].id,
          rating: 3,
          reviewedAt: new Date(noon.getTime() + i * 60000).toISOString(),
          durationMs: 60000,
        });
    }
    const res = await LawReview.submitBatch(logs, { now: NOW });
    expect(res.accepted).toHaveLength(160);
    expect(res.streak.freezesEarnedTotal).toBe(1);
    expect(res.streak.freezesAvailable).toBe(0);
    expect(res.streak.current).toBe(8);
    const frozen = await db().lawStudyDay.findUnique({ where: { date: addDays(today, -2) } });
    expect(frozen.freezeUsed).toBe(true);
  });

  test("rejects invalid logs and unknown cards without failing the batch", async () => {
    const { cards } = await subjectWithCards(1);
    const res = await LawReview.submitBatch(
      [
        { clientReviewId: rid("ok"), cardId: cards[0].id, rating: 3, reviewedAt: minutesAgo(5) },
        { clientReviewId: rid("bad"), cardId: cards[0].id, rating: 9, reviewedAt: minutesAgo(5) },
        { clientReviewId: rid("ghost"), cardId: "nope", rating: 3, reviewedAt: minutesAgo(5) },
        { clientReviewId: rid("future"), cardId: cards[0].id, rating: 3, reviewedAt: new Date(NOW.getTime() + 3 * 86400000).toISOString() },
      ],
      { now: NOW }
    );
    expect(res.accepted).toHaveLength(1);
    expect(res.rejected.map((r) => r.reason)).toEqual(["invalid rating", "unknown card", "reviewedAt in the future"]);
  });
});

describe("due queue and timetable", () => {
  test("new cards are capped per day and subjects are interleaved", async () => {
    const a = await subjectWithCards(20);
    const b = await subjectWithCards(20);
    const { cards, newCount } = await LawFlashcard.dueQueue({ now: NOW });
    expect(newCount).toBe(15); // NEW_CARDS_PER_DAY default
    expect(cards[0].subjectId).not.toBe(cards[1].subjectId);
    expect(cards.every((c) => c.nextDue && c.nextDue[1])).toBe(true);
    expect([a.subject.id, b.subject.id]).toContain(cards[0].subjectId);
  });

  test("a student's timetable starts empty: no sessions are invented for them", async () => {
    expect(await LawTimetable.list()).toHaveLength(0);
    expect(await LawTimetable.list()).toHaveLength(0); // listing never seeds anything
  });

  test("assigning a subject to a slot clears the placeholder flag", async () => {
    const { subject } = await LawSubject.create({ name: "المسطرة المدنية" });
    const first = (await LawTimetable.replace([{ weekday: 1, startTime: "08:30", endTime: "10:00", placeholder: true }])).slots[0];
    const { slots, error } = await LawTimetable.replace([
      { id: first.id, weekday: 1, startTime: "09:00", endTime: "10:30", subjectId: subject.id, placeholder: true },
    ]);
    expect(error).toBeNull();
    expect(slots).toHaveLength(1);
    expect(slots[0].placeholder).toBe(false);
    expect(slots[0].id).toBe(first.id);
  });

  test("lockdown turns on within N days of the exam", async () => {
    const soon = new Date(NOW.getTime() + 5 * 86400000);
    const late = new Date(NOW.getTime() + 30 * 86400000);
    await LawSubject.create({ name: "أ", examDate: soon.toISOString() });
    await LawSubject.create({ name: "ب", examDate: late.toISOString() });
    const list = await LawSubject.list({ now: NOW });
    expect(list.find((s) => s.name === "أ").lockdown).toBe(true);
    expect(list.find((s) => s.name === "ب").lockdown).toBe(false);
  });
});
