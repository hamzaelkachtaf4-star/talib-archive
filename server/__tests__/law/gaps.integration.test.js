// Gap radar against a student's course. The course is built from the section titles of a real student notebook
// (finaaal.ctb: commercial capacity, the commercial registry, bookkeeping, the bill of exchange) with notes
// written for this test; the "statute" is an INVENTED fixture code (TCOM), not law: its text only exercises the
// rules. The dev corpus has no article text yet, so the radar must say so rather than guess.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { makeCtb, richText } = require("../../utils/law/testing/makeCtb");
const { rawDb } = require("../../utils/law/dbClient");
const { asUser } = require("../../utils/law/tenant");
const { closeFts } = require("../../utils/law/fts");
const { LawCourse } = require("../../models/lawCourse");
const { LawGap } = require("../../models/lawGap");
const { LawBrain } = require("../../models/lawBrain");
const { LawConsent } = require("../../models/lawConsent");

jest.setTimeout(60000);

let tmp, dir, ownerId, otherId, courseId;
const asOwner = (fn) => asUser(ownerId, fn);
const asOther = (fn) => asUser(otherId, fn);

// ---- invented statute fixture --------------------------------------------------------------------------------
const FIXTURE = [
  [1, ["الكتاب الأول", "الأهلية التجارية"], "يشترط لمباشرة التجارة بلوغ سن الرشد القانوني وتوافر الأهلية التجارية"],
  [2, ["الكتاب الأول", "الأهلية التجارية"], "يجوز للقاصر المأذون له من وليه ممارسة التجارة وفق الشروط المقررة"],
  [3, ["الكتاب الأول", "الأهلية التجارية"], "يتقادم حق إبطال تصرفات القاصر بمرور سنة من تاريخ بلوغه سن الرشد"],
  [4, ["الكتاب الأول", "السجل التجاري"], "يجب على كل تاجر طلب تقييده في السجل التجاري خلال ثلاثة أشهر من بدء نشاطه"],
  [5, ["الكتاب الأول", "السجل التجاري"], "يترتب على عدم التقييد في السجل التجاري عدم جواز الاحتجاج بصفة التاجر ويعاقب بغرامة"],
  [6, ["الكتاب الأول", "السجل التجاري"], "يمسك كاتب ضبط المحكمة السجل التجاري المحلي"],
  [7, ["الكتاب الأول", "مسك المحاسبة"], "يجب على كل تاجر مسك محاسبة منتظمة ودفاتر محاسبية"],
  [8, ["الكتاب الأول", "مسك المحاسبة"], "يجب الاحتفاظ بالوثائق المحاسبية مدة عشر سنوات من تاريخ إقفالها"],
  [9, ["الكتاب الثاني", "الكمبيالة"], "يشترط في الكمبيالة ذكر تاريخ الاستحقاق واسم المسحوب عليه"],
  [10, ["الكتاب الثاني", "الكمبيالة"], "تتقادم دعاوى حامل الكمبيالة ضد القابل بمرور ثلاث سنوات من تاريخ الاستحقاق"],
  [11, ["الكتاب الثاني", "الشيك"], "يجب أن يتضمن الشيك اسم المسحوب عليه ويعاقب من يصدر شيكا بدون رصيد بغرامة"],
  [12, ["الكتاب الثاني", "الشيك"], "يقدم الشيك للوفاء خلال ثمانية أيام من تاريخ إصداره"],
];

async function seedCorpus({ slug = "TCOM", articles = FIXTURE } = {}) {
  const code = await rawDb().lawCode.create({ data: { slug, family: slug, titleAr: "مدونة تجريبية (ليست قانونا)", numberingLabel: "المادة" } });
  for (const [n, heading, text] of articles) {
    const a = await rawDb().lawArticle.create({ data: { codeId: code.id, articleNumber: String(n), canonicalId: `${slug}:${n}`, headingPath: JSON.stringify(heading) } });
    await rawDb().lawArticleVersion.create({ data: { articleId: a.id, textAr: text, textNormalized: text, validFrom: new Date("2000-01-01"), checksum: `${slug}${n}` } });
  }
  return code;
}

// A concept the way an admin leaves it: created with its article references, then reviewed.
async function concept(slug, titleAr, refs, { reviewed = true } = {}) {
  await LawBrain.createConcept({ slug, titleAr, domain: "CIVIL", legalRefs: refs });
  const c = await rawDb().lawConcept.findUnique({ where: { slug } });
  if (reviewed) await LawBrain.updateConcept(c.id, { reviewed: true });
  return rawDb().lawConcept.findUnique({ where: { slug } });
}

