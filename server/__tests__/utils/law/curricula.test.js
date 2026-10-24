const { all, find, validate } = require("../../../utils/law/curricula");

describe("curricula seeds", () => {
  test("every shipped file is valid, unverified, and says who supplied it", () => {
    const list = all();
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(c.verified).toBe(false);
      expect(c.source.length).toBeGreaterThan(10);
    }
  });

  test("S3 holds the six modules supplied by the project lead for both tracks and both languages", () => {
    for (const track of ["PRIVE", "PUBLIC"]) {
      const ar = find({ facultyCode: "ANY", semester: "S3", track, language: "AR" });
      expect(ar.modules.map((m) => m.title)).toEqual(["المسؤولية المدنية", "قانون الشركات", "القانون الاجتماعي / قانون الشغل", "التنظيم القضائي للمملكة", "الأنظمة الدستورية المقارنة", "قانون الميزانية والمالية العامة"]);
      const fr = find({ facultyCode: "ANY", semester: "S3", track, language: "FR" });
      expect(fr.modules).toHaveLength(6);
      expect(fr.modules[0].title).toBe("Responsabilité civile");
    }
  });

  test("no list is invented for other semesters", () => {
    expect(find({ facultyCode: "X", semester: "S1", track: "PRIVE", language: "AR" })).toBeNull();
  });

  test("validation rejects malformed curricula", () => {
    const ok = { key: "s1-prive-ar", semester: "S1", track: "PRIVE", language: "AR", facultyCodes: null, verified: false, source: "someone said so", modules: [{ title: "a" }] };
    expect(() => validate(ok)).not.toThrow();
    for (const patch of [{ key: "Bad Key" }, { semester: "S9" }, { track: "X" }, { language: "EN" }, { verified: undefined }, { source: "" }, { modules: [{ title: "" }] }, { modules: [{ title: "a" }, { title: "a" }] }, { modules: "no" }, { facultyCodes: "x" }])
      expect(() => validate({ ...ok, ...patch })).toThrow();
    expect(() => validate(null)).toThrow();
  });
});
