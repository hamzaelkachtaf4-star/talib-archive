const { computeStreak } = require("../../../utils/law/streak");
const { addDays } = require("../../../utils/law/time");

/** pattern: string of "x" (goal met) / "." (missed), first char = start date */
function days(start, pattern) {
  return [...pattern].map((c, i) => ({ date: addDays(start, i), goalMet: c === "x" }));
}

describe("streak", () => {
  test("counts consecutive goal days", () => {
    const s = computeStreak(days("2026-10-01", "xxx"), "2026-10-03");
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  test("today in progress does not break the streak", () => {
    const s = computeStreak(days("2026-10-01", "xx."), "2026-10-03");
    expect(s.current).toBe(2);
  });

  test("a missed day without freezes resets", () => {
    const s = computeStreak(days("2026-10-01", "xx.x"), "2026-10-04");
    expect(s.current).toBe(1);
    expect(s.longest).toBe(2);
  });

  test("7 goal days earn a freeze that a missed day consumes automatically", () => {
    const s = computeStreak(days("2026-10-01", "xxxxxxx.x"), "2026-10-09");
    expect(s.freezesEarnedTotal).toBe(1);
    expect(s.freezeUsedDates).toEqual(["2026-10-08"]);
    expect(s.freezesAvailable).toBe(0);
    expect(s.current).toBe(8);
  });

  test("days with no row at all count as missed", () => {
    const d = [...days("2026-10-01", "xxxxxxx"), { date: "2026-10-10", goalMet: true }];
    // 08 and 09 missing: one freeze covers 08, 09 resets.
    const s = computeStreak(d, "2026-10-10");
    expect(s.freezeUsedDates).toEqual(["2026-10-08"]);
    expect(s.current).toBe(1);
  });

  test("at most 2 freezes are stored", () => {
    const s = computeStreak(days("2026-10-01", "x".repeat(28)), "2026-10-28");
    expect(s.freezesAvailable).toBe(2);
    expect(s.freezesEarnedTotal).toBe(2);
  });

  test("no freeze is spent when there is no streak to protect", () => {
    const s = computeStreak(days("2026-10-01", "xxxxxxx..."), "2026-10-11");
    // 08 uses the freeze, 09 resets, 10 has nothing to protect.
    expect(s.freezeUsedDates).toEqual(["2026-10-08"]);
    expect(s.current).toBe(0);
  });

  test("empty history", () => {
    expect(computeStreak([], "2026-10-10").current).toBe(0);
  });
});