const notebook = (over = {}) =>
  makeCtb(path.join(dir, "n.ctb"), [
    { id: 1, name: "القانون التجاري", seq: 1, txt: richText(["مدخل إلى القانون التجاري"]) },
    { id: 2, name: "شروط و ضوابط اكتساب صفة تاجر", parent: 1, seq: 1 },
    { id: 3, name: "توفر الأهلية التجارية", parent: 2, seq: 1 },
    { id: 4, name: "سن الرشد القانوني", parent: 3, seq: 1, txt: richText(["الأهلية التجارية تتطلب ", { b: "بلوغ سن الرشد القانوني" }, " وتوافر الأهلية التجارية الكاملة للتاجر"]) },
    { id: 5, name: "الاستثناءات الواردة على القاصر", parent: 3, seq: 2, txt: richText(["يمكن للقاصر المأذون له من وليه ممارسة التجارة وفق الشروط"]) },
    { id: 6, name: "الأثار المترتبة على اكتساب صفة تاجر", parent: 1, seq: 2 },
    { id: 7, name: "التقييد في السجل التجاري", parent: 6, seq: 1, txt: richText([over.registry || "السجل التجاري يمسكه كاتب ضبط المحكمة ويقيد فيه التجار"]) },
    { id: 8, name: "مسك المحاسبة التجارية", parent: 6, seq: 2, txt: richText(["يجب على التاجر مسك محاسبة منتظمة ودفاتر محاسبية"]) },
    { id: 9, name: "الأعمال التجارية الشكلية", parent: 1, seq: 3 },
    { id: 10, name: "الكمبيالة", parent: 9, seq: 1, txt: richText(["الكمبيالة يشترط فيها ذكر تاريخ الاستحقاق واسم المسحوب عليه"]) },
    ...(over.nodes || []),
  ]);

