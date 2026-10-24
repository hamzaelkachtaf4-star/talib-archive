const { evaluate, strengthOf, decay, WEIGHTS } = require("../../../utils/law/brain/memory");

const NOW = new Date("2026-10-12T12:00:00Z");
const ago = (d, h = 0) => new Date(NOW - d * 86400000 - h * 3600000);
const ev = (source, daysAgo, over = {}) => ({ source, weight: source === "DRILL_CORRECT" ? 0 : WEIGHTS[source], createdAt: ago(daysAgo), refId: "x", ...over });

describe("decay and strength", () => {
  test("30-day half-life", () => {
    expect(decay(0)).toBe(1);
    expect(decay(30 * 86400000)).toBeCloseTo(0.5, 6);
    expect(decay(60 * 86400000)).toBeCloseTo(0.25, 6);
    expect(decay(-5)).toBe(1);
    expect(strengthOf([ev("QUIZ_DISTRACTOR", 0)], NOW)).toBe(1);
    expect(strengthOf([ev("QUIZ_DISTRACTOR", 30)], NOW)).toBeCloseTo(0.5, 6);
    expect(strengthOf([ev("CHAT", 0), ev("CHAT", 0), ev("QUIZ_DISTRACTOR", 0), ev("QUIZ_DISTRACTOR", 0)], NOW)).toBe(1); // clamped
    expect(strengthOf([], NOW)).toBe(0);
    expect(strengthOf([ev("DRILL_CORRECT", 0)], NOW)).toBe(0); // correct drills are not confusion
  });
});

