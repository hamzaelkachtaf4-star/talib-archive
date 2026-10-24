// Learner Brain lifecycle (spec Phase 10.3), pure functions: no database, easy to test.
// Evidence is either NEGATIVE (a sign of confusion: QUIZ_DISTRACTOR 1.0, FSRS_LAPSE 0.5, CHAT 0.4, DIAGNOSTIC 0.5: a missed
// course-gap diagnostic question, so one miss only suspects and a second confirms) or a correct
// targeted drill (DRILL_CORRECT, weight 0). strength = clamp(sum(weight * 0.5^(ageDays/30)), 0, 1).
const { localDate } = require("../time");

const HALF_LIFE_DAYS = 30;
const ACTIVE_AT = 0.6;
const FADE_BELOW = 0.1; // a confirmed weakness with no new evidence for months fades to RESOLVED
const DISMISS_COOLDOWN_DAYS = 60;
const NEGATIVE = new Set(["QUIZ_DISTRACTOR", "FSRS_LAPSE", "CHAT", "EXERCISE", "DIAGNOSTIC"]);
const WEIGHTS = { QUIZ_DISTRACTOR: 1.0, FSRS_LAPSE: 0.5, CHAT: 0.4, EXERCISE: 0.6, DIAGNOSTIC: 0.5 };
const STATUSES = ["SUSPECTED", "ACTIVE", "IMPROVING", "RESOLVED", "DISMISSED"];
const DAY = 86400000;

const decay = (ageMs) => Math.pow(0.5, Math.max(0, ageMs) / DAY / HALF_LIFE_DAYS);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function strengthOf(evidence, now) {
  const sum = evidence.filter((e) => NEGATIVE.has(e.source)).reduce((s, e) => s + e.weight * decay(now - new Date(e.createdAt)), 0);
  return clamp(sum, 0, 1);
}

/**
 * @param {{status?:string, dismissedAt?:Date|null}} memory  current state (status drives "was it ever confirmed")
 * @param {{source:string, weight:number, createdAt:Date, refId?:string}[]} evidence
 * @returns {{status:string, strength:number}}
 */
function evaluate(memory, evidence, now = new Date()) {
  const strength = strengthOf(evidence, now);
  if (memory.dismissedAt && now - new Date(memory.dismissedAt) < DISMISS_COOLDOWN_DAYS * DAY) return { status: "DISMISSED", strength };
  // evidence recorded while dismissed (or before it) must not re-suspect inside the cooldown; afterwards only newer evidence counts
  const since = memory.dismissedAt ? new Date(memory.dismissedAt) : null;
  const ev = since ? evidence.filter((e) => new Date(e.createdAt) > since) : evidence;
  const neg = ev.filter((e) => NEGATIVE.has(e.source));
  const str = since ? strengthOf(ev, now) : strength;
  const hasNonChat = neg.some((e) => e.source !== "CHAT");
  const chatDays = new Set(neg.filter((e) => e.source === "CHAT").map((e) => localDate(new Date(e.createdAt)))).size;
  const wasConfirmed = ["ACTIVE", "IMPROVING", "RESOLVED"].includes(memory.status);
  // A resolved weakness is reopened by real evidence (a quiz / review lapse) or by chat signals on 3 different days,
  // never by a single chat message (the same rule that confirms a new chat-only memory).
  if (memory.status === "RESOLVED") {
    const lastDrill = ev.filter((e) => e.source === "DRILL_CORRECT").reduce((t, e) => Math.max(t, +new Date(e.createdAt)), 0);
    const since2 = neg.filter((e) => +new Date(e.createdAt) > lastDrill);
    const reopen = since2.some((e) => e.source !== "CHAT") || new Set(since2.map((e) => localDate(new Date(e.createdAt)))).size >= 3;
    if (!reopen) return { status: "RESOLVED", strength: str };
  }
  const confirmed = wasConfirmed || ((hasNonChat || chatDays >= 3) && str >= ACTIVE_AT);
  if (!confirmed) return { status: "SUSPECTED", strength: str };

  const lastNeg = neg.reduce((t, e) => Math.max(t, +new Date(e.createdAt)), 0);
  // correct targeted drills since the last sign of confusion; unreviewed AI items ("ai:" refs) cannot resolve a weakness
  const drills = ev.filter((e) => e.source === "DRILL_CORRECT" && +new Date(e.createdAt) > lastNeg);
  const reviewed = drills.filter((e) => !String(e.refId || "").startsWith("ai:"));
  const days = new Set(reviewed.map((e) => localDate(new Date(e.createdAt)))).size;
  let status = "ACTIVE";
  if (reviewed.length >= 3 && days >= 2) status = "RESOLVED";
  else if (drills.length >= 2) status = "IMPROVING";
  else if (str < FADE_BELOW) status = "RESOLVED";
  return { status, strength: str };
}

module.exports = { evaluate, strengthOf, decay, WEIGHTS, NEGATIVE, STATUSES, HALF_LIFE_DAYS, ACTIVE_AT, DISMISS_COOLDOWN_DAYS };
