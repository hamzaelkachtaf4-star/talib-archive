// Qanouni Collab master note helpers: Moroccan outline detection, Law Blame, contributor shares, pins.
const m = require("../../../utils/law/masterNote");

describe("outline", () => {
  test.each([
    ["القسم الأول: الخطأ", "part"],
    ["الفصل الثاني", "chapter"],
    ["المبحث الأول: مفهوم الخطأ", "section"],
    ["المطلب الثاني", "subsection"],
    ["الفقرة الأولى", "paragraph"],
    ["Partie 1 : la faute", "part"],
    ["Chapitre II", "chapter"],
    ["1. المبحث الأول", "section"],
    ["مقدمة", "intro"],
    ["خاتمة", "conclusion"],
    ["المبحثين", "other"], // not a heading keyword, just a word that starts the same way
    ["ملاحظات", "other"],
  ])("%s → %s", (h, kind) => expect(m.kindOf(h)).toBe(kind));

  test("nesting follows heading levels; repeated headings get distinct keys", () => {
    const s = m.parseSections("# المبحث الأول\n## المطلب الأول\nx\n## المطلب الأول\ny\n# المبحث الثاني");
    expect(s.map((x) => x.key)).toEqual(["المبحث الأول", "المطلب الأول", "المطلب الأول#2", "المبحث الثاني"]);
    const o = m.outline(s);
    expect(o).toHaveLength(2);
    expect(o[0].children).toHaveLength(2);
    expect(m.parseSections("")).toEqual([]);
  });
});

describe("Law Blame and contributors", () => {
  test("only changed sections move to the editor; shares add up to 100", () => {
    const v1 = m.parseSections("intro\n# أ\naaa\n# ب\nbbb\n# ج\nccc");
    const a1 = m.blame([], [], v1, 1);
    expect(new Set(a1.map((x) => x.userId))).toEqual(new Set([1]));
    const v2 = m.parseSections("intro\n# أ\naaa\n# ب\nbbb changed\n# ج\nccc\n# د\nnew");
    const a2 = m.blame(v1, a1, v2, 2);
    expect(a2.map((x) => `${x.heading || "_"}:${x.userId}`)).toEqual(["_:1", "أ:1", "ب:2", "ج:1", "د:2"]);
    const c = m.contributors(v2, a2);
    expect(c.reduce((s, x) => s + x.percent, 0)).toBe(100);
    expect(c.map((x) => x.userId).sort()).toEqual([1, 2]);
    // Three-way split rounds to exactly 100.
    const v3 = m.parseSections("# a\nx\n# b\nx\n# c\nx");
    expect(m.contributors(v3, v3.map((s, i) => ({ key: s.key, userId: i + 1 }))).reduce((s, x) => s + x.percent, 0)).toBe(100);
  });
});

describe("pins", () => {
  test("article refs are normalised; bad pins refused; dangling citations found", () => {
    expect(m.cleanPins([{ id: "pin-1", type: "ref", ref: "doc : ٧٧" }]).pins[0].ref).toBe("DOC:77");
    expect(m.cleanPins([{ id: "pin-1", type: "ref", ref: "not an article" }]).error).toBe("invalid article reference");
    expect(m.cleanPins([{ id: "pin-1", type: "document", ref: "" }]).error).toBe("invalid document reference");
    expect(m.cleanPins([{ id: "x", type: "ref", ref: "DOC:1" }]).error).toBe("invalid pin id");
    expect(m.cleanPins([{ id: "pin-1", type: "document", ref: "a" }, { id: "pin-1", type: "document", ref: "b" }]).error).toBe("invalid pin id");
    expect(m.cleanPins([{ id: "pin-1", type: "file", ref: "a" }]).error).toBe("invalid pin type");
    expect(m.cleanPins(Array.from({ length: 51 }, (_, i) => ({ id: `pin-${i}`, type: "document", ref: "a" }))).error).toBe("invalid pins");
    expect(m.danglingPins("a [^pin-1] b [^pin-2] [^pin-2]", [{ id: "pin-1" }])).toEqual(["pin-2"]);
  });
});