async function importCourse(over = {}) {
  const r = await asOwner(() => LawCourse.importCtb(notebook(over)));
  return r.courses[0].id;
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-gaps-"));
  process.env.STORAGE_DIR = dir;
  tmp = await createTempDb();
  ownerId = tmp.ownerId;
  otherId = (await tmp.client.users.create({ data: { username: "other-student", password: "!", role: "default" } })).id;
});
afterEach(async () => {
  closeFts();
  await tmp.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("analyze", () => {
  test("an empty corpus is reported as such, with nothing invented and nothing stored", async () => {
    await rawDb().lawCode.create({ data: { slug: "DOC", family: "DOC", titleAr: "قانون الالتزامات والعقود" } }); // like the dev DB: the shell, no articles
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["DOC", "CCOM"] }));
    expect(r.status).toBe("corpus_empty");
    expect(r.codes).toEqual([{ slug: "DOC", found: true, articles: 0 }, { slug: "CCOM", found: false, articles: 0 }]);
    expect(r.gaps).toEqual([]);
    expect(await rawDb().lawKnowledgeGap.count()).toBe(0);
    expect((await asOwner(() => LawCourse.outline(courseId))).course.status).toBe("READY");
  });

  test("finds what the notes skip, ranks it, and leaves covered articles alone", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    expect(r.status).toBe("ok");
    const ids = r.gaps.map((g) => g.canonicalId);
    expect(ids).toEqual(expect.arrayContaining(["TCOM:3", "TCOM:4", "TCOM:8", "TCOM:10"]));
    for (const covered of ["TCOM:1", "TCOM:2", "TCOM:6", "TCOM:9"]) expect(ids).not.toContain(covered);
    const by = Object.fromEntries(r.gaps.map((g) => [g.canonicalId, g]));
    expect(by["TCOM:3"].kind).toBe("PRESCRIPTION"); // the prescription rule of minors' acts is not in the notes
    expect(by["TCOM:4"]).toMatchObject({ kind: "PRESCRIPTION", areaTouched: true }); // the registry topic exists, the 3-month deadline is not in the notes
    const registryTopic = (await asOwner(() => LawCourse.outline(courseId))).topics.find((t) => t.title === "التقييد في السجل التجاري");
    expect(by["TCOM:4"].topicId).toBe(registryTopic.id);
    expect(by["TCOM:10"].kind).toBe("PRESCRIPTION");
    const missing = r.gaps.find((g) => g.kind === "MISSING_SECTION");
    expect(missing).toMatchObject({ sectionTitle: "الشيك" });
    expect(["TCOM:11", "TCOM:12"]).toContain(missing.canonicalId);
    expect(r.gaps.map((g) => g.severity)).toEqual([...r.gaps.map((g) => g.severity)].sort((a, b) => b - a));
    expect(by["TCOM:4"].severity).toBeGreaterThan(missing.severity); // a deadline in a topic the notes cover outranks a section they never reached
    expect((await asOwner(() => LawCourse.outline(courseId))).course.status).toBe("ANALYZED");
  });

  test("a note that restates the article but leaves out its deadline is a partial gap, ranked high", async () => {
    await seedCorpus();
    courseId = await importCourse({ registry: "يجب على كل تاجر طلب تقييده في السجل التجاري عند بدء نشاطه" });
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const g = r.gaps.find((x) => x.canonicalId === "TCOM:4");
    expect(g).toMatchObject({ kind: "PRESCRIPTION", partial: true });
    expect(g.coverage).toBeGreaterThanOrEqual(0.35);
    expect(g.explanationAr).toContain("الأجل");
    expect(g.severity).toBeGreaterThan(2);
  });

  test("every gap names a real article, quotes it verbatim and points at a real topic of the course", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const topics = new Set((await asOwner(() => LawCourse.outline(courseId))).topics.map((t) => t.id));
    for (const g of r.gaps) {
      const fixture = FIXTURE.find(([n]) => `TCOM:${n}` === g.canonicalId);
      expect(fixture).toBeTruthy();
      expect(g.quote).toBe(fixture[2]);
      if (g.topicId) expect(topics.has(g.topicId)).toBe(true);
      expect(g.explanationAr.length).toBeGreaterThan(10);
    }
  });

  test("re-analysing is idempotent and keeps what the student decided", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const target = first.gaps.find((g) => g.canonicalId === "TCOM:4");
    await asOwner(() => LawGap.setStatus(courseId, target.id, "DISMISSED"));
    const second = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    expect(second.gaps.map((g) => g.id).sort()).toEqual(first.gaps.map((g) => g.id).sort());
    expect(second.gaps.find((g) => g.id === target.id).status).toBe("DISMISSED");
    expect(await rawDb().lawKnowledgeGap.count()).toBe(first.gaps.length);
  });

  test("a gap the student closes by writing it into the notes disappears at the next analysis", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    expect(first.gaps.some((g) => g.canonicalId === "TCOM:4")).toBe(true);
    const edited = notebook({}); // same notebook, the registry topic now states the deadline
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(edited);
    raw.prepare("UPDATE node SET txt = ? WHERE node_id = 7").run(richText(["السجل التجاري يمسكه كاتب ضبط المحكمة ويجب على التاجر طلب تقييده خلال ثلاثة أشهر من بدء نشاطه"]));
    raw.close();
    const replaced = await asOwner(() => LawCourse.importCtb(edited, { replace: true }));
    const again = await asOwner(() => LawGap.analyze(replaced.courses[0].id, { codes: ["TCOM"] }));
    expect(again.gaps.some((g) => g.canonicalId === "TCOM:4")).toBe(false);
    expect(again.gaps.some((g) => g.canonicalId === "TCOM:3")).toBe(true); // the others remain
  });

  test("bad input: unknown course, bad code list, a course that is still importing", async () => {
    await seedCorpus();
    expect(await asOwner(() => LawGap.analyze("nope", { codes: ["TCOM"] }))).toEqual({ error: "not_found" });
    courseId = await importCourse();
    expect((await asOwner(() => LawGap.analyze(courseId, { codes: "TCOM" }))).error).toBe("invalid_codes");
    expect((await asOwner(() => LawGap.analyze(courseId, { codes: ["bad slug!"] }))).error).toBe("invalid_codes");
    expect((await asOwner(() => LawGap.analyze(courseId, { codes: [] }))).error).toBe("invalid_codes");
    await rawDb().lawStudentCourse.update({ where: { id: courseId }, data: { status: "IMPORTING" } });
    expect(await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }))).toEqual({ error: "not_found" });
  });

  test("a repealed code (not in force today) is not used", async () => {
    const code = await seedCorpus();
    await rawDb().lawCode.update({ where: { id: code.id }, data: { inForceTo: new Date("2010-01-01") } });
    courseId = await importCourse();
    expect((await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }))).status).toBe("corpus_empty");
  });

  test("the article text used is the version in force at the requested date", async () => {
    await seedCorpus();
    const art = await rawDb().lawArticle.findUnique({ where: { canonicalId: "TCOM:4" } });
    await rawDb().lawArticleVersion.updateMany({ where: { articleId: art.id }, data: { validTo: new Date("2020-01-01") } });
    await rawDb().lawArticleVersion.create({ data: { articleId: art.id, textAr: "يجب على كل تاجر طلب تقييده في السجل التجاري خلال شهر واحد من بدء نشاطه", textNormalized: "x", validFrom: new Date("2020-01-01"), checksum: "TCOM4b" } });
    courseId = await importCourse();
    const now = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    expect(now.gaps.find((g) => g.canonicalId === "TCOM:4").quote).toContain("شهر واحد");
    const then = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"], at: new Date("2015-06-01") }));
    expect(then.gaps.find((g) => g.canonicalId === "TCOM:4").quote).toContain("ثلاثة أشهر");
  });
});

