const D = require("../../../utils/law/drills");
const { cleanExams, validDate, validTime } = require("../../../utils/law/examParse");
const { zonedInstant, localDate, localTime } = require("../../../utils/law/time");

const labelOf = new Map([["S1", { ref: "n:a" }], ["S2", { ref: "s:1:0" }]]);

describe("QCM cleaning", () => {
  const ok = { question: "ما أركان المسؤولية التقصيرية؟", options: ["أ", "ب", "ج", "د"], correctIndex: 2, explanation: "لأن ...", cite: "S1" };
  test("keeps a well-formed cited item", () => {
    expect(D.cleanQcm({ items: [ok] }, labelOf, 10, { rng: () => 0.999 })).toEqual([{ ...ok }]); // 0.999: the shuffle changes nothing
  });
  test("options are shuffled by us and the correct index follows its option", () => {
    const seen = new Set();
    for (let k = 0; k < 40; k++) {
      let n = 0;
      const rng = () => { n++; return ((n * 0.37 + k * 0.11) % 1); };
      const [q] = D.cleanQcm({ items: [ok] }, labelOf, 10, { rng });
      expect([...q.options].sort()).toEqual([...ok.options].sort());
      expect(q.options[q.correctIndex]).toBe(ok.options[ok.correctIndex]);
      seen.add(q.correctIndex);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(D.shuffled([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });
  test("drops uncited items, unknown labels, bad option sets and bad keys", () => {
    const bad = [
      { ...ok, cite: undefined }, { ...ok, cite: "S9" }, { ...ok, cite: "" },
      { ...ok, options: ["أ", "ب", "ج"] }, { ...ok, options: ["أ", "أ", "ج", "د"] }, { ...ok, options: ["أ", "ب", "ج", ""] },
      { ...ok, correctIndex: 4 }, { ...ok, correctIndex: -1 }, { ...ok, correctIndex: 1.5 }, { ...ok, correctIndex: "1" },
      { ...ok, question: "  " }, null, "x", 5,
    ];
    expect(D.cleanQcm({ items: bad }, labelOf)).toEqual([]);
  });
  test("accepts a bracketed label and caps the count; junk input is an empty list", () => {
    expect(D.cleanQcm({ items: [{ ...ok, cite: "[S2]" }] }, labelOf)[0].cite).toBe("S2");
    expect(D.cleanQcm({ items: Array.from({ length: 20 }, () => ok) }, labelOf, 3)).toHaveLength(3);
    expect(D.cleanQcm(null, labelOf)).toEqual([]);
    expect(D.cleanQcm({ items: "no" }, labelOf)).toEqual([]);
  });
});

describe("case cleaning", () => {
  const facts = "اقترض أحمد مبلغا من صديقه وتعهد بإرجاعه بعد سنة ثم امتنع عن الأداء عند حلول الأجل.";
  const point = (section, cite = "S1") => ({ section, point: "نقطة", cite });
  test("needs facts and a cited key point for each of the four sections", () => {
    const keyPoints = ["facts", "issue", "rule", "solution"].map((s) => point(s));
    expect(D.cleanCase({ facts, keyPoints }, labelOf).keyPoints).toHaveLength(4);
    expect(D.cleanCase({ facts, keyPoints: keyPoints.slice(0, 3) }, labelOf)).toBeNull();
    expect(D.cleanCase({ facts, keyPoints: keyPoints.map((k) => ({ ...k, cite: "S9" })) }, labelOf)).toBeNull();
    expect(D.cleanCase({ facts: "قصير", keyPoints }, labelOf)).toBeNull();
    expect(D.cleanCase({ facts, keyPoints: [...keyPoints.slice(0, 3), point("other")] }, labelOf)).toBeNull();
    expect(D.cleanCase(null, labelOf)).toBeNull();
  });
});

describe("direct and dissertation cleaning", () => {
  test("direct: cited question with a reference answer", () => {
    const it = { question: "عرّف الخطأ", kind: "definition", referenceAnswer: "هو ...", cite: "S1" };
    expect(D.cleanDirect({ items: [it, { ...it, cite: "S8" }, { ...it, referenceAnswer: "" }] }, labelOf)).toHaveLength(1);
    expect(D.cleanDirect({ items: [{ ...it, kind: "weird" }] }, labelOf)[0].kind).toBe("definition");
    expect(D.cleanDirect({ items: [{ ...it, kind: "distinction" }] }, labelOf)[0].kind).toBe("distinction");
  });
  test("dissertation: a topic and at least one cited axis", () => {
    expect(D.cleanDissertation({ topic: "المسؤولية", keyAxes: [{ axis: "الأركان", cite: "S1" }] }, labelOf)).toEqual({ topic: "المسؤولية", keyAxes: [{ axis: "الأركان", cite: "S1" }] });
    expect(D.cleanDissertation({ topic: "المسؤولية", keyAxes: [{ axis: "الأركان", cite: "S5" }] }, labelOf)).toBeNull();
    expect(D.cleanDissertation({ topic: "", keyAxes: [{ axis: "x", cite: "S1" }] }, labelOf)).toBeNull();
  });
});

describe("client view hides every key", () => {
  test.each([
    ["qcm", { items: [{ question: "q", options: ["a", "b", "c", "d"], correctIndex: 1, explanation: "SECRET", cite: { label: "S1" } }], context: [{ text: "SOURCE" }] }],
    ["case", { facts: "وقائع", keyPoints: [{ section: "rule", point: "SECRET", cite: {} }], context: [] }],
    ["direct", { items: [{ question: "q", kind: "definition", referenceAnswer: "SECRET", cite: {} }], context: [] }],
    ["dissertation", { topic: "t", keyAxes: [{ axis: "SECRET", cite: {} }], context: [] }],
  ])("%s", (type, prompt) => {
    const view = JSON.stringify(D.clientView(type, prompt));
    expect(view).not.toMatch(/SECRET|SOURCE|correctIndex|explanation|referenceAnswer|keyPoints|keyAxes|cite|context/);
  });
});

describe("answers", () => {
  test("QCM answers: every item, indices 0-3", () => {
    expect(D.validateQcmAnswers([0, 3, 1], 3).answers).toEqual([0, 3, 1]);
    for (const a of [[0, 1], [0, 1, 4], [0, 1, -1], [0, 1, "2"], "no", null, [0, 1, null]]) expect(D.validateQcmAnswers(a, 3).error).toBe("invalid_answers");
  });
  test("QCM grading", () => {
    const g = D.gradeQcm({ items: [{ correctIndex: 0, explanation: "e", cite: {} }, { correctIndex: 2, explanation: "e", cite: {} }, { correctIndex: 1, explanation: "e", cite: {} }] }, [0, 1, 1]);
    expect(g.score).toBe(67);
    expect(g.items.map((i) => i.correct)).toEqual([true, false, true]);
  });
  test("case answer needs all four sections of at least 15 characters", () => {
    const long = "نص كافٍ للقسم الواحد";
    expect(D.validateCaseAnswer({ facts: long, issue: long, rule: long, solution: long }).answer).toBeTruthy();
    const miss = D.validateCaseAnswer({ facts: long, issue: "قصير", rule: long });
    expect(miss).toEqual({ error: "missing_sections", missing: ["issue", "solution"] });
    expect(D.validateCaseAnswer({ facts: long, issue: long, rule: long, solution: "x".repeat(6001) }).error).toBe("invalid_answer");
    expect(D.validateCaseAnswer(null).error).toBe("invalid_answer");
    expect(D.validateCaseAnswer({ facts: 5, issue: [], rule: {}, solution: null }).missing).toHaveLength(4);
  });
  test("direct answers", () => {
    expect(D.validateDirectAnswers(["جواب", "جواب"], 2).answers).toHaveLength(2);
    for (const a of [["جواب"], ["جواب", "x"], ["جواب", 5], "no"]) expect(D.validateDirectAnswers(a, 2).error).toBe("invalid_answers");
  });
});

describe("dissertation outline validator", () => {
  const good = { intro: "تمهيد عام حول الموضوع وأهميته", problem: "ما حدود المسؤولية التقصيرية؟", parts: [{ title: "المبحث الأول: الأركان", subs: ["المطلب الأول: الخطأ", "المطلب الثاني: الضرر"] }, { title: "المبحث الثاني: الآثار", subs: ["المطلب الأول: التعويض", "المطلب الثاني: التقادم"] }] };
  test("accepts the skeleton: introduction, question, two parts with two or three subsections", () => {
    const v = D.validateOutline(good);
    expect(v).toMatchObject({ valid: true, errors: [], warnings: [] });
    expect(D.validateOutline({ ...good, parts: [good.parts[0], { ...good.parts[1], subs: [...good.parts[1].subs, "المطلب الثالث: كذا"] }] }).warnings).toEqual(["unbalanced_parts"]);
  });
  test("each missing piece is reported with its own code", () => {
    const codes = (o) => D.validateOutline(o).errors;
    expect(codes({ ...good, intro: "" })).toContain("intro_missing");
    expect(codes({ ...good, problem: "" })).toContain("problem_missing");
    expect(codes({ ...good, problem: "إشكالية بلا علامة استفهام واضحة" })).toContain("problem_not_a_question");
    expect(codes({ ...good, problem: "ما حدود المسؤولية التقصيرية?" })).not.toContain("problem_not_a_question");
    expect(codes({ ...good, parts: [good.parts[0]] })).toContain("two_parts_required");
    expect(codes({ ...good, parts: [...good.parts, good.parts[0]] })).toContain("two_parts_required");
    expect(codes({ ...good, parts: [{ title: "", subs: ["ا ب ج", "د ه و"] }, good.parts[1]] })).toContain("part1_title_missing");
    expect(codes({ ...good, parts: [good.parts[0], { ...good.parts[1], subs: ["واحد فقط"] }] })).toContain("part2_needs_2_or_3_subsections");
    expect(codes({ ...good, parts: [good.parts[0], { ...good.parts[1], subs: ["أ ب ج", "أ ب ج"] }] })).toContain("duplicate_titles");
    expect(codes({ ...good, parts: [good.parts[0], { ...good.parts[1], subs: ["ممتاز", "د", "ثالث"] }] })).toContain("part2_needs_2_or_3_subsections");
  });
  test("garbage never throws", () => {
    for (const o of [null, undefined, 5, "x", [], { parts: "no" }, { parts: [null, 5] }]) expect(D.validateOutline(o).valid).toBe(false);
  });
});

describe("scoring from verdicts", () => {
  test("a unit the model did not judge counts as missing; unknown verdicts are ignored", () => {
    const r = D.scoreByUnits(["facts", "issue", "rule", "solution"], [{ section: "facts", verdict: "good", comment: "c" }, { section: "issue", verdict: "partial" }, { section: "rule", verdict: "excellent" }], (x) => x.section);
    expect(r.rows.map((x) => x.verdict)).toEqual(["good", "partial", "missing", "missing"]);
    expect(r.score).toBe(38); // (1 + 0.5) / 4
  });
  test("allJudged tells a unit the student missed from a unit the marker skipped; part names are normalised", () => {
    const some = D.scoreByUnits(["intro", "problem"], [{ part: "intro", verdict: "good" }], (x) => x.part);
    expect(some.allJudged).toBe(false);
    expect(some.rows.map((r) => r.judged)).toEqual([true, false]);
    expect(D.scoreByUnits(["intro"], [{ part: "intro", verdict: "missing", comment: "x" }], (x) => x.part).allJudged).toBe(true);
    expect(["المبحث الأول", "Part 2", "Introduction", "إشكالية", "partie 1", "part1", "???"].map(D.partKey)).toEqual(["part1", "part2", "intro", "problem", "part1", "part1", "???"]);
  });
  test("empty input scores zero", () => {
    expect(D.scoreByUnits([], [], (x) => x).score).toBe(0);
    expect(D.scoreByUnits([0], null, (x) => x.index).score).toBe(0);
  });
});

describe("exam date parsing helpers", () => {
  const today = "2026-10-14";
  test("only real calendar days within the window survive", () => {
    const rows = cleanExams([
      { title: "المسؤولية المدنية", date: "2026-11-20", time: "9h30", room: " A1 " },
      { title: "x", date: "2026-02-30" }, { title: "", date: "2026-11-20" }, { title: "بعيد", date: "2031-01-01" }, { title: "قديم", date: "2025-01-01" },
      { title: "المسؤولية المدنية", date: "2026-11-20", time: "9:30" }, // duplicate
      { title: "بلا ساعة", date: "2026-11-21", time: "25:99" }, null, "str",
    ], today);
    expect(rows).toEqual([{ title: "المسؤولية المدنية", date: "2026-11-20", time: "09:30", room: "A1" }, { title: "بلا ساعة", date: "2026-11-21", time: null, room: null }]);
  });
  test("validDate / validTime", () => {
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(validDate("26-10-14")).toBe(false);
    expect(validTime("8h05")).toBe("08:05");
    expect(validTime("24:00")).toBeNull();
    expect(validTime("")).toBeNull();
  });
});

describe("zonedInstant (no fixed offsets)", () => {
  // Morocco's offset changes (Ramadan, and tzdata revisions), so nothing here hard-codes an offset: the zone rules of the
  // running ICU are the oracle.
  test("round-trips through the zone rules for every fortnight of two years", () => {
    for (let d = new Date("2026-01-01T00:00:00Z"); d < new Date("2028-01-01T00:00:00Z"); d = new Date(d.getTime() + 14 * 86400000)) {
      const date = d.toISOString().slice(0, 10);
      for (const hhmm of ["00:00", "08:00", "09:30", "23:45"]) {
        const t = zonedInstant(date, hhmm);
        if (t) expect([localDate(t), localTime(t)]).toEqual([date, hhmm]);
      }
    }
  });
  test("rejects malformed input", () => {
    expect(zonedInstant("2026-02-30", "09:00")).toBeNull();
    expect(zonedInstant("2026-11-20", "25:00")).toBeNull();
    expect(zonedInstant("2026-11-20", "9:00")).toBeNull();
    expect(zonedInstant(null)).toBeNull();
  });
});
