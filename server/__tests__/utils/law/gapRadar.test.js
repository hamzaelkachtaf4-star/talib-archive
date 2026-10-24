// The gap radar's scoring is pure: plain articles and topics in, ranked gaps out. The fixture articles below are
// invented test text (they are NOT law); they only exercise the rules.
const { articleFeatures, termsOf, analyze, severityOf, analyzeIsolated } = require("../../../utils/law/course/gapRadar");

describe("articleFeatures", () => {
  test("recognises deadlines and prescription", () => {
    expect(articleFeatures("يتقادم الحق بمرور سنة من تاريخ العلم").deadline).toBe(true);
    expect(articleFeatures("يجب القيام بذلك خلال ثلاثة أشهر من البدء").deadline).toBe(true);
    expect(articleFeatures("يحتفظ التاجر بالوثائق مدة عشر سنوات").deadline).toBe(true);
    expect(articleFeatures("يعرف العقد بأنه اتفاق بين طرفين").deadline).toBe(false);
  });

  test("recognises sanctions, conditions, exceptions and definitions", () => {
    expect(articleFeatures("كل تصرف مخالف يكون باطلا ويعاقب مرتكبه بغرامة").sanction).toBe(true);
    expect(articleFeatures("يشترط لصحة العقد توافر الأهلية").condition).toBe(true);
    expect(articleFeatures("لا يجوز ذلك غير أنه يجوز بإذن").exception).toBe(true);
    expect(articleFeatures("يقصد بالسجل التجاري الوثيقة الرسمية").definition).toBe(true);
  });

  test("hamza, ta marbuta and diacritics do not matter", () => {
    expect(articleFeatures("تَسْقُطُ الدَّعْوَى بِمُضِيِّ سَنَةٍ").deadline).toBe(true);
    expect(articleFeatures("آجال الإنذار").deadline).toBe(true);
  });
});

describe("articleFeatures: deadline wording", () => {
  test.each([
    ["تحدد مدة العقد بسنتين", true],
    ["يسقط الحق بمضي سنة", true],
    ["الأجل المحدد للطعن", true],
    ["يلتزم بذلك من أجل تحقيق الغاية", false],
    ["لأجل ذلك قرر المشرع", false],
    ["يمضي العقد وفق ما اتفق عليه", false],
    ["تتقادم الدعوى بمرور خمس سنوات", true],
  ])("%s -> deadline %s", (text, expected) => {
    expect(articleFeatures(text).deadline).toBe(expected);
  });
});

describe("termsOf", () => {
  test("light stems, no stop words, no short tokens, digits dropped", () => {
    const t = termsOf("التاجر في السجل التجاري 2024 و");
    expect(t).toContain("تاجر");
    expect(t).not.toContain("في");
    expect(t.every((x) => x.length >= 3)).toBe(true);
    expect(t.some((x) => /\d/.test(x))).toBe(false);
  });
});

const art = (n, heading, text, over = {}) => ({ id: `a${n}`, canonicalId: `TX:${n}`, slug: "TX", number: String(n), headingPath: heading, text, ...over });
const topic = (id, title, text, over = {}) => ({ id, title, headingPath: [title], text, emphasisRatio: 0, ...over });

