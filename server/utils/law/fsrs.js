// FSRS scheduling (spec §8.1) on top of ts-fsrs. Card state is never trusted from a client: it is the
// deterministic replay of the card's review log, ordered by (reviewedAt, clientReviewId). That is what
// makes offline replay, duplicates and phone+laptop reviews converge (spec §6.2, §11 Phase 1).
// Fuzz is disabled so the client preview and the server replay agree exactly.
// Keep in sync with frontend/src/components/LawOS/lib/fsrs.js.
const {
  fsrs,
  generatorParameters,
  createEmptyCard,
  State,
} = require("ts-fsrs");

const STATE_NAMES = ["new", "learning", "review", "relearning"];
const GRADES = [1, 2, 3, 4]; // Again, Hard, Good, Easy

function scheduler(retention = 0.9) {
  return fsrs(
    generatorParameters({
      request_retention: retention,
      enable_fuzz: false,
      enable_short_term: true,
    })
  );
}

/** DB row → ts-fsrs Card */
function toFsrsCard(row) {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: Math.max(0, STATE_NAMES.indexOf(row.state)),
    last_review: row.lastReview ? new Date(row.lastReview) : undefined,
  };
}

/** ts-fsrs Card → DB fields */
function fromFsrsCard(card) {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAMES[card.state] ?? "new",
    lastReview: card.last_review ?? null,
  };
}

function orderLogs(logs) {
  return [...logs].sort(
    (a, b) =>
      new Date(a.reviewedAt) - new Date(b.reviewedAt) ||
      String(a.clientReviewId).localeCompare(String(b.clientReviewId))
  );
}

/**
 * Rebuilds a card's FSRS state from scratch.
 * @param {Date|string} createdAt card creation time
 * @param {{rating:number, reviewedAt:Date|string, clientReviewId:string}[]} logs
 * @returns {{fields: object, steps: {clientReviewId:string, before:object}[]}}
 */
function replay(createdAt, logs, retention = 0.9) {
  const f = scheduler(retention);
  let card = createEmptyCard(new Date(createdAt));
  const steps = [];
  for (const log of orderLogs(logs)) {
    if (!GRADES.includes(log.rating)) continue;
    // A device clock behind the server can produce a review "before" the previous one; never go back in time.
    const floor = card.last_review ?? new Date(createdAt);
    const at = new Date(
      Math.max(new Date(log.reviewedAt).getTime(), new Date(floor).getTime())
    );
    steps.push({
      clientReviewId: log.clientReviewId,
      before: fromFsrsCard(card),
    });
    card = f.next(card, at, log.rating).card;
  }
  return { fields: fromFsrsCard(card), steps };
}

/** Next due date for each grade, used under the rating buttons. */
function previewDue(row, now = new Date(), retention = 0.9) {
  const preview = scheduler(retention).repeat(toFsrsCard(row), now);
  const out = {};
  for (const g of GRADES) out[g] = preview[g].card.due;
  return out;
}

module.exports = {
  STATE_NAMES,
  GRADES,
  State,
  scheduler,
  toFsrsCard,
  fromFsrsCard,
  orderLogs,
  replay,
  previewDue,
};
