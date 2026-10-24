const { looksGarbledArabic } = require("../../../utils/law/jobs/textQuality");

const repeat = (s, n) => Array.from({ length: n }, () => s).join(" ");

describe("looksGarbledArabic", () => {
  test("a page whose text layer is in visual order (reversed words, split letters) is garbled", () => {
    const garbled = repeat("تتقادم الالتزامات الناشئة ريغ نيبو مهنيب وأ راجتلا نيب ي راجت لمع ةبسانمب ن وناقلا مق ر ر اجتلا ن وكت ي ف ى وعدلا", 6);
    expect(looksGarbledArabic(garbled)).toBe(true);
  });

  test("ordinary Arabic legal prose is not", () => {
    const clean = repeat("تتقادم الالتزامات الناشئة بين التجار بمضي خمس سنوات ما لم توجد مقتضيات خاصة مخالفة وفي هذه الحالة يجب على المحكمة أن تبت في الدعوى", 8);
    expect(looksGarbledArabic(clean)).toBe(false);
  });

  test("list markers (أ - ب - ج) and the conjunction و do not trip it", () => {
    const withLists = repeat("يشترط في التاجر ما يلي أ - بلوغ سن الرشد ب - عدم الحجر ج - التقييد في السجل التجاري و الاستقلالية في العمل", 8);
    expect(looksGarbledArabic(withLists)).toBe(false);
  });

  test("short text, empty text and non-Arabic text are never judged garbled", () => {
    expect(looksGarbledArabic("ر ا ج ت")).toBe(false);
    expect(looksGarbledArabic("")).toBe(false);
    expect(looksGarbledArabic(null)).toBe(false);
    expect(looksGarbledArabic(repeat("a b c d e f g h i j k l", 10))).toBe(false);
  });
});

// A realistic page is ~300 words of ordinary legal prose; each case below is sprinkled through such a page.
describe("looksGarbledArabic: legitimate patterns on a full page are not garbled", () => {
  const PROSE = "يجب على كل تاجر أن يمسك دفاتر محاسبية منتظمة وأن يحتفظ بها خلال المدة المقررة قانونا وتسلم الوثائق إلى المحكمة عند الاقتضاء";
  const page = (insert, times = 8) => {
    const out = [];
    for (let i = 0; i < times; i++) out.push(PROSE, insert);
    return out.join(" ");
  };
  const words = (t) => t.split(/\s+/).filter(Boolean).length;

  test.each([
    ["years written with a trailing letter", "صدر القانون سنة 2011 م وعدل سنة 2019 م"],
    ["fines written with a unit letter", "غرامة من 1200 د إلى 5000 د"],
    ["table cells: letter + number", "ف 1 ف 2 ف 3 ص 4 ج 5"],
    ["lettered lists without dashes", "أ الأهلية التجارية ب التقييد في السجل ج مسك المحاسبة د الشروط"],
    ["lettered lists with dashes", "أ - الأهلية ب - التقييد ج - المحاسبة"],
    ["a lone conjunction written apart", "التاجر و الوكيل و الشريك"],
  ])("%s", (_name, insert) => {
    const t = page(insert);
    expect(words(t)).toBeGreaterThan(200);
    expect(looksGarbledArabic(t)).toBe(false);
  });

  test("vocalised text whose short-vowel marks come out as separate tokens is not garbled", () => {
    // pdf.js can emit the marks apart from their letters: "يُعاقب" -> "ي", "ُ", "عاقب"
    const vocalised = "ي \u064F عاقب كل من ي \u064F حكم عليه ب \u0650 غرامة و ت \u064F سلم الوثائق ل \u064E لمحكمة";
    const t = page(vocalised);
    expect(looksGarbledArabic(t)).toBe(false);
  });

  test("presentation-form letters are folded: garbled text whose split letters are encoded as presentation forms is still caught", () => {
    // isolated presentation forms of ر ا ج ت ن ل (U+FEAD U+FE8D U+FE9D U+FE95 U+FEE5 U+FEDD)
    const garbled = "تتقادم الالتزامات الناشئة ريغ نيبو مهنيب \uFEAD \uFE8D \uFE9D \uFE95 \uFEE5 \uFEDD وأ راجتلا نيب \uFEAD \uFE8D \uFE9D \uFE95";
    const out = [];
    for (let i = 0; i < 6; i++) out.push(garbled);
    expect(looksGarbledArabic(out.join(" "))).toBe(true);
  });

  test("real garbling is still caught at full-page density, with or without such patterns mixed in", () => {
    const garbled = "تتقادم الالتزامات الناشئة ريغ نيبو مهنيب وأ راجتلا نيب ي راجت لمع ةبسانمب ن وناقلا مق ر ر اجتلا ن وكت ي ف ى وعدلا";
    const out = [];
    for (let i = 0; i < 10; i++) out.push(garbled, "صدر القانون سنة 2011 م");
    expect(looksGarbledArabic(out.join(" "))).toBe(true);
  });
});