describe("isolation", () => {
  test("another student cannot analyse, list, change or read the readiness of a course that is not theirs", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const gapId = r.gaps[0].id;
    expect(await asOther(() => LawGap.analyze(courseId, { codes: ["TCOM"] }))).toEqual({ error: "not_found" });
    expect(await asOther(() => LawGap.list(courseId))).toEqual({ error: "not_found" });
    expect(await asOther(() => LawGap.setStatus(courseId, gapId, "DISMISSED"))).toEqual({ error: "not_found" });
    expect(await asOther(() => LawGap.readiness(courseId))).toEqual({ error: "not_found" });
    expect((await rawDb().lawKnowledgeGap.findUnique({ where: { id: gapId } })).status).toBe("OPEN");
  });

  test("status changes accept only what a student may choose", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const id = r.gaps[0].id;
    expect((await asOwner(() => LawGap.setStatus(courseId, id, "RESOLVED"))).error).toBe("invalid_status");
    expect((await asOwner(() => LawGap.setStatus(courseId, id, "CONFIRMED"))).gap.status).toBe("CONFIRMED");
    expect((await asOwner(() => LawGap.setStatus(courseId, id, "OPEN"))).gap.status).toBe("OPEN");
  });
});

describe("diagnostic readiness and the Brain", () => {
  const accept = (id) => LawConsent.accept(id, { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: LawConsent.CONSENT_VERSION || "1.1.0" });

  test("readiness lists the top open gaps with the verbatim article, the concept and the confusion pair when they exist", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const a = await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }]);
    const b = await concept("capacite-majeur", "أهلية الراشد", [{ slug: "TCOM", number: "1" }]);
    await LawBrain.createPair({ conceptAId: a.id, conceptBId: b.id, labelAr: "أهلية القاصر ↔ الراشد" });
    await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const ready = await asOwner(() => LawGap.readiness(courseId, { limit: 5 }));
    expect(ready.candidates.length).toBe(5);
    expect(ready.enough).toBe(true);
    expect(ready.candidates.map((c) => c.severity)).toEqual([...ready.candidates.map((c) => c.severity)].sort((x, y) => y - x));
    const three = ready.candidates.find((c) => c.canonicalId === "TCOM:3");
    expect(three).toMatchObject({ conceptId: a.id, brainReady: true });
    expect(three.pair).toMatchObject({ labelAr: "أهلية القاصر ↔ الراشد" });
    expect(three.article).toBe(FIXTURE[2][2]); // the verbatim text a drill must be written from
    const noConcept = ready.candidates.find((c) => c.canonicalId === "TCOM:4");
    expect(noConcept).toMatchObject({ conceptId: "", brainReady: false, pair: null });
    expect(ready.summary).toMatchObject({ withConcept: expect.any(Number), open: expect.any(Number) });
  });

  test("dismissed gaps are never offered; an article that left the corpus is dropped, not guessed", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    await asOwner(() => LawGap.setStatus(courseId, r.gaps[0].id, "DISMISSED"));
    const gone = r.gaps[1];
    await rawDb().lawArticle.delete({ where: { canonicalId: gone.canonicalId } });
    const ready = await asOwner(() => LawGap.readiness(courseId, { limit: 50 }));
    const offered = ready.candidates.map((c) => c.gapId);
    expect(offered).not.toContain(r.gaps[0].id);
    expect(offered).not.toContain(gone.id);
    expect(ready.summary.stale).toBe(1);
  });

  test("a missed diagnostic question suspects, a second one confirms; a hit resolves the gap", async () => {
    await seedCorpus();
    courseId = await importCourse();
    await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }, { slug: "TCOM", number: "2" }]);
    await accept(ownerId);
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const gap = r.gaps.find((g) => g.canonicalId === "TCOM:3");
    const yesterday = new Date(Date.now() - 86400000);
    const first = await asOwner(() => LawGap.recordDiagnosticMiss(gap.id, { at: yesterday }));
    expect(first.memory).toMatchObject({ kind: "GAP", status: "SUSPECTED" });
    expect(first.gap.status).toBe("DRILLED");
    const second = await asOwner(() => LawGap.recordDiagnosticMiss(gap.id)); // another day: a second, independent miss
    expect(second.memory.status).toBe("ACTIVE");
    expect(await rawDb().lawLearnerEvidence.count({ where: { source: "DIAGNOSTIC", refId: gap.id } })).toBe(2);
    const hit = await asOwner(() => LawGap.recordDiagnosticHit(gap.id));
    expect(hit.gap.status).toBe("RESOLVED");
  });

  test("with the student's memory switched off nothing is recorded, but the gap is still marked as drilled", async () => {
    await seedCorpus();
    courseId = await importCourse();
    await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }]);
    await accept(ownerId);
    await rawDb().lawUserPreferences.upsert({ where: { userId: ownerId }, update: { memoryEnabled: false }, create: { userId: ownerId, memoryEnabled: false } });
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const gap = r.gaps.find((g) => g.canonicalId === "TCOM:3");
    const out = await asOwner(() => LawGap.recordDiagnosticMiss(gap.id));
    expect(out.memory).toBeNull();
    expect(out.gap.status).toBe("DRILLED");
    expect(await rawDb().lawLearnerEvidence.count()).toBe(0);
  });

  test("a gap with no reviewed concept records no Brain memory (the taxonomy stays closed)", async () => {
    await seedCorpus();
    courseId = await importCourse();
    await accept(ownerId);
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const gap = r.gaps.find((g) => g.canonicalId === "TCOM:4");
    expect((await asOwner(() => LawGap.recordDiagnosticMiss(gap.id))).memory).toBeNull();
    expect(await rawDb().lawLearnerMemory.count()).toBe(0);
  });

  test("another student's gap cannot be recorded against", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    expect(await asOther(() => LawGap.recordDiagnosticMiss(r.gaps[0].id))).toEqual({ error: "not_found" });
  });
});

