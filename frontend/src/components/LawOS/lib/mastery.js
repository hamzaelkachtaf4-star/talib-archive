// Academic mastery states shown to students instead of XP / crowns. Pure: "due" is decided by the server per
// Africa/Casablanca day (dueCount), so no clock or time-zone math lives here.
export const MASTERY_LABELS = Object.freeze({
  mastered: "مُتقن",
  in_review: "قيد المراجعة",
  due_today: "يستحق المراجعة اليوم",
});

const count = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** @param {{crowns?: number, dueCount?: number}|null|undefined} m @returns {"mastered"|"in_review"|"due_today"} */
export function masteryState(m) {
  if (count(m?.dueCount) > 0) return "due_today";
  return count(m?.crowns) >= 3 ? "mastered" : "in_review";
}
