const { localDate, weekdayOf, addDays, weekStart, daysBetween, isDateStr } = require("../../../utils/law/time");

describe("local time (Africa/Casablanca)", () => {
  test("day boundary follows the zone offset, not UTC", () => {
    // Fixed-offset zone (Etc/GMT-1 = UTC+1) so the test doesn't depend on Morocco's tz rules, which
    // changed in 2026 (tzdata 2026c). Production always uses Intl with the real zone.
    expect(localDate(new Date("2026-10-12T23:30:00Z"), "Etc/GMT-1")).toBe("2026-10-13");
    expect(localDate(new Date("2026-10-12T22:59:00Z"), "Etc/GMT-1")).toBe("2026-10-12");
    expect(localDate(new Date("2026-10-12T23:30:00Z"), "UTC")).toBe("2026-10-12");
  });

  test("Africa/Casablanca resolves through Intl", () => {
    expect(localDate(new Date("2026-10-12T12:00:00Z"), "Africa/Casablanca")).toBe("2026-10-12");
  });

  test("weekday is ISO (Monday = 1, Sunday = 7)", () => {
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(weekdayOf("2026-10-11")).toBe(7);
  });

  test("date arithmetic crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekStart("2026-10-15")).toBe("2026-10-12");
    expect(daysBetween("2026-10-10", "2026-10-20")).toBe(10);
  });

  test("validates date strings", () => {
    expect(isDateStr("2026-10-10")).toBe(true);
    expect(isDateStr("2026-13-10")).toBe(false);
    expect(isDateStr("10/10/2026")).toBe(false);
  });
});