describe("brain: only reviewed concepts, never farmed", () => {
  const accept = (id) => LawConsent.accept(id, { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: LawConsent.CONSENT_VERSION || "1.1.0" });
  const gapFor = async (id = "TCOM:3") => (await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }))).gaps.find((g) => g.canonicalId === id);

  test("a concept that exists but is not reviewed is not attached, and no memory is written", async () => {
    await seedCorpus();
    courseId = await importCourse();
    await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }], { reviewed: false });
    await accept(ownerId);
    const gap = await gapFor();
    expect(gap.conceptId).toBe("");
    const ready = await asOwner(() => LawGap.readiness(courseId));
    expect(ready.candidates.find((c) => c.canonicalId === "TCOM:3").brainReady).toBe(false);
    for (let i = 0; i < 3; i++) expect((await asOwner(() => LawGap.recordDiagnosticMiss(gap.id, { at: new Date(Date.now() - i * 86400000) }))).memory).toBeNull();
    expect(await rawDb().lawLearnerMemory.count()).toBe(0);
  });

  test("a concept an admin un-reviews after the analysis stops feeding the Brain", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const c = await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }]);
    await accept(ownerId);
    const gap = await gapFor();
    expect(gap.conceptId).toBe(c.id);
    await rawDb().lawConcept.update({ where: { id: c.id }, data: { reviewed: false } });
    expect((await asOwner(() => LawGap.recordDiagnosticMiss(gap.id))).memory).toBeNull();
    expect(await rawDb().lawLearnerEvidence.count()).toBe(0);
  });

  test("concept references are matched however the slug was typed (the corpus resolves 'tcom:3' too)", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const c = await concept("capacite-mineur", "أهلية القاصر", [{ slug: "tcom", number: "3" }]);
    expect((await gapFor()).conceptId).toBe(c.id);
  });

  test("the same gap cannot be farmed: one piece of evidence per gap per day, and closed gaps record nothing", async () => {
    await seedCorpus();
    courseId = await importCourse();
    await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }]);
    await accept(ownerId);
    const gap = await gapFor();
    const first = await asOwner(() => LawGap.recordDiagnosticMiss(gap.id));
    const second = await asOwner(() => LawGap.recordDiagnosticMiss(gap.id));
    expect(first.memory.status).toBe("SUSPECTED");
    expect(second.memory.status).toBe("SUSPECTED"); // not confirmed by repeating the same question the same day
    expect(await rawDb().lawLearnerEvidence.count({ where: { source: "DIAGNOSTIC" } })).toBe(1);
    await asOwner(() => LawGap.setStatus(courseId, gap.id, "DISMISSED"));
    expect((await asOwner(() => LawGap.recordDiagnosticMiss(gap.id))).error).toBe("gap_closed");
  });

  test("a concept in a confusion pair and the student's own links raise a gap's severity", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const base = (await gapFor("TCOM:3")).severity;
    const a = await concept("capacite-mineur", "أهلية القاصر", [{ slug: "TCOM", number: "3" }]);
    const b = await concept("capacite-majeur", "أهلية الراشد", [{ slug: "TCOM", number: "1" }]);
    await LawBrain.createPair({ conceptAId: a.id, conceptBId: b.id, labelAr: "القاصر ↔ الراشد" });
    const paired = (await gapFor("TCOM:3")).severity;
    expect(paired).toBeGreaterThan(base);
    const art3 = await rawDb().lawArticle.findUnique({ where: { canonicalId: "TCOM:3" } });
    for (let i = 0; i < 4; i++) await rawDb().lawLink.create({ data: { userId: ownerId, fromType: "noteAtom", fromId: `n${i}`, toType: "article", toId: art3.id, relation: "references" } });
    expect((await gapFor("TCOM:3")).severity).toBeGreaterThan(paired);
  });
});

