// RC2 2.2: branch modules are selected by corpus domain and carry the right source hierarchy.
const { branchesFor, branchBlock } = require("../../../utils/law/legal/branches");

test("commercial: hierarchy comes from Art. 2 of the Code de Commerce (15-95), not the DOC", () => {
  const [b] = branchesFor(["COMMERCIAL"]);
  expect(b.id).toBe("commercial");
  expect(b.rules).toMatch(/المادة 2 من مدونة التجارة/);
  expect(b.rules).toMatch(/15-95/);
  expect(b.rules).toMatch(/القانون التجاري أولا.*الأعراف.*القانون المدني/s);
  expect(b.rules).not.toMatch(/الفصل 2 من ظهير/);
});

test("criminal: legality, strict interpretation, no analogy, non-retroactivity, two actions", () => {
  const r = branchesFor(["CRIMINAL"])[0].rules;
  for (const k of [/الشرعية/, /الفصل 3/, /التفسير الضيق/, /لا قياس/, /أصلح للمتهم/, /الدعوى العمومية/, /الدعوى المدنية التابعة/]) expect(r).toMatch(k);
});

test("administrative: uncodified, jurisprudence, 41-90 / 80-03, no article for everything", () => {
  const r = branchesFor(["ADMIN"])[0].rules;
  for (const k of [/غير مقنَّن/, /41-90/, /80-03/, /اللامركزية/, /لا تدّعِ/]) expect(r).toMatch(k);
});

test("family: Moudawana with Art. 400 / Maliki fallback", () => {
  const r = branchesFor(["FAMILY"])[0].rules;
  expect(r).toMatch(/المادة 400/);
  expect(r).toMatch(/المالكي/);
});

test("selection by domain; unrelated domains add nothing", () => {
  expect(branchesFor(["CIVIL", "LABOUR"])).toEqual([]);
  expect(branchBlock(["CIVIL"])).toBe("");
  expect(branchesFor(["CRIMINAL", "COMMERCIAL"]).map((b) => b.id).sort()).toEqual(["commercial", "criminal"]);
  expect(branchBlock(["FAMILY"])).toMatch(/^<branch_rules>[\s\S]*<\/branch_rules>$/);
});