const SEC = ["الكتاب الأول", "الأهلية التجارية"];
const REG = ["الكتاب الأول", "السجل التجاري"];
const CORPUS = [
  art(1, SEC, "يشترط لمباشرة التجارة بلوغ سن الرشد القانوني وتوافر الأهلية التجارية"),
  art(2, SEC, "يتقادم حق إبطال تصرفات القاصر بمرور سنة من تاريخ بلوغه سن الرشد"),
  art(3, REG, "يجب على كل تاجر طلب تقييده في السجل التجاري خلال ثلاثة أشهر من بدء نشاطه"),
  art(4, REG, "يقصد بالسجل التجاري سجل يمسكه كاتب ضبط المحكمة"),
  art(5, ["الكتاب الثاني", "الشيك"], "يجب أن يتضمن الشيك اسم المسحوب عليه ويعاقب من يصدر شيكا بدون رصيد بغرامة"),
  art(6, ["الكتاب الثاني", "الكمبيالة"], "يشترط في الكمبيالة ذكر تاريخ الاستحقاق واسم المسحوب عليه"),
];
const NOTES = [
  topic("t1", "سن الرشد القانوني", "الأهلية التجارية تتطلب بلوغ سن الرشد القانوني وتوافر الأهلية التجارية الكاملة للتاجر", { headingPath: ["القانون التجاري", "الأهلية التجارية", "سن الرشد القانوني"] }),
  topic("t2", "التقييد في السجل التجاري", "السجل التجاري يمسكه كاتب ضبط المحكمة ويسجل فيه التاجر", { headingPath: ["القانون التجاري", "السجل التجاري", "التقييد في السجل التجاري"] }),
  topic("t3", "الكمبيالة", "الكمبيالة يشترط فيها ذكر تاريخ الاستحقاق واسم المسحوب عليه", { headingPath: ["القانون التجاري", "الأوراق التجارية", "الكمبيالة"] }),
];