describe("re-analysis never wipes what the radar did not re-judge", () => {
  const analyze = (codes = ["TCOM"]) => asOwner(() => LawGap.analyze(courseId, { codes }));

  test("analysing another code leaves this code's gaps and the student's decisions alone", async () => {
    await seedCorpus();
    await seedCorpus({ slug: "TCIV", articles: [[1, ["الكتاب الأول", "الأهلية التجارية"], "يتقادم حق الطعن بمرور ثلاثين يوما من تاريخ التبليغ"]] });
    courseId = await importCourse();
    const first = await analyze();
    const confirmed = first.gaps.find((g) => g.canonicalId === "TCOM:3");
    await asOwner(() => LawGap.setStatus(courseId, confirmed.id, "CONFIRMED"));
    await analyze(["TCIV"]);
    const rows = await rawDb().lawKnowledgeGap.findMany({ where: { courseId, canonicalId: { startsWith: "TCOM:" } } });
    expect(rows.length).toBe(first.gaps.length);
    expect(rows.find((r) => r.id === confirmed.id).status).toBe("CONFIRMED");
  });

  test("a gap that falls out of the stored top-N is still 'detected': it is neither deleted nor treated as covered", async () => {
    const L = "ابجدهزحطيكلمنسعفصقرشتثخذضظغ".split("");
    const w = (i, k) => `${L[(i + k) % L.length]}${L[(i * 3 + k * 5 + 1) % L.length]}${L[(i * 7 + k * 2 + 2) % L.length]}ن`;
    const batch = (from, n, tail) => Array.from({ length: n }, (_, i) => [100 + from + i, ["الكتاب الأول", "السجل التجاري"], `يجب على التاجر ${w(from + i, 1)} ${w(from + i, 2)} ${w(from + i, 3)} ${w(from + i, 4)} ${tail}`]);
    const code = await seedCorpus({ articles: [...FIXTURE, ...batch(0, 90, "والسجل")] });
    courseId = await importCourse();
    const first = await analyze();
    expect(first.gaps.length).toBe(60); // the stored list is capped
    const lowest = first.gaps[first.gaps.length - 1];
    expect(lowest.status).toBe("OPEN");
    // ten more articles, each with a deadline: they outrank the old tail, which falls out of the top 60
    for (const [n, heading, text] of batch(500, 10, "خلال ثلاثة أشهر")) {
      const a = await rawDb().lawArticle.create({ data: { codeId: code.id, articleNumber: String(n), canonicalId: `TCOM:${n}`, headingPath: JSON.stringify(heading) } });
      await rawDb().lawArticleVersion.create({ data: { articleId: a.id, textAr: text, textNormalized: text, validFrom: new Date("2000-01-01"), checksum: `x${n}` } });
    }
    const second = await analyze();
    // the ten new deadline articles now lead the ranking, so the old tail is no longer among the 60 re-scored rows...
    expect(second.gaps.slice(0, 10).every((g) => Number(g.canonicalId.split(":")[1]) >= 500)).toBe(true);
    // ...but it is still a detected gap, so it is neither deleted nor marked covered
    expect(await rawDb().lawKnowledgeGap.findUnique({ where: { id: lowest.id } })).toMatchObject({ status: "OPEN" });
  });

  test("when the notes really do cover it now, an open gap goes and a confirmed one is marked covered; if it comes back it reopens", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await analyze();
    const open = first.gaps.find((g) => g.canonicalId === "TCOM:4");
    const conf = first.gaps.find((g) => g.canonicalId === "TCOM:3");
    await asOwner(() => LawGap.setStatus(courseId, conf.id, "CONFIRMED"));
    const topic = (await rawDb().lawCourseTopic.findMany({ where: { courseId } })).find((t) => t.title === "التقييد في السجل التجاري");
    const original = topic.text;
    await rawDb().lawCourseTopic.update({
      where: { id: topic.id },
      data: { text: `${original} يجب على كل تاجر طلب تقييده في السجل التجاري خلال ثلاثة أشهر من بدء نشاطه. يتقادم حق إبطال تصرفات القاصر بمرور سنة من تاريخ بلوغه سن الرشد` },
    });
    await analyze();
    expect(await rawDb().lawKnowledgeGap.findUnique({ where: { id: open.id } })).toBeNull();
    expect((await rawDb().lawKnowledgeGap.findUnique({ where: { id: conf.id } })).status).toBe("COVERED");
    await rawDb().lawCourseTopic.update({ where: { id: topic.id }, data: { text: original } });
    await analyze();
    expect((await rawDb().lawKnowledgeGap.findUnique({ where: { id: conf.id } })).status).toBe("OPEN");
  });

  test("a gap the student resolved through a correct answer stays resolved when it is detected again", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await analyze();
    const g = first.gaps.find((x) => x.canonicalId === "TCOM:3");
    await asOwner(() => LawGap.recordDiagnosticHit(g.id));
    await analyze();
    expect((await rawDb().lawKnowledgeGap.findUnique({ where: { id: g.id } })).status).toBe("RESOLVED");
  });
});

