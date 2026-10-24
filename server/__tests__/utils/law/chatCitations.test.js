// RC2 2.1: golden set. Every fabricated or unverifiable way of citing an article must be removed and reported;
// verified ones survive. `allowed` = the ids that were in this turn's evidence.
const { scrub } = require("../../../utils/law/chatCitations");

const SLUGS = ["DOC", "CP", "CCOM", "MOUDAWANA", "CPC-58.25", "CT"];

// [branch, model text, allowed ids, ids/mentions expected to be stripped (substrings), expected verified ids]
const FABRICATED = [
  // civil / DOC
  ["civil", "حسب الفصل 230 من ق.ل.ع فالعقد شريعة المتعاقدين.", [], ["الفصل 230"], []],
  ["civil", "وفق [DOC:999] يبطل العقد.", ["DOC:230"], ["DOC:999"], []],
  ["civil", "ينص الفصل ٢٣٠ على ذلك.", [], ["الفصل ٢٣٠"], []],
  ["civil", "Selon l'article 1134 du Code civil, le contrat fait la loi.", [], ["article 1134"], []],
  ["civil", "Art. 1382 CC impose la réparation.", [], ["Art. 1382"], []],
  ["civil", "راجع (DOC:77) وكذلك [XYZ:5].", ["DOC:77"], ["XYZ:5"], ["DOC:77"]],
  // commercial
  ["commercial", "تنص المادة 2 من مدونة التجارة على الأعراف.", [], ["المادة 2"], []],
  ["commercial", "حسب [CCOM:2] ثم [CCOM:555].", ["CCOM:2"], ["CCOM:555"], ["CCOM:2"]],
  ["commercial", "المادة 99 و المادة 100 تحكمان الأصل التجاري.", ["CCOM:99"], ["المادة 100"], []],
  ["commercial", "Art. 20 du Code de commerce français.", [], ["Art. 20"], []],
  // criminal
  ["criminal", "الفصل 3 من القانون الجنائي يكرس الشرعية.", [], ["الفصل 3"], []],
  ["criminal", "[CP:3] يكرس الشرعية، و[CP:9999] لا وجود له.", ["CP:3"], ["CP:9999"], ["CP:3"]],
  ["criminal", "article 121-3 du Code pénal français", [], ["article 121-3"], []],
  ["criminal", "ف. 447 من ق.ج", [], ["ف. 447"], []],
  // administrative
  ["administrative", "المادة 8 من القانون 41-90 تحدد الاختصاص.", [], ["المادة 8"], []],
  ["administrative", "[ADM:1] مرجع غير موجود.", [], [], []],
  // family
  ["family", "المادة 400 من مدونة الأسرة تحيل على المالكي.", [], ["المادة 400"], []],
  ["family", "[MOUDAWANA:400] هنا صحيحة و[MOUDAWANA:1000] لا.", ["MOUDAWANA:400"], ["MOUDAWANA:1000"], ["MOUDAWANA:400"]],
  ["family", "الفصول 20 و 21 و 22 من المدونة", [], ["الفصول 20"], []],
  ["family", "art. 144 du code de la famille", [], ["art. 144"], []],
];

describe.each(["civil", "commercial", "criminal", "administrative", "family"])("golden set: %s", (branch) => {
  test.each(FABRICATED.filter((c) => c[0] === branch))("%#: %s", (_b, text, allowed, mustStrip, mustVerify) => {
    const r = scrub(text, new Set(allowed), SLUGS);
    for (const s of mustStrip) {
      expect(r.text).not.toContain(s);
      expect([...r.stripped].join("|")).toContain(s);
    }
    for (const v of mustVerify) {
      expect(r.verified).toContain(v);
      expect(r.text).toContain(`[${v}]`);
    }
  });
});

test("a citation that resolves is canonicalized and linked, an unknown code is not treated as an id", () => {
  const r = scrub("حسب [DOC:77] وأيضا Amende: 2000 درهم.", new Set(["DOC:77"]), SLUGS);
  expect(r.verified).toEqual(["DOC:77"]);
  expect(r.text).toContain("Amende: 2000");
  expect(r.stripped).toEqual([]);
});
