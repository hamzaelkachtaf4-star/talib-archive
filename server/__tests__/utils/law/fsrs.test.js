const { replay, previewDue, STATE_NAMES } = require("../../../utils/law/fsrs");

const created = new Date("2026-10-01T08:00:00Z");
const log = (id, rating, iso) => ({ clientReviewId: id, rating, reviewedAt: new Date(iso) });

describe("FSRS replay", () => {
  const logs = [
    log("a1", 3, "2026-10-01T09:00:00Z"),
    log("a2", 3, "2026-10-01T09:10:00Z"),
    log("a3", 1, "2026-10-04T09:00:00Z"),
    log("a4", 4, "2026-10-04T09:02:00Z"),
  ];

  test("is independent of arrival order", () => {
    const a = replay(created, logs).fields;
    const b = replay(created, [...logs].reverse()).fields;
    const c = replay(created, [logs[2], logs[0], logs[3], logs[1]]).fields;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  test("tracks reps, lapses and state", () => {
    const { fields, steps } = replay(created, logs);
    expect(fields.reps).toBe(4);
    expect(fields.lapses).toBeGreaterThanOrEqual(1);
    expect(STATE_NAMES).toContain(fields.state);
    expect(steps.map((s) => s.clientReviewId)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(steps[0].before.state).toBe("new");
  });

  test("ties on reviewedAt are broken by clientReviewId, deterministically", () => {
    const same = "2026-10-02T10:00:00Z";
    const x = replay(created, [log("phone-1", 1, same), log("laptop-1", 4, same)]).fields;
    const y = replay(created, [log("laptop-1", 4, same), log("phone-1", 1, same)]).fields;
    expect(x).toEqual(y);
  });

  test("a device clock behind the previous review never moves time backwards", () => {
    const f = replay(created, [log("b1", 3, "2026-10-05T10:00:00Z"), log("b2", 3, "2026-09-01T10:00:00Z")]).fields;
    expect(new Date(f.lastReview) >= new Date("2026-10-05T10:00:00Z")).toBe(true);
  });

  test("no logs → a fresh new card", () => {
    const f = replay(created, []).fields;
    expect(f.state).toBe("new");
    expect(f.reps).toBe(0);
  });

  test("preview: harder ratings are never due later than easier ones", () => {
    const row = { ...replay(created, logs).fields };
    const p = previewDue(row, new Date("2026-10-10T09:00:00Z"));
    expect(p[1] <= p[2] && p[2] <= p[3] && p[3] <= p[4]).toBe(true);
  });
});