describe("concurrency and odd input", () => {
  test("two analyses of one course at once both succeed and leave one consistent set", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const [a, b] = await Promise.all([asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] })), asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }))]);
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    expect(await rawDb().lawKnowledgeGap.count({ where: { courseId } })).toBe(a.gaps.length);
  });

  test("a course deleted while it is being analysed is 'not found', not a server error", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const orig = rawDb().lawCode.findMany;
    const spy = jest.spyOn(rawDb().lawCode, "findMany").mockImplementation(async (...a) => {
      await asOwner(() => LawCourse.remove(courseId));
      return orig.apply(rawDb().lawCode, a);
    });
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    spy.mockRestore();
    expect(r).toEqual({ error: "not_found" });
    expect(await rawDb().lawKnowledgeGap.count()).toBe(0);
  });

  test("duplicate code slugs are counted once; an invalid date is rejected", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const r = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM", "TCOM"] }));
    expect(r.codes.map((c) => c.slug)).toEqual(["TCOM"]);
    expect((await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"], at: new Date("nope") }))).error).toBe("invalid_date");
  });

  test("readiness does not offer an article whose code has been repealed since the analysis", async () => {
    const code = await seedCorpus();
    courseId = await importCourse();
    await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    await rawDb().lawCode.update({ where: { id: code.id }, data: { inForceTo: new Date("2020-01-01") } });
    const ready = await asOwner(() => LawGap.readiness(courseId, { limit: 20 }));
    expect(ready.candidates).toEqual([]);
    expect(ready.summary.stale).toBeGreaterThan(0);
  });
});