describe("lifecycle", () => {
  test("below 0.6 stays SUSPECTED; a quiz distractor alone makes it ACTIVE", () => {
    expect(evaluate({}, [ev("FSRS_LAPSE", 0)], NOW)).toMatchObject({ status: "SUSPECTED", strength: 0.5 });
    expect(evaluate({}, [ev("FSRS_LAPSE", 0), ev("FSRS_LAPSE", 0)], NOW).status).toBe("ACTIVE");
    expect(evaluate({}, [ev("QUIZ_DISTRACTOR", 1)], NOW).status).toBe("ACTIVE");
  });

  test("chat-only evidence stays SUSPECTED until 3 different days, or any non-chat evidence", () => {
    const chats = [ev("CHAT", 0), ev("CHAT", 0), ev("CHAT", 0), ev("CHAT", 0)]; // strength 1.0 but all today
    expect(evaluate({}, chats, NOW).status).toBe("SUSPECTED");
    expect(evaluate({}, [ev("CHAT", 0), ev("CHAT", 1), ev("CHAT", 2), ev("CHAT", 2)], NOW).status).toBe("ACTIVE");
    expect(evaluate({}, [...chats, ev("FSRS_LAPSE", 0)], NOW).status).toBe("ACTIVE");
  });

  test("2 correct drills => IMPROVING; 3 correct on >= 2 days => RESOLVED; same-day drills do not resolve", () => {
    const base = [ev("QUIZ_DISTRACTOR", 10)];
    expect(evaluate({}, [...base, ev("DRILL_CORRECT", 2)], NOW).status).toBe("ACTIVE");
    expect(evaluate({}, [...base, ev("DRILL_CORRECT", 3), ev("DRILL_CORRECT", 2)], NOW).status).toBe("IMPROVING");
    expect(evaluate({}, [...base, ev("DRILL_CORRECT", 3), ev("DRILL_CORRECT", 2), ev("DRILL_CORRECT", 1)], NOW).status).toBe("RESOLVED");
    const sameDay = [ev("DRILL_CORRECT", 1, { createdAt: ago(1, 0) }), ev("DRILL_CORRECT", 1, { createdAt: ago(1, 1) }), ev("DRILL_CORRECT", 1, { createdAt: ago(1, 2) })];
    expect(evaluate({}, [...base, ...sameDay], NOW).status).toBe("IMPROVING");
  });

  test("a wrong answer between correct drills resets the streak; reappearance sends RESOLVED back to ACTIVE", () => {
    const resolved = [ev("QUIZ_DISTRACTOR", 10), ev("DRILL_CORRECT", 4), ev("DRILL_CORRECT", 3), ev("DRILL_CORRECT", 2)];
    expect(evaluate({ status: "ACTIVE" }, resolved, NOW).status).toBe("RESOLVED");
    expect(evaluate({ status: "RESOLVED" }, [...resolved, ev("QUIZ_DISTRACTOR", 1)], NOW).status).toBe("ACTIVE");
    expect(evaluate({ status: "RESOLVED" }, [...resolved, ev("CHAT", 0)], NOW).status).toBe("RESOLVED"); // one chat message is not enough
    const early = [ev("QUIZ_DISTRACTOR", 12), ev("DRILL_CORRECT", 6), ev("DRILL_CORRECT", 5), ev("DRILL_CORRECT", 4)];
    expect(evaluate({ status: "RESOLVED" }, [...early, ev("CHAT", 0), ev("CHAT", 1), ev("CHAT", 2)], NOW).status).toBe("ACTIVE"); // chat on 3 different days
    expect(evaluate({ status: "RESOLVED" }, [...resolved, ev("FSRS_LAPSE", 0)], NOW).status).toBe("ACTIVE");
    const broken = [ev("QUIZ_DISTRACTOR", 10), ev("DRILL_CORRECT", 5), ev("DRILL_CORRECT", 4), ev("QUIZ_DISTRACTOR", 3), ev("DRILL_CORRECT", 2)];
    expect(evaluate({ status: "IMPROVING" }, broken, NOW).status).toBe("ACTIVE");
  });

  test("unreviewed AI drill items can improve but never resolve", () => {
    const ai = (d) => ev("DRILL_CORRECT", d, { refId: "ai:abc" });
    expect(evaluate({}, [ev("QUIZ_DISTRACTOR", 10), ai(4), ai(3), ai(2), ai(1)], NOW).status).toBe("IMPROVING");
  });

  test("a confirmed weakness that fades (no evidence for ~4 months) becomes RESOLVED; a confirmed one stays confirmed as it decays", () => {
    expect(evaluate({ status: "ACTIVE" }, [ev("QUIZ_DISTRACTOR", 100)], NOW).status).toBe("RESOLVED");
    expect(evaluate({ status: "ACTIVE" }, [ev("QUIZ_DISTRACTOR", 40)], NOW).status).toBe("ACTIVE"); // 0.4 < 0.6 but already confirmed
  });

  test("DISMISSED: 60-day cooldown for every signal; afterwards only NEWER evidence counts", () => {
    const old = [ev("QUIZ_DISTRACTOR", 80), ev("QUIZ_DISTRACTOR", 79)];
    expect(evaluate({ status: "ACTIVE", dismissedAt: ago(10) }, [...old, ev("CHAT", 1)], NOW).status).toBe("DISMISSED");
    // cooldown over: the pre-dismissal evidence is ignored, so it does not instantly come back
    expect(evaluate({ status: "DISMISSED", dismissedAt: ago(61) }, old, NOW)).toMatchObject({ status: "SUSPECTED", strength: 0 });
    // fresh, strong, non-chat evidence after the cooldown reopens it
    expect(evaluate({ status: "DISMISSED", dismissedAt: ago(61) }, [...old, ev("QUIZ_DISTRACTOR", 1)], NOW).status).toBe("ACTIVE");
    // weak fresh evidence only suspects
    expect(evaluate({ status: "DISMISSED", dismissedAt: ago(61) }, [...old, ev("CHAT", 1)], NOW).status).toBe("SUSPECTED");
  });
});

describe("DIAGNOSTIC evidence (course-gap diagnostics)", () => {
  test("one missed diagnostic question only suspects; a second confirms", () => {
    const one = evaluate({ status: "SUSPECTED" }, [ev("DIAGNOSTIC", 0)], NOW);
    expect(one.status).toBe("SUSPECTED");
    expect(one.strength).toBeCloseTo(0.5, 2);
    const two = evaluate({ status: "SUSPECTED" }, [ev("DIAGNOSTIC", 0), ev("DIAGNOSTIC", 1)], NOW);
    expect(two.status).toBe("ACTIVE");
  });

  test("it fades like any other evidence", () => {
    expect(evaluate({ status: "ACTIVE" }, [ev("DIAGNOSTIC", 120)], NOW).status).toBe("RESOLVED");
  });
});
