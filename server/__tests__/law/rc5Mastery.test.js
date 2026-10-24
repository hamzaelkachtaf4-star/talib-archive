// RC5: calm academic mastery states replace XP / crowns vocabulary in the UI.
const { loadEsm } = require("../../utils/law/testing/renderJsx");
const load = () => loadEsm('export * from "@/components/LawOS/lib/mastery";');

describe("masteryState", () => {
  test("due cards win over everything: «يستحق المراجعة اليوم»", async () => {
    const { masteryState } = await load();
    expect(masteryState({ crowns: 3, dueCount: 2 })).toBe("due_today");
    expect(masteryState({ crowns: 0, dueCount: 1 })).toBe("due_today");
  });
  test("three crowns and nothing due is mastered; anything else is in review", async () => {
    const { masteryState } = await load();
    expect(masteryState({ crowns: 3, dueCount: 0 })).toBe("mastered");
    expect(masteryState({ crowns: 2, dueCount: 0 })).toBe("in_review");
    expect(masteryState({ crowns: 0, dueCount: 0 })).toBe("in_review");
  });
  test("null, empty and malformed input degrade to in_review, never throw", async () => {
    const { masteryState } = await load();
    for (const v of [null, undefined, {}, { crowns: "x", dueCount: NaN }, { crowns: -1, dueCount: -4 }, { crowns: 99 }]) {
      expect(() => masteryState(v)).not.toThrow();
    }
    expect(masteryState(null)).toBe("in_review");
    expect(masteryState({ crowns: "x", dueCount: NaN })).toBe("in_review");
    expect(masteryState({ crowns: -1, dueCount: -4 })).toBe("in_review");
    expect(masteryState({ crowns: 99, dueCount: 0 })).toBe("mastered");
  });
  test("labels are the three dignified Arabic states", async () => {
    const { MASTERY_LABELS } = await load();
    expect(MASTERY_LABELS.mastered).toBe("مُتقن");
    expect(MASTERY_LABELS.due_today).toBe("يستحق المراجعة اليوم");
    expect(MASTERY_LABELS.in_review).toBe("قيد المراجعة");
  });
});