describe("analyze", () => {
  const run = (over = {}) => analyze({ articles: CORPUS, topics: NOTES, ...over });
  const byId = (r) => Object.fromEntries(r.gaps.map((g) => [g.canonicalId, g]));

  test("covered articles are not gaps; uncovered ones in a section the notes touch are", () => {
    const g = byId(run());
    expect(g["TX:1"]).toBeUndefined(); // notes restate it
    expect(g["TX:4"]).toBeUndefined(); // covered
    expect(g["TX:6"]).toBeUndefined();
    expect(g["TX:2"]).toMatchObject({ kind: "PRESCRIPTION", areaTouched: true, partial: false });
  });

  test("a topic that covers an article but never mentions its deadline leaves it partially covered", () => {
    const g = byId(run())["TX:3"]; // notes: "the registry, kept by the court clerk"; the article adds a 3-month deadline
    expect(g).toMatchObject({ kind: "PRESCRIPTION", partial: true, areaTouched: true, bestTopicId: "t2" });
    expect(g.explanationAr).toContain("الأجل");
  });

  test("the same topic with a deadline in it is fully covered", () => {
    const withDeadline = NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + " ويجب التقييد خلال ثلاثة أشهر من بدء النشاط" } : t));
    expect(byId(analyze({ articles: CORPUS, topics: withDeadline }))["TX:3"]).toBeUndefined();
  });

  test("a skipped section next to a section the notes cover is reported as a missing section", () => {
    const g = run().gaps.find((x) => x.kind === "MISSING_SECTION");
    expect(g).toMatchObject({ canonicalId: "TX:5", sectionTitle: "الشيك" });
  });

  test("ranking: deadline and sanction articles outrank definitions; touched areas outrank untouched ones", () => {
    const r = run();
    const sev = byId(r);
    expect(sev["TX:3"].severity).toBeGreaterThan(0);
    expect(r.gaps.map((g) => g.severity)).toEqual([...r.gaps.map((g) => g.severity)].sort((a, b) => b - a));
    const defOnly = analyze({ articles: [...CORPUS, art(9, REG, "يقصد بالتاجر كل شخص طبيعي يمارس الحرفة والاحتراف بصفة اعتيادية")], topics: NOTES });
    const d = defOnly.gaps.find((g) => g.canonicalId === "TX:9");
    expect(d.severity).toBeLessThan(sev["TX:3"].severity);
  });

  test("an area the notes never touch produces no article gaps", () => {
    const r = analyze({ articles: [...CORPUS, art(20, ["الكتاب الثالث", "الإفلاس"], "يتقادم الحق في تقديم الدين خلال ثلاثين يوما من الحكم")], topics: NOTES });
    expect(r.gaps.some((g) => g.canonicalId === "TX:20")).toBe(false);
  });

  test("a confusion-pair article and a heavily cited article rank higher than a plain one", () => {
    const base = byId(run())["TX:2"].severity;
    const boosted = byId(run({ pairArticleIds: new Set(["a2"]), decisionCounts: new Map([["a2", 8]]) }))["TX:2"].severity;
    expect(boosted).toBeGreaterThan(base);
  });

  test("the professor's emphasis near the gap raises its severity", () => {
    const base = byId(run())["TX:3"].severity;
    const emph = NOTES.map((t) => (t.id === "t2" ? { ...t, emphasisRatio: 0.4 } : t));
    expect(byId(analyze({ articles: CORPUS, topics: emph }))["TX:3"].severity).toBeGreaterThan(base);
  });

  test("a topic that cites the article number counts as coverage when the wording overlaps a little", () => {
    const cited = NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + " وتنص المادة 3 على أجل التقييد في السجل التجاري" } : t));
    expect(byId(analyze({ articles: CORPUS, topics: cited }))["TX:3"]).toBeUndefined();
  });

  describe("citation of an article number", () => {
    const wrongCode = NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + " وتنص المادة 3 من مدونة الشغل على التقييد في السجل" } : t));
    const duration = NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + " الفصل 230 داخل 3 ايام من التقييد في السجل" } : t));
    const own = (text) => NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + text } : t));

    test("a citation of that number in ANOTHER code does not cover this article", () => {
      expect(byId(analyze({ articles: CORPUS.map((a) => ({ ...a, codeTitle: "المدونة التجارية" })), topics: wrongCode }))["TX:3"]).toBeDefined();
    });

    test("a citation of a DIFFERENT article number does not cover this article", () => {
      expect(byId(analyze({ articles: CORPUS, topics: own(" وتنص المادة 5 على أجل التقييد في السجل") }))["TX:3"]).toBeDefined();
      expect(byId(analyze({ articles: CORPUS, topics: own(" وتنص المادة 33 على أجل التقييد في السجل") }))["TX:3"]).toBeDefined(); // 33 is not 3
    });

    test("a number that is not preceded by an article label (a duration) is not a citation", () => {
      expect(byId(analyze({ articles: CORPUS, topics: duration }))["TX:3"]).toBeDefined();
    });

    test("a citation that names this article's own code, or none, counts when the wording overlaps", () => {
      const titled = CORPUS.map((a) => ({ ...a, codeTitle: "المدونة التجارية" }));
      expect(byId(analyze({ articles: titled, topics: own(" وتنص المادة 3 من المدونة التجارية على أجل التقييد في السجل") }))["TX:3"]).toBeUndefined();
      expect(byId(analyze({ articles: titled, topics: own(" وتنص المادة 3 على أجل التقييد في السجل") }))["TX:3"]).toBeUndefined();
    });

    test("hyphenated and 'مكرر' numbers are recognised", () => {
      const corpus = [...CORPUS, art("88-1", REG, "يجب على كل تاجر طلب تقييده في السجل التجاري خلال شهر واحد من تغيير عنوانه")];
      const notes = own(" وتنص المادة 88-1 على أجل تقييد تغيير العنوان في السجل التجاري");
      expect(byId(analyze({ articles: corpus, topics: notes }))["TX:88-1"]).toBeUndefined();
      const bis = [...CORPUS, art("88 مكرر", REG, "يجب على كل تاجر طلب تقييده في السجل التجاري خلال شهر واحد من تغيير عنوانه")];
      const notes2 = own(" وتنص المادة 88 مكرر على أجل تقييد تغيير العنوان في السجل التجاري");
      expect(byId(analyze({ articles: bis, topics: notes2 }))["TX:88 مكرر"]).toBeUndefined();
    });
  });

  test("a note that copies the article and drops only the deadline is a partial gap with a HIGH severity", () => {
    const verbatim = NOTES.map((t) => (t.id === "t2" ? { ...t, text: "يجب على كل تاجر طلب تقييده في السجل التجاري من بدء نشاطه" } : t));
    const g = byId(analyze({ articles: CORPUS, topics: verbatim }))["TX:3"];
    expect(g).toMatchObject({ partial: true });
    expect(g.coverage).toBeGreaterThanOrEqual(0.35);
    expect(g.severity).toBeGreaterThan(2);
  });

  test("a note that states a DIFFERENT period leaves the article's period unstated", () => {
    const other = NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + " ويجب التقييد خلال ثلاثة أيام من بدء النشاط" } : t));
    expect(byId(analyze({ articles: CORPUS, topics: other }))["TX:3"]).toMatchObject({ partial: true });
    const right = NOTES.map((t) => (t.id === "t2" ? { ...t, text: t.text + " ويجب التقييد خلال 3 أشهر من بدء النشاط" } : t));
    expect(byId(analyze({ articles: CORPUS, topics: right }))["TX:3"]).toBeUndefined();
  });

  test("a term that nearly every article contains does not identify any of them", () => {
    const L = "ابجدهزحطيكلمنسعفصقرشتثخذضظغ".split("");
    const w = (i, k) => `${L[(i + k) % L.length]}${L[(i * 3 + k * 5 + 1) % L.length]}${L[(i * 7 + k * 2 + 2) % L.length]}ن`;
    const flat = Array.from({ length: 10 }, (_, i) => art(200 + i, ["الكتاب", "الموطن"], `يجب على التاجر ${w(i, 1)} ${w(i, 2)} ${w(i, 3)} ${w(i, 4)}`));
    const onlyCommon = [topic("c1", "الموطن", "التاجر التاجر التاجر", { headingPath: ["القانون", "الموطن"] })];
    const r = analyze({ articles: flat, topics: onlyCommon });
    expect(r.gaps.length).toBeGreaterThan(0); // the area is touched (heading), so articles are judged...
    expect(r.gaps.every((g) => g.coverage === 0)).toBe(true); // ...and "التاجر" alone covers none of them
  });

  test("an article with too few distinctive words to be matched is not reported as a gap", () => {
    const tiny = [art(300, SEC, "ملغاة"), ...CORPUS];
    expect(byId(analyze({ articles: tiny, topics: NOTES }))["TX:300"]).toBeUndefined();
  });

  test("the full list of detected gaps is returned even when the stored list is capped", () => {
    const L = "ابجدهزحطيكلمنسعفصقرشتثخذضظغ".split("");
    const w = (i, k) => `${L[(i + k) % L.length]}${L[(i * 3 + k * 5 + 1) % L.length]}${L[(i * 7 + k * 2 + 2) % L.length]}ن`;
    const many = Array.from({ length: 200 }, (_, i) => art(100 + i, REG, `يجب على التاجر خلال ${i + 1} يوما ${w(i, 1)} ${w(i, 2)} ${w(i, 3)} ${w(i, 4)} والسجل`));
    const r = analyze({ articles: [...CORPUS, ...many], topics: NOTES, maxGaps: 25 });
    expect(r.gaps.length).toBe(25);
    expect(r.detected.length).toBeGreaterThan(25);
    expect(r.covered).toEqual(expect.arrayContaining(["TX:1", "TX:6"]));
    expect(r.covered).not.toContain("TX:2");
  });

  test("each gap carries the best matching topic, a coverage score, signals and a verbatim quote", () => {
    const g = byId(run())["TX:3"];
    expect(g.bestTopicId).toBe("t2");
    expect(g.coverage).toBeGreaterThanOrEqual(0.35); // the topic matches the article; it lacks the deadline
    expect(g.partial).toBe(true);
    expect(g.signals).toMatchObject({ deadline: true, condition: true });
    expect(g.quote).toBe(CORPUS[2].text);
    expect(g.explanationAr).toContain("3");
  });

  test("empty inputs give an empty result, never a crash", () => {
    expect(analyze({ articles: [], topics: NOTES }).gaps).toEqual([]);
    expect(analyze({ articles: CORPUS, topics: [] }).gaps).toEqual([]);
    expect(analyze({ articles: [art(1, [], "")], topics: NOTES }).gaps).toEqual([]);
  });

  test("results are capped", () => {
    const L = "ابجدهزحطيكلمنسعفصقرشتثخذضظغ".split("");
    const w = (i, k) => `${L[(i + k) % L.length]}${L[(i * 3 + k * 5 + 1) % L.length]}${L[(i * 7 + k * 2 + 2) % L.length]}ن`;
    const many = Array.from({ length: 200 }, (_, i) => art(100 + i, REG, `يجب على التاجر خلال ${i + 1} يوما ${w(i, 1)} ${w(i, 2)} ${w(i, 3)} ${w(i, 4)} والسجل`));
    expect(analyze({ articles: [...CORPUS, ...many], topics: NOTES, maxGaps: 25 }).gaps.length).toBe(25);
  });
});

