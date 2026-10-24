const { windowByChars, chunkEvery } = require("../../../utils/law/jobs/windows");

describe("windowByChars", () => {
  test("packs consecutive items greedily under the budget and keeps order and global indexes", () => {
    const items = ["a".repeat(500), "b".repeat(500), "c".repeat(500), "d".repeat(500), "e".repeat(200)];
    const w = windowByChars(items, (s) => s, 1100);
    expect(w).toEqual([[0, 1], [2, 3], [4]]);
  });

  test("an item bigger than the budget gets a window of its own and is never dropped", () => {
    const w = windowByChars(["x".repeat(50), "y".repeat(5000), "z".repeat(50)], (s) => s, 1000);
    expect(w).toEqual([[0], [1], [2]]);
  });

  test("empty input and empty texts", () => {
    expect(windowByChars([], (s) => s, 1000)).toEqual([]);
    expect(windowByChars(["", "", ""], (s) => s, 10)).toEqual([[0, 1, 2]]);
  });

  test("rejects a non-positive budget instead of looping or returning one window per char", () => {
    expect(() => windowByChars(["a"], (s) => s, 0)).toThrow();
  });
});

describe("chunkEvery", () => {
  test("splits into runs of n; last run may be shorter", () => {
    expect(chunkEvery([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkEvery([], 3)).toEqual([]);
  });
  test("rejects n < 1", () => {
    expect(() => chunkEvery([1], 0)).toThrow();
  });
});
