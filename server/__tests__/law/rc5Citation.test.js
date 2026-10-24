// RC5: direct citations typed in the Library search box («م 230 د.ع», «الفصل 77 من الدستور», …).
const { loadEsm } = require("../../utils/law/testing/renderJsx");
const load = () => loadEsm('export * from "@/components/LawOS/lib/citation";');

describe("parseCitation", () => {
  test("the requested form: «م 230 د.ع» is article 230 of the DOC", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("م 230 د.ع")).toEqual({ kind: "citation", slug: "DOC", number: "230" });
  });
  test("label spellings (م, المادة, ف, الفصل, art.) and code aliases are interchangeable", async () => {
    const { parseCitation } = await load();
    for (const q of ["الفصل 230 من ق.ل.ع", "ف 230 ق.ل.ع", "المادة 230 من ظهير الالتزامات والعقود", "art. 230 DOC", "230 د.ع", "د.ع 230", "د ع 230", "م230 د.ع"]) {
      expect(parseCitation(q)).toEqual({ kind: "citation", slug: "DOC", number: "230" });
    }
  });
  test("Arabic-Indic and Persian digits are normalized", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("م ٢٣٠ د.ع").number).toBe("230");
    expect(parseCitation("م ۲۳۰ د.ع").number).toBe("230");
  });
  test("other codes: Penal, procedure, commerce, labour, family, constitution, land registration", async () => {
    const { parseCitation } = await load();
    const slug = (q) => parseCitation(q).slug;
    expect(slug("الفصل 77 من الدستور")).toBe("CONST-2011");
    expect(slug("م 400 ق.م.م")).toBe("CPC-58.25");
    expect(slug("المادة 400 من قانون المسطرة المدنية")).toBe("CPC-58.25");
    expect(slug("المادة 400 من قانون المسطرة المدنية لسنة 1974")).toBe("CPC-1974");
    expect(slug("م 10 ق.م.ج")).toBe("CPP");
    expect(slug("الفصل 10 من القانون الجنائي")).toBe("CP");
    expect(slug("ف 10 ق.ج")).toBe("CP");
    expect(slug("م 5 م.ت")).toBe("CCOM");
    expect(slug("م 5 مدونة الشغل")).toBe("CT");
    expect(slug("م 5 م.أ")).toBe("MOUDAWANA");
    expect(slug("م 5 مدونة الأسرة")).toBe("MOUDAWANA");
    expect(slug("الفصل 5 من ظهير التحفيظ العقاري")).toBe("DAHIR-LAND-REG");
  });
  test("«مكرر» and «bis» use the corpus numbering (N-مكرر)", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("م 88 مكرر د.ع")).toEqual({ kind: "citation", slug: "DOC", number: "88-مكرر" });
    expect(parseCitation("art 88 bis DOC").number).toBe("88-مكرر");
  });
  test("a label and number without a code searches every text (slug null)", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("الفصل 230")).toEqual({ kind: "citation", slug: null, number: "230" });
    expect(parseCitation("م 12")).toEqual({ kind: "citation", slug: null, number: "12" });
  });
  test("free text, empty and junk are plain text, never a citation", async () => {
    const { parseCitation } = await load();
    for (const q of ["", "   ", null, undefined, "عقد البيع", "شروط محل الالتزام", "م", "د.ع", "المادة 0", "م 230 xyz عقد", 42]) {
      expect(parseCitation(q).kind).toBe("text");
    }
  });
  test("huge or hostile numbers are rejected", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("م 99999999999 د.ع").kind).toBe("text");
    expect(parseCitation("م " + "9".repeat(5000) + " د.ع").kind).toBe("text");
  });
});

describe("parseCitation never opens a different article than the one typed (critic findings)", () => {
  test("sub-numbered articles keep their full number (88-1, 574-4, 5.1, 12/2)", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("الفصل 88-1 من الدستور")).toEqual({ kind: "citation", slug: "CONST-2011", number: "88-1" });
    expect(parseCitation("المادة 2-1 من مدونة الشغل").number).toBe("2-1");
    expect(parseCitation("مدونة الأسرة 88-1")).toEqual({ kind: "citation", slug: "MOUDAWANA", number: "88-1" });
    expect(parseCitation("ف 574-4 ق.ج").number).toBe("574-4");
    expect(parseCitation("م 5.1 د.ع").number).toBe("5-1");
    expect(parseCitation("م 12/2 د.ع").number).toBe("12-2");
  });
  test("forms the corpus numbering cannot express fall back to text, never to the base article", async () => {
    const { parseCitation } = await load();
    for (const q of ["م 5 ثالثا من الدستور", "المادة 12 ter مدونة الأسرة", "م 230 مكرر مرتين من الالتزامات والعقود"]) expect(parseCitation(q).kind).toBe("text");
  });
  test("a year in the code part only selects the 1974 civil procedure code; other years or codes fall back to text", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("المادة 5 من مدونة الأسرة 1974").kind).toBe("text");
    expect(parseCitation("م 5 1974").kind).toBe("text");
    expect(parseCitation("المادة 5 من القانون 1974 المتعلق بالتنظيم القضائي").kind).toBe("text");
    expect(parseCitation("الفصل 5 من الدستور 1996").kind).toBe("text");
    expect(parseCitation("المادة 5 من قانون المسطرة المدنية لسنة 1974").slug).toBe("CPC-1974");
  });
  test("«الفصل» on civil procedure means the 1974 code (58.25 numbers its articles «المادة»)", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("الفصل 32 ق.م.م").slug).toBe("CPC-1974");
    expect(parseCitation("م 32 ق.م.م").slug).toBe("CPC-58.25");
    expect(parseCitation("المادة 32 من قانون المسطرة المدنية").slug).toBe("CPC-58.25");
  });
  test("the full name of the criminal procedure code resolves", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("م 5 من قانون المسطرة الجنائية").slug).toBe("CPP");
    expect(parseCitation("الفصل 5 من القانون الجنائي").slug).toBe("CP");
  });
  test("two-letter abbreviations that are everyday words need their dots", async () => {
    const { parseCitation } = await load();
    expect(parseCitation("ما 5").kind).toBe("text");
    expect(parseCitation("م.أ 5").slug).toBe("MOUDAWANA");
    expect(parseCitation("م 5 م.ت").slug).toBe("CCOM");
  });
});

describe("recents", () => {
  test("pushRecent keeps newest first, de-duplicates, caps at 8, ignores junk", async () => {
    const { pushRecent } = await load();
    let r = [];
    r = pushRecent(r, { canonicalId: "a", label: "A" });
    r = pushRecent(r, { canonicalId: "b", label: "B" });
    r = pushRecent(r, { canonicalId: "a", label: "A" });
    expect(r.map((x) => x.canonicalId)).toEqual(["a", "b"]);
    for (let i = 0; i < 20; i++) r = pushRecent(r, { canonicalId: "x" + i, label: "L" });
    expect(r.length).toBe(8);
    expect(pushRecent(r, null)).toEqual(r);
    expect(pushRecent(r, { label: "no id" })).toEqual(r);
    expect(pushRecent(null, { canonicalId: "z", label: "Z" })).toEqual([{ canonicalId: "z", label: "Z" }]);
  });
});