describe("severityOf", () => {
  test("a partial gap keeps a high severity even when the wording is almost fully covered", () => {
    expect(severityOf({ signals: { deadline: true, condition: true }, coverage: 1, partial: true })).toBeGreaterThan(2);
    expect(severityOf({ signals: { deadline: true }, coverage: 0.9, partial: true })).toBeGreaterThan(2);
  });

  test("is bounded to 0..10 and zero when fully covered", () => {
    expect(severityOf({ signals: { deadline: true, sanction: true, condition: true, exception: true }, coverage: 0, pair: true, decisions: 50, emphasis: 1 })).toBeLessThanOrEqual(10);
    expect(severityOf({ signals: { deadline: true }, coverage: 1 })).toBe(0);
  });
});

describe("cost", () => {
  const vocab = Array.from({ length: 4000 }, (_, i) => `كلمه${String.fromCharCode(1570 + (i % 28))}${String.fromCharCode(1570 + ((i * 7) % 28))}${i}`);
  const words = (n, off) => Array.from({ length: n }, (_, i) => vocab[(off + i * 13) % vocab.length]).join(" ");

  test("2 500 articles against 600 adversarial topics (whole vocabulary, an article citation) finish in seconds", () => {
    const articles = Array.from({ length: 2500 }, (_, i) => art(i + 1, [`الكتاب ${i % 5}`, `الباب ${i % 40}`], `${words(40, i)} خلال ثلاثة أشهر`));
    const evil = words(300, 5) + " المادة 999999";
    const topics = Array.from({ length: 600 }, (_, i) => topic(`t${i}`, `موضوع ${i}`, `${evil} ${words(300, i)}`));
    const t = Date.now();
    const r = analyze({ articles, topics });
    expect(Date.now() - t).toBeLessThan(15000);
    expect(r.stats.articles).toBe(2500);
  });

  test("an oversized course is bounded and says so", () => {
    const topics = Array.from({ length: 6000 }, (_, i) => topic(`t${i}`, `موضوع ${i}`, words(20, i)));
    const r = analyze({ articles: CORPUS, topics });
    expect(r.stats.truncated).toBe(true);
    expect(r.stats.topics).toBeLessThanOrEqual(5000);
  });
});

