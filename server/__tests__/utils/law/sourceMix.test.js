const { allocate, parseMix, pickMixed } = require("../../../utils/law/moduleMaterial");

describe("source mix", () => {
  test("allocate: slots follow the shares, never exceed what exists, and give a category with a share at least one slot", () => {
    expect(allocate(8, { lectures: 50, printed: 25, research: 0, legal: 25 }, { lectures: 20, printed: 20, legal: 20 })).toEqual({ lectures: 4, printed: 2, legal: 2 });
    expect(allocate(8, { lectures: 50, printed: 25, research: 0, legal: 25 }, { lectures: 20, printed: 1, legal: 0 })).toEqual({ lectures: 7, printed: 1 }); // legal has no pieces: its share moves on
    expect(allocate(3, { lectures: 90, printed: 5, research: 0, legal: 5 }, { lectures: 9, printed: 9, legal: 9 })).toEqual({ lectures: 1, printed: 1, legal: 1 });
    expect(allocate(5, { lectures: 0, printed: 0, research: 100, legal: 0 }, { lectures: 9 })).toEqual({}); // research has no pieces of its own
    expect(allocate(0, { lectures: 100, printed: 0, research: 0, legal: 0 }, { lectures: 9 })).toEqual({ lectures: 0 });
    const out = allocate(14, { lectures: 35, printed: 35, research: 0, legal: 30 }, { lectures: 30, printed: 30, legal: 30 });
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(14);
  });

  test("parseMix accepts only a complete non-negative integer mix", () => {
    expect(parseMix('{"lectures":50,"printed":50,"research":0,"legal":0}')).toEqual({ lectures: 50, printed: 50, research: 0, legal: 0 });
    for (const bad of [null, "", "x", '{"lectures":50}', '{"lectures":-5,"printed":50,"research":0,"legal":0}', '{"lectures":"5","printed":50,"research":0,"legal":0}', []]) expect(parseMix(bad)).toBeNull();
  });

  test("pickMixed leaves out a category at 0% and keeps the rest; without a mix it behaves like plain sampling", () => {
    const mk = (cat, n) => Array.from({ length: n }, (_, i) => ({ ref: `${cat}:${i}`, label: cat, text: `نص ${cat} ${i}`, cat }));
    const pieces = [...mk("lectures", 6), ...mk("printed", 6), ...mk("legal", 6)];
    const rng = () => 0.1;
    const mixed = pickMixed(pieces, { lectures: 50, printed: 0, research: 0, legal: 50 }, "", 6, { rng });
    expect(mixed).toHaveLength(6);
    expect(mixed.every((p) => p.cat !== "printed")).toBe(true);
    expect(mixed.filter((p) => p.cat === "legal")).toHaveLength(3);
    expect(pickMixed(pieces, null, "", 4, { rng })).toHaveLength(4);
    expect(pickMixed(pieces, { lectures: 100, printed: 0, research: 0, legal: 0 }, "", 4, { rng }).every((p) => p.cat === "lectures")).toBe(true);
  });
});
