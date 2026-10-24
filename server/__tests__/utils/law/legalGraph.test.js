// Legal graph: deterministic cross-reference extraction (no AI). Only refs whose code is known or implied are kept.
const { extractExplicitReferences, summarize, TOURS } = require("../../../utils/law/legalGraph");

const ids = (text, code = "DOC") => extractExplicitReferences(text, code).map((r) => r.canonicalId);

test("plain article references resolve to the current code", () => {
  expect(ids("طبقا لمقتضيات الفصل 77 من هذا القانون")).toEqual(["DOC:77"]);
  expect(ids("مع مراعاة أحكام المادة 12", "CCOM")).toEqual(["CCOM:12"]);
});

test("Arabic-Indic and Persian digits are read as western digits", () => {
  expect(ids("الفصل ٧٧")).toEqual(["DOC:77"]);
  expect(ids("الفصل ۷۸")).toEqual(["DOC:78"]);
});

test("suffixes: مكرر and -N keep the stored canonical form", () => {
  expect(ids("الفصل 88 مكرر")).toEqual(["DOC:88-مكرر"]);
  expect(ids("الفصل 88-1")).toEqual(["DOC:88-1"]);
});

test("plural forms list every number", () => {
  expect(ids("الفصلين 77 و 78")).toEqual(["DOC:77", "DOC:78"]);
  expect(ids("الفصول 77 و78 و79")).toEqual(["DOC:77", "DOC:78", "DOC:79"]);
});

test("known code qualifiers switch the target code", () => {
  expect(ids("الفصل 129 من مجموعة القانون الجنائي")).toEqual(["CP:129"]);
  expect(ids("الفصل 77 من ق.ل.ع", "CP")).toEqual(["DOC:77"]);
  expect(ids("الفصل 32 من قانون المسطرة المدنية")).toEqual(["CPC:32"]);
  expect(ids("المادة 5 من مدونة التجارة")).toEqual(["CCOM:5"]);
});

test("a qualifier that names an unknown text is skipped, never attributed to the current code", () => {
  expect(ids("الفصل 5 من الدستور")).toEqual([]);
  expect(ids("المادة 3 من القانون رقم 12.03")).toEqual([]);
  expect(ids("الفصل 5 من الظهير الشريف الصادر في 1913")).toEqual([]);
});

test("self references are dropped and duplicates collapse", () => {
  expect(extractExplicitReferences("الفصل 77 والفصل 78 ثم الفصل 78", "DOC", { selfCanonicalId: "DOC:77" }).map((r) => r.canonicalId)).toEqual(["DOC:78"]);
});

test("continuations, ranges and distant qualifiers never fall back to the current code", () => {
  for (const t of [
    "الفصل 5 وما بعده من الدستور",
    "المادة 5 في فقرتها الثانية من القانون رقم 31.08",
    "الفصل 12 في ظهير 12 غشت 1913",
    "الفصل 37 وما يليه من الظهير الشريف بمثابة قانون رقم 1.74.447",
    "المادة 90 وما يليها إلى المادة 93 من القانون المذكور",
  ]) expect([t, ids(t)]).toEqual([t, []]);
  expect(ids("الفصل 3 أعلاه من مجموعة القانون الجنائي")).toEqual(["CP:3"]);
  // a continuation does not hide an explicitly named, known code: the named article itself is a real citation
  expect(ids("الفصول 401 وما يليها من قانون المسطرة المدنية")).toEqual(["CPC:401"]);
  expect(ids("المادة 5 في قانون المسطرة الجنائية")).toEqual(["CPP:5"]);
});

test("a spaced hyphen is an ambiguous (reversed) number: dropped, never read as its first part", () => {
  expect(extractExplicitReferences("الفصل 2 - 574 من مجموعة القانون الجنائي", "CPP")).toEqual([]);
  expect(ids("الفصل 88-1")).toEqual(["DOC:88-1"]);
});

test("prefixed and dual forms are recognised", () => {
  expect(ids("طبقا للفصل 77")).toEqual(["DOC:77"]);
  expect(ids("وفقا للمادة 5", "CCOM")).toEqual(["CCOM:5"]);
  expect(ids("الفصلان 77 و 78")).toEqual(["DOC:77", "DOC:78"]);
  expect(ids("المادتان 5 و 6", "CCOM")).toEqual(["CCOM:5", "CCOM:6"]);
  expect(ids("الفصل 5 من المسطرة الجنائية")).toEqual(["CPP:5"]);
});

test("the qualifier belongs to its own reference, not to the next one", () => {
  expect(ids("الفصل 77 والفصل 3 من مجموعة القانون الجنائي")).toEqual(["DOC:77", "CP:3"]);
});

test("empty and non-string input yield nothing", () => {
  expect(ids("")).toEqual([]);
  expect(ids(null)).toEqual([]);
  expect(ids(undefined)).toEqual([]);
  expect(ids("نص بلا إحالة")).toEqual([]);
});

test("a huge numeric run does not hang or throw", () => {
  expect(() => ids("الفصل " + "9".repeat(5000))).not.toThrow();
  expect(ids("الفصل " + "9".repeat(5000))).toEqual([]);
});

test("summarize trims long text on a word boundary", () => {
  expect(summarize("كلمة ".repeat(100), 20).length).toBeLessThanOrEqual(21);
  expect(summarize("قصير")).toBe("قصير");
  expect(summarize(null)).toBe("");
});

test("tours are static outlines: steps name articles or concepts, never carry statute text", () => {
  expect(TOURS.length).toBeGreaterThanOrEqual(2);
  for (const t of TOURS) {
    expect(t.steps.length).toBeGreaterThanOrEqual(2);
    for (const s of t.steps) {
      expect(["article", "concept", "pair"]).toContain(s.kind);
      expect(s.text).toBeUndefined();
    }
  }
});