describe("analyzeIsolated (worker thread)", () => {
  test("gives the same result as analyze", async () => {
    const direct = analyze({ articles: CORPUS, topics: NOTES, pairArticleIds: new Set(["a2"]), decisionCounts: new Map([["a2", 3]]) });
    const viaWorker = await analyzeIsolated({ articles: CORPUS, topics: NOTES, pairArticleIds: ["a2"], decisionCounts: [["a2", 3]] });
    expect(viaWorker.gaps).toEqual(direct.gaps);
    expect(viaWorker.detected).toEqual(direct.detected);
  });

  test("does not block this thread while it works", async () => {
    const articles = Array.from({ length: 1500 }, (_, i) => art(i + 1, [`ب${i % 30}`], `${Array.from({ length: 40 }, (_, k) => `ك${(i * 3 + k * 7) % 900}ص`).join(" ")}`));
    const topics = Array.from({ length: 400 }, (_, i) => topic(`t${i}`, `موضوع ${i}`, Array.from({ length: 200 }, (_, k) => `ك${(i + k * 5) % 900}ص`).join(" ")));
    let worst = 0;
    let last = Date.now();
    const beat = setInterval(() => ((worst = Math.max(worst, Date.now() - last)), (last = Date.now())), 5);
    await analyzeIsolated({ articles, topics });
    clearInterval(beat);
    expect(worst).toBeLessThan(400);
  });

  test("a run that takes too long is stopped with a timeout error", async () => {
    await expect(analyzeIsolated({ articles: CORPUS, topics: NOTES }, { timeoutMs: 1 })).rejects.toMatchObject({ code: "timeout" });
  });
});
