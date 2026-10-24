// Client-side FSRS preview: lets review continue offline (learning-step re-queue, intervals under the
// buttons). The server's replay of the log is authoritative and replaces these values on sync.
// Keep in sync with server/utils/law/fsrs.js (same parameters: fuzz off, short-term on).
import { fsrs, generatorParameters } from "ts-fsrs";
import { tr } from "@/components/LawOS/lib/i18n";

export const STATE_NAMES = ["new", "learning", "review", "relearning"];
export const GRADES = [1, 2, 3, 4];

const schedulers = new Map();
function scheduler(retention = 0.9) {
  if (!schedulers.has(retention))
    schedulers.set(
      retention,
      fsrs(
        generatorParameters({
          request_retention: retention,
          enable_fuzz: false,
          enable_short_term: true,
        })
      )
    );
  return schedulers.get(retention);
}

function toFsrsCard(c) {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsedDays,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: Math.max(0, STATE_NAMES.indexOf(c.state)),
    last_review: c.lastReview ? new Date(c.lastReview) : undefined,
  };
}

function fromFsrsCard(card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAMES[card.state] ?? "new",
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Due date for each grade from `now`. */
export function previewDue(card, now = new Date(), retention = 0.9) {
  const preview = scheduler(retention).repeat(toFsrsCard(card), now);
  return Object.fromEntries(GRADES.map((g) => [g, preview[g].card.due]));
}

/** Card after rating locally (preview until the server replays the log). */
export function rateLocally(card, grade, now = new Date(), retention = 0.9) {
  const next = scheduler(retention).next(toFsrsCard(card), now, grade).card;
  return { ...card, ...fromFsrsCard(next) };
}

/** Short Arabic interval label: "1 د", "10 د", "3 س", "4 ي", "2 ش", "1.5 سنة". */
export function intervalLabel(due, now = new Date()) {
  const min = Math.max(1, Math.round((new Date(due) - now) / 60000));
  if (min < 60) return tr("{0} د", [min]);
  const h = Math.round(min / 60);
  if (h < 24) return tr("{0} س", [h]);
  const d = Math.round(h / 24);
  if (d < 31) return tr("{0} ي", [d]);
  const mo = Math.round(d / 30);
  if (mo < 12) return tr("{0} ش", [mo]);
  return tr("{0} سنة", [Math.round((d / 365) * 10) / 10]);
}
