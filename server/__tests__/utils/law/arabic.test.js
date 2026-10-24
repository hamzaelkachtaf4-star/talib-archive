const { normalize, lightStem, normalizeCanonicalId } = require("../../../utils/law/arabic");
const { parseArticles } = require("../../../utils/law/corpusParser");

describe("normalize (spec §6.4)", () => {
  test("removes tashkeel and tatweel", () => {
    expect(normalize("الفَصْلُ")).toBe("الفصل");
    expect(normalize("العقـــد")).toBe("العقد");
  });
  test("unifies alef forms, final ى and ة", () => {
    expect(normalize("أإآٱ")).toBe("اااا");
    expect(normalize("مستشفى")).toBe("مستشفي");
    expect(normalize("المسؤولية")).toBe("المسؤوليه");
  });
  test("Arabic-Indic and Persian digits → Western", () => {
    expect(normalize("الفصل ٧٧")).toBe("الفصل 77");
    expect(normalize("۸۸-۱")).toBe("88-1");
  });
  test("French: lowercase, accents stripped", () => {
    expect(normalize("Responsabilité DÉLICTUELLE")).toBe("responsabilite delictuelle");
  });
  test("diacritized and plain forms meet", () => {
    expect(normalize("الفَصْلُ ٧٧")).toBe(normalize("الفصل 77"));
  });
});

describe("light stemming", () => {
  test("strips ال combinations and common suffixes", () => {
    expect(lightStem("والالتزامات")).toBe("التزام");
    expect(lightStem("بالعقد")).toBe("عقد");
    expect(lightStem("للمتعاقدين")).toBe("متعاقد");
  });
  test("keeps فسخ and انفساخ distinct (no root stemming)", () => {
    expect(lightStem("الفسخ")).toBe("فسخ");
    expect(lightStem("الانفساخ")).toBe("انفساخ");
    expect(lightStem("فسخ")).not.toBe(lightStem("انفساخ"));
  });
  test("a lone و/ف/ب is not stripped from a root", () => {
    expect(lightStem("فسخ")).toBe("فسخ");
    expect(lightStem("بيع")).toBe("بيع");
  });
});

describe("canonical ids", () => {
  test("normalizes digits, case and spacing", () => {
    expect(normalizeCanonicalId("doc:٧٧")).toBe("DOC:77");
    expect(normalizeCanonicalId(" CPC-58.25 : 12 ")).toBe("CPC-58.25:12");
    expect(normalizeCanonicalId("CP:88 مكرر")).toBe("CP:88-مكرر");
    expect(normalizeCanonicalId("garbage")).toBeNull();
  });
});

describe("article parser", () => {
  const text = [
    "الكتاب الأول: في الالتزامات بوجه عام",
    "القسم الأول: مصادر الالتزامات",
    "الفصل 1",
    "نص تجريبي للفصل الأول.",
    "الفصل ٢ - نص تجريبي للفصل الثاني",
    "يتابع هنا.",
    "الباب الثاني",
    "الفصل 5",
    "نص تجريبي.",
    "الفصل 5 مكرر",
    "نص مكرر.",
    "الفصل 5",
    "",
  ].join("\n");

  test("splits on markers, Arabic-Indic numbers, bis, headings", () => {
    const { articles } = parseArticles(text);
    expect(articles.map((a) => a.number)).toEqual(["1", "2", "5", "5-مكرر", "5"]);
    expect(articles[1].text).toBe("نص تجريبي للفصل الثاني\nيتابع هنا.");
    expect(articles[1].text).toContain("يتابع هنا.");
    expect(articles[0].headingPath).toEqual(["الكتاب الأول: في الالتزامات بوجه عام", "القسم الأول: مصادر الالتزامات"]);
    expect(articles[2].headingPath).toEqual([
      "الكتاب الأول: في الالتزامات بوجه عام",
      "القسم الأول: مصادر الالتزامات",
      "الباب الثاني",
    ]);
  });

  test("warns about gaps, duplicates and empty bodies", () => {
    const { articles } = parseArticles(text);
    expect(articles[2].warnings).toContain("gap:3-4");
    expect(articles[4].warnings).toEqual(expect.arrayContaining(["duplicate", "empty"]));
  });

  test("المادة numbering and French Article markers", () => {
    const { articles } = parseArticles("المادة 1\nأ\nالمادة 2\nب\nArticle 3\nc");
    expect(articles.map((a) => a.number)).toEqual(["1", "2", "3"]);
  });

  test("nothing detected → a warning, not a crash", () => {
    expect(parseArticles("نص بدون فصول").warnings).toEqual(["no articles detected"]);
  });
});
