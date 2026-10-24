// Phase 5 acceptance (spec §11): a critique with an invented article number shows it as unverifiable and
// removes it from the text; no model answer before submission; prompts are versioned files.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { closeFts } = require("../../utils/law/fts");
const { LawCorpus } = require("../../models/lawCorpus");
const { LawSetting } = require("../../models/lawSetting");
const { LawSubject } = require("../../models/lawSubject");
const { LawMethod } = require("../../models/lawMethod");
const { LawFlashcard } = require("../../models/lawFlashcard");
const worker = require("../../utils/law/worker");
const router = require("../../utils/law/ai/router");
const { validateOutput, retrieveEvidence } = require("../../utils/law/grounding");
const { runChecks } = require("../../utils/law/dissertationChecks");
const { listPrompts } = require("../../utils/law/prompts");

jest.setTimeout(60000);
let tmp;
let storage;
let calls;
const ENV = process.env;

// Fake provider: returns whatever the test queued for the purpose, and records prompts.
let replies = {};
function fakeProviders() {
  const gen = (provider) => async (req) => {
    calls.push({ provider, purpose: req.purpose, text: req.parts.map((p) => p.text).join("\n") });
    const json = replies[req.purpose];
    if (!json) throw new Error(`no reply queued for ${req.purpose}`);
    return { text: JSON.stringify(json), json, model: "fake", usage: { tokensIn: 100, tokensOut: 50 } };
  };
  router.setClientFactory({ gemini: () => ({ generate: gen("gemini") }), deepseek: () => ({ generate: gen("deepseek") }) });
}

beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-method-"));
  process.env = { ...ENV, STORAGE_DIR: storage, DEEPSEEK_API_KEY: "k", DEEPSEEK_BASE_URL: "http://x", DEEPSEEK_MODEL_REASONING: "r" };
  tmp = await createTempDb();
  calls = [];
  replies = {};
  fakeProviders();
  await LawSetting.update({ aiBudgetDeepseekUsd: 5 });
  // Synthetic fixture text (not real statute text).
  const { import: imp } = await LawCorpus.createImport({
    codeSlug: "DOC",
    validFrom: "1913-08-12",
    text: "الفصل 77\nكل فعل ارتكبه الانسان عن بينة واختيار نص تجريبي يلزم بالتعويض.\nالفصل 78\nنص تجريبي عن الخطأ.",
  });
  await LawCorpus.commitImport(imp.id);
});
afterEach(async () => {
  closeFts();
  await tmp.cleanup();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

describe("grounding validator (spec §7.2)", () => {
  test("strips invented ids and bare article mentions, keeps resolved ones, relabels bad quotes", async () => {
    const { output, check } = await validateOutput({
      overall: "يطبق [DOC:77] هنا، وأيضا [DOC:999] وكذلك الفصل 555 من ق.ل.ع، أما الفصل 77 فصحيح.",
      rules: [
        { canonicalId: "DOC:77", quote: "عن بينة واختيار" },
        { canonicalId: "doc:٧٨", quote: "نص لا يوجد في الفصل" },
        { canonicalId: "CP:12345" },
      ],
    });
    expect(output.overall).toContain("[DOC:77]");
    expect(output.overall).not.toContain("999");
    expect(output.overall).not.toContain("555");
    expect(output.overall).toContain("الفصل 77");
    expect(output.rules.map((r) => r.canonicalId)).toEqual(["DOC:77", "DOC:78"]);
    expect(output.rules[0].quote).toBe("عن بينة واختيار");
    expect(output.rules[1]).toMatchObject({ quote: null, paraphrase: "نص لا يوجد في الفصل", quoteMismatch: true });
    expect(check.unresolved.sort()).toEqual(["CP:12345", "DOC:999"]);
    expect(check.strippedMentions).toEqual(["الفصل 555"]);
    expect(check.banner).toBe(true);
  });

  test("retrieval brings cited ids and key-term matches", async () => {
    const ev = await retrieveEvidence({ texts: ["الطالب يتحدث عن التعويض"], ids: ["DOC:78"] });
    expect(ev.map((e) => e.canonicalId)).toEqual(expect.arrayContaining(["DOC:78", "DOC:77"]));
  });
});

describe("cas pratique (acceptance)", () => {
  async function exercise() {
    const { subject } = await LawSubject.create({ name: "المسؤولية" });
    return (
      await LawMethod.createExercise({
        subjectId: subject.id,
        title: "حادثة",
        factsAr: "وقائع تجريبية: شخص تسبب في ضرر لغيره عن خطأ.",
        targetQualifications: ["DOC:77"],
      })
    ).exercise;
  }

  test("targets hidden, no critique or model answer before submission; invented article removed after", async () => {
    const ex = await exercise();
    expect(ex.targetQualifications).toBeNull();
    const { attempt } = await LawMethod.startAttempt(ex.id, { timed: true, preset: "attache" });
    expect(attempt.timeLimitSec).toBe(4 * 3600);
    expect((await LawMethod.modelAnswer(attempt.id)).status).toBe(409);
    expect((await LawMethod.submit(attempt.id)).error).toMatch(/write/);

    await LawMethod.savePhases(attempt.id, { 1: { text: "الوقائع المنتجة هي الضرر والخطأ والعلاقة السببية." }, 3: { text: "الفصل 77", citedIds: ["doc:٧٧"] } });
    replies.case_critique = {
      phases: [{ phase: 3, correct: ["استدعاء [DOC:77] صحيح"], missing: ["لم يذكر الفصل 1234"], wrong: [], rules: [{ canonicalId: "DOC:77" }, { canonicalId: "DOC:4242" }] }],
      rubric: { facts: 3, qualification: 2, rule: 9, application: 1, conclusion: 0 },
      overall: "عمل جيد، انظر [DOC:4242].",
      suggestedCards: [{ front: "ما أركان المسؤولية التقصيرية؟", back: "الخطأ والضرر والعلاقة السببية", canonicalIds: ["DOC:77", "DOC:4242"] }],
    };
    await LawMethod.submit(attempt.id);
    // Still no model answer while the critique is pending.
    expect((await LawMethod.modelAnswer(attempt.id)).status).toBe(409);
    const o = await worker.runOnce();
    expect([o.job.type, o.status]).toEqual(["critique_case", "succeeded"]);

    const a = await LawMethod.getAttempt(attempt.id);
    expect(a.status).toBe("critiqued");
    expect(a.citationCheck.banner).toBe(true);
    expect(a.citationCheck.unresolved).toEqual(["DOC:4242"]);
    expect(a.citationCheck.strippedMentions).toEqual(["الفصل 1234"]);
    expect(JSON.stringify(a.critique)).not.toMatch(/4242|1234/);
    expect(a.critique.phases[0].rules.map((r) => r.canonicalId)).toEqual(["DOC:77"]);
    expect(a.rubricScores.rule).toBe(4); // clamped
    expect(a.exercise.targetQualifications).toEqual(["DOC:77"]); // revealed after submission
    expect(a.suggestedCards[0].canonicalIds).toEqual(["DOC:77"]);
    // The prompt carried the corpus evidence by id.
    expect(calls[0].text).toContain("[DOC:77]");
    // Validation logged on the AI call.
    const logged = await db().lawAiCall.findFirst({ where: { purpose: "case_critique" } });
    expect(JSON.parse(logged.validation).unresolved).toEqual(["DOC:4242"]);

    // Suggested card → real flashcard, once.
    const c1 = await LawMethod.acceptSuggestedCard(attempt.id, 0);
    const c2 = await LawMethod.acceptSuggestedCard(attempt.id, 0);
    expect(c1.card.origin).toBe("failed_retrieval");
    expect(c2.card.id).toBe(c1.card.id);
    expect((await LawFlashcard.browse({})).total).toBe(1);

    // Model answer only now, and grounded too.
    replies.model_answer = { phases: [{ phase: 3, text: "يطبق [DOC:77] ولا يطبق [DOC:8888]", citations: [] }] };
    const m = await LawMethod.modelAnswer(attempt.id);
    expect(m.modelAnswer.phases[0].text).not.toContain("8888");
    expect(m.modelAnswer.citationCheck.unresolved).toEqual(["DOC:8888"]);
  });

  test("autosave is locked after submission", async () => {
    const ex = await exercise();
    const { attempt } = await LawMethod.startAttempt(ex.id);
    await LawMethod.savePhases(attempt.id, { 1: { text: "نص كاف للتسليم في المرحلة الأولى" } });
    replies.case_critique = { phases: [], overall: "حسن" };
    await LawMethod.submit(attempt.id);
    expect((await LawMethod.savePhases(attempt.id, { 1: { text: "تعديل بعد التسليم" } })).error).toMatch(/submitted/);
  });
});

describe("dissertation", () => {
  const draft = {
    topic: "المسؤولية التقصيرية",
    intro: { steps: ["إطار عام كاف للفحص", "تعريف كاف للفحص", "أهمية نظرية وعملية", "تطور تاريخي موجز", "إلى أي حد يحقق النظام الحماية؟", "سنعالج الموضوع في مبحثين"] },
    plan: {
      sections: [
        { title: "المبحث الأول: أساس المسؤولية", subsections: [{ title: "المطلب الأول: الخطأ" }, { title: "المطلب الثاني: الضرر" }] },
        { title: "المبحث الثاني: آثار المسؤولية", subsections: [{ title: "المطلب الأول: يلتزم المسؤول بالتعويض" }, { title: "المطلب الثاني: دعوى التعويض" }] },
      ],
    },
  };

  test("deterministic checks: bipartite ok, verb heading flagged for confirmation", () => {
    const c = Object.fromEntries(runChecks(draft).map((x) => [x.id, x]));
    expect(c.intro_steps.ok).toBe(true);
    expect(c.problematique.ok).toBe(true);
    expect(c.bipartite.ok).toBe(true);
    expect(c.noun_headings.ok).toBe(false);
    expect(c.noun_headings.needsConfirmation).toBe(true);
    expect(c.noun_headings.details).toEqual(["المطلب الأول: يلتزم المسؤول بالتعويض"]);
    const bad = runChecks({ intro: { steps: ["", "", "", "", "المشكل هو التعويض", ""] }, plan: { sections: [{ title: "أ", subsections: [{ title: "1" }] }] } });
    const b = Object.fromEntries(bad.map((x) => [x.id, x]));
    expect(b.intro_steps.ok).toBe(false);
    expect(b.problematique.ok).toBe(false);
    expect(b.bipartite.ok).toBe(false);
  });

  test("critique only once a draft exists; grounded and validated", async () => {
    const { dissertation } = await LawMethod.saveDissertation(null, { topic: "موضوع" });
    expect((await LawMethod.requestDissertationCritique(dissertation.id)).status).toBe(409);
    await LawMethod.saveDissertation(dissertation.id, draft);
    expect((await LawMethod.requestDissertationCritique(dissertation.id)).job.type).toBe("critique_dissertation");
    replies.dissertation_critique = { intro: [], plan: "جيد", content: { missing: [], wrong: [], rules: [{ canonicalId: "DOC:31337" }] }, overall: "راجع الفصل 31337." };
    expect((await worker.runOnce()).status).toBe("succeeded");
    const d = await LawMethod.getDissertation(dissertation.id);
    expect(d.status).toBe("critiqued");
    expect(d.citationCheck.banner).toBe(true);
    expect(d.critique.overall).not.toContain("31337");
    expect(d.ruleViolations.find((x) => x.id === "noun_headings").ok).toBe(false);
  });
});

describe("qualification drill", () => {
  test("verdict is grounded and normalized", async () => {
    const { subject } = await LawSubject.create({ name: "الجنائي" });
    const { card } = await LawFlashcard.create({ subjectId: subject.id, origin: "manual", type: "qualification", front: "وقائع تجريبية", back: "تكييف مرجعي", canonicalIds: ["DOC:77"] });
    expect((await LawMethod.nextDrills({})).map((c) => c.id)).toEqual([card.id]);
    replies.qualification_drill = { verdict: "maybe", explanation: "انظر [DOC:5050]", citations: [] };
    const r = await LawMethod.judgeDrill(card.id, "جواب الطالب");
    expect(r.result.verdict).toBe("partial");
    expect(r.result.explanation).not.toContain("5050");
    expect(r.result.reference).toBe("تكييف مرجعي");
  });
});

test("prompts are versioned files (acceptance)", () => {
  const ids = listPrompts().map((p) => `${p.id}.v${p.version}`);
  expect(ids).toEqual(expect.arrayContaining(["case_critique.v1", "dissertation_critique.v1", "qualification_drill.v1", "model_answer.v1"]));
  // No prompt text inlined in the route handlers.
  const routes = fs.readFileSync(path.join(__dirname, "../../endpoints/law/method.js"), "utf8");
  expect(routes).not.toMatch(/[؀-ۿ]{20,}/);
});