describe("replacing a course keeps the student's decisions", () => {
  const edited = (txt) => {
    const f = notebook();
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(f);
    raw.prepare("UPDATE node SET txt = ? WHERE node_id = 8").run(richText([txt]));
    raw.close();
    return f;
  };

  test("dismissed and confirmed gaps are carried to the new course and survive the next analysis", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const dismissed = first.gaps.find((g) => g.canonicalId === "TCOM:4");
    const confirmed = first.gaps.find((g) => g.canonicalId === "TCOM:3");
    await asOwner(() => LawGap.setStatus(courseId, dismissed.id, "DISMISSED"));
    await asOwner(() => LawGap.setStatus(courseId, confirmed.id, "CONFIRMED"));

    const replaced = await asOwner(() => LawCourse.importCtb(edited("يجب على التاجر مسك محاسبة منتظمة ودفاتر محاسبية ومراجعتها"), { replace: true }));
    expect(replaced.courses[0].status).toBe("replaced");
    const newId = replaced.courses[0].id;
    expect(newId).not.toBe(courseId);
    expect(replaced.courses[0].carriedGaps).toBe(2);
    const carried = await asOwner(() => LawGap.list(newId));
    expect(carried.gaps.map((g) => [g.canonicalId, g.status]).sort()).toEqual([["TCOM:3", "CONFIRMED"], ["TCOM:4", "DISMISSED"]]);
    expect(carried.gaps.find((g) => g.canonicalId === "TCOM:4").quote).toBe(FIXTURE[3][2]);
    // the topic pointer follows the topic with the same heading path in the new course
    const outline = await asOwner(() => LawCourse.outline(newId));
    const registry = outline.topics.find((t) => t.title === "التقييد في السجل التجاري");
    expect(carried.gaps.find((g) => g.canonicalId === "TCOM:4").topicId).toBe(registry.id);

    const again = await asOwner(() => LawGap.analyze(newId, { codes: ["TCOM"] }));
    expect(again.gaps.find((g) => g.canonicalId === "TCOM:4").status).toBe("DISMISSED"); // still not offered
    expect(again.gaps.find((g) => g.canonicalId === "TCOM:3").status).toBe("CONFIRMED");
    const ready = await asOwner(() => LawGap.readiness(newId, { limit: 50 }));
    expect(ready.candidates.map((c) => c.canonicalId)).not.toContain("TCOM:4");
  });

  test("open suggestions are not carried (they are recomputed); other decisions keep their status", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const [a, b, c] = first.gaps.slice(0, 3);
    await rawDb().lawKnowledgeGap.update({ where: { id: a.id }, data: { status: "RESOLVED" } });
    await rawDb().lawKnowledgeGap.update({ where: { id: b.id }, data: { status: "DRILLED" } });
    await rawDb().lawKnowledgeGap.update({ where: { id: c.id }, data: { status: "COVERED" } });
    const replaced = await asOwner(() => LawCourse.importCtb(edited("نص معدل تماما عن المحاسبة"), { replace: true }));
    const rows = await rawDb().lawKnowledgeGap.findMany({ where: { courseId: replaced.courses[0].id } });
    expect(rows.map((r) => r.status).sort()).toEqual(["COVERED", "DRILLED", "RESOLVED"]);
    expect(replaced.courses[0].carriedGaps).toBe(3);
  });

  test("a topic that no longer exists leaves the pointer empty instead of dangling", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    const g = first.gaps.find((x) => x.canonicalId === "TCOM:4");
    await asOwner(() => LawGap.setStatus(courseId, g.id, "DISMISSED"));
    const f = notebook();
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(f);
    raw.prepare("UPDATE node SET name = ? WHERE node_id = 7").run("موضوع تغير اسمه");
    raw.close();
    const replaced = await asOwner(() => LawCourse.importCtb(f, { replace: true }));
    const carried = await asOwner(() => LawGap.list(replaced.courses[0].id));
    expect(carried.gaps[0]).toMatchObject({ canonicalId: "TCOM:4", status: "DISMISSED", topicId: null });
  });


  test("the copy happens while the new course is still invisible (importing), before it becomes READY", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    await asOwner(() => LawGap.setStatus(courseId, first.gaps[0].id, "DISMISSED"));
    const copiedWhenReady = [];
    const orig = rawDb().lawStudentCourse.update;
    const spy = jest.spyOn(rawDb().lawStudentCourse, "update").mockImplementation(async (a) => {
      if (a.data.status === "READY") copiedWhenReady.push(await rawDb().lawKnowledgeGap.count({ where: { courseId: a.where.id } }));
      return orig.call(rawDb().lawStudentCourse, a);
    });
    await asOwner(() => LawCourse.importCtb(edited("نص معدل بعد القرار"), { replace: true }));
    spy.mockRestore();
    // when the replacement became visible (READY) the decision was already in it: no window for an analysis to collide
    expect(copiedWhenReady).toEqual([1]);
  });

  test("if the decisions cannot be copied, the replacement is abandoned and the old course (with its decisions) stays", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    await asOwner(() => LawGap.setStatus(courseId, first.gaps[0].id, "DISMISSED"));
    await asOwner(() => LawGap.setStatus(courseId, first.gaps[1].id, "CONFIRMED"));
    const orig = rawDb().$transaction.bind(rawDb());
    let calls = 0;
    const spy = jest.spyOn(rawDb(), "$transaction").mockImplementation((...a) => {
      // the topic inserts are transactions too: fail only the one that copies the decisions (the last one)
      calls++;
      const list = a[0];
      if (Array.isArray(list) && list.length === 2 && calls > 1) return Promise.reject(new Error("disk full"));
      return orig(...a);
    });
    const r = await asOwner(() => LawCourse.importCtb(edited("نص معدل بعد القرار"), { replace: true }));
    spy.mockRestore();
    expect(r.error).toBe("import_failed");
    expect(await rawDb().lawStudentCourse.count()).toBe(1);
    const rows = await rawDb().lawKnowledgeGap.findMany({ where: { courseId } });
    expect(rows.filter((g) => g.status !== "OPEN").map((g) => g.status).sort()).toEqual(["CONFIRMED", "DISMISSED"]);
    expect(await rawDb().lawKnowledgeGap.count()).toBe(rows.length); // nothing half-copied anywhere
  });

  test("another student's decisions are never copied, and a first import carries nothing", async () => {
    await seedCorpus();
    courseId = await importCourse();
    const first = await asOwner(() => LawGap.analyze(courseId, { codes: ["TCOM"] }));
    await asOwner(() => LawGap.setStatus(courseId, first.gaps[0].id, "DISMISSED"));
    const theirs = await asOther(() => LawCourse.importCtb(notebook()));
    expect(theirs.courses[0].carriedGaps).toBeUndefined();
    expect(await asOther(() => LawGap.list(theirs.courses[0].id))).toEqual({ gaps: [] });
    const replacedByOther = await asOther(() => LawCourse.importCtb(edited("نص آخر"), { replace: true }));
    expect(replacedByOther.courses[0].carriedGaps ?? 0).toBe(0);
    expect((await asOther(() => LawGap.list(replacedByOther.courses[0].id))).gaps).toEqual([]);
  });
});
