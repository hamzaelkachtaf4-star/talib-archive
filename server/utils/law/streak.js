// Streak rules (spec §8.5), as a pure function over study-day history so a late offline sync can simply
// recompute everything:
// - a day counts when its goal is met;
// - every 7 goal days in a row earns one freeze, at most 2 stored;
// - a missed past day auto-consumes a freeze if there is a streak to protect, otherwise the streak resets;
// - today never breaks the streak (the day is not over).
const { addDays, daysBetween } = require("./time");

const MAX_FREEZES = 2;
const EARN_EVERY = 7;

/**
 * @param {{date:string, goalMet:boolean}[]} days
 * @param {string} today YYYY-MM-DD
 */
function computeStreak(days, today) {
  const met = new Map(days.map((d) => [d.date, !!d.goalMet]));
  const result = {
    current: 0,
    longest: 0,
    freezesAvailable: 0,
    freezesEarnedTotal: 0,
    freezeUsedDates: [],
  };
  const dates = days
    .map((d) => d.date)
    .filter((d) => d <= today)
    .sort();
  if (!dates.length) return result;

  let run = 0; // consecutive goal days toward the next freeze
  for (let d = dates[0]; daysBetween(d, today) >= 0; d = addDays(d, 1)) {
    if (met.get(d)) {
      result.current++;
      run++;
      if (run % EARN_EVERY === 0 && result.freezesAvailable < MAX_FREEZES) {
        result.freezesAvailable++;
        result.freezesEarnedTotal++;
      }
      result.longest = Math.max(result.longest, result.current);
    } else if (d === today) {
      // in progress
    } else if (result.current > 0 && result.freezesAvailable > 0) {
      result.freezesAvailable--;
      result.freezeUsedDates.push(d);
    } else {
      result.current = 0;
      run = 0;
    }
  }
  return result;
}

module.exports = { computeStreak, MAX_FREEZES, EARN_EVERY };
