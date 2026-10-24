// Phase 4 acceptance (spec §11): Exam Mode shows only PROF+TEXT (accepted); lockdown triggers at N days;
// every PROF atom jumps to its audio timestamp or page. Plus provenance rules, Mention Bridge and the
// candidate-atoms pipeline (fake Gemini).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { startFakeGemini } = require("../../utils/law/testing/fakeGemini");
const { db } = require("../../utils/law/dbClient");
const { closeFts } = require("../../utils/law/fts");
const { LawSubject } = require("../../models/lawSubject");
const { LawAtom } = require("../../models/lawAtom");
const { LawLenses } = require("../../models/lawLenses");
const { LawInbox } = require("../../models/lawInbox");
const { LawSetting } = require("../../models/lawSetting");
const { LawCorpus } = require("../../models/lawCorpus");
const { LawDecision } = require("../../models/lawDecision");
const { LawDoctrine } = require("../../models/lawDoctrine");
const { LawUpload } = require("../../models/lawUpload");
const { LawBatch } = require("../../models/lawBatch");
const worker = require("../../utils/law/worker");
const router = require("../../utils/law/ai/router");
const { geminiClient } = require("../../utils/law/ai/gemini");
const { deepseekClient } = require("../../utils/law/ai/deepseek");
const { parseOutline } = require("../../utils/law/coursePlan");

jest.setTimeout(60000);
let tmp;
let storage;
let fake;
const ENV = process.env;
beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-notes-"));
  fake = await startFakeGemini();
  process.env = { ...ENV, STORAGE_DIR: storage, GEMINI_API_KEY: "k", GEMINI_BASE_URL: fake.url, GEMINI_MODEL_MULTIMODAL: "m", GEMINI_MODEL_FAST: "f" };
  router.setClientFactory({ gemini: (c) => geminiClient(c.gemini), deepseek: (c) => deepseekClient(c.deepseek) });
  tmp = await createTempDb();
  await LawSetting.update({ aiBudgetGeminiUsd: 10 });
});
afterEach(async () => {
  closeFts();
  await tmp.cleanup();
  await fake.close();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

const PLAN = parseOutline("المبحث الأول\n  المطلب الأول\n  المطلب الثاني\nالمبحث الثاني");
let n = 0;
async function asset(mime = "audio/webm") {
  const data = crypto.randomBytes(400);
  const { upload } = await LawUpload.init({ clientCaptureId: `notes-${++n}-abcdef`, sha256: crypto.createHash("sha256").update(data).digest("hex"), bytes: 400, mime });
  await LawUpload.putChunk(upload.uploadId, 0, data);
  return (await LawUpload.complete(upload.uploadId)).asset;
}

async function setup() {
  const { subject } = await LawSubject.create({ name: "الالتزامات", coursePlan: PLAN });
  await LawCorpus.createImport({ codeSlug: "DOC", validFrom: "1913-08-12", text: "الفصل 230\nنص تجريبي." }).then((r) => LawCorpus.commitImport(r.import.id));
  const version = await db().lawArticleVersion.findFirst();
  const audio = await asset();
  return { subject, version, audio };
}

describe("provenance rules", () => {
  test("each provenance needs its source", async () => {
    const { subject, version, audio } = await setup();
    const base = { subjectId: subject.id, body: "نص" };
    expect((await LawAtom.create({ ...base, provenance: "PROF" })).error).toMatch(/source asset/);
    expect((await LawAtom.create({ ...base, provenance: "PROF", sourceAssetId: audio.id })).error).toMatch(/timestamp or a page/);
    expect((await LawAtom.create({ ...base, provenance: "PROF", sourceAssetId: audio.id, sourceTimestampSec: 61 })).atom.provenance).toBe("PROF");
    expect((await LawAtom.create({ ...base, provenance: "TEXT", articleVersionId: "nope" })).error).toMatch(/article version/);
    expect((await LawAtom.create({ ...base, provenance: "TEXT", articleVersionId: version.id })).atom).toBeTruthy();
    expect((await LawAtom.create({ ...base, provenance: "JURIS" })).error).toMatch(/decision/);
    expect((await LawAtom.create({ ...base, provenance: "MINE" })).atom).toBeTruthy();
    expect((await LawAtom.create({ ...base, provenance: "AI" })).error).toMatch(/provenance/);
  });
});

describe("two lenses (acceptance)", () => {
  test("Exam Mode: only accepted PROF + TEXT, plan order, divergence marker without content", async () => {
    const { subject, version, audio } = await setup();
    const { decision } = await LawDecision.create({ decisionNumber: "1", decisionDate: "2020-01-01" });
    const mk = (x) => LawAtom.create({ subjectId: subject.id, body: x.body, ...x });
    await mk({ body: "prof-2", provenance: "PROF", sourceAssetId: audio.id, sourceTimestampSec: 5, headingPath: ["المبحث الثاني"] });
    await mk({ body: "prof-1", provenance: "PROF", sourceAssetId: audio.id, sourceTimestampSec: 1, headingPath: ["المبحث الأول", "المطلب الأول"], profDivergent: true });
    await mk({ body: "text-1", provenance: "TEXT", articleVersionId: version.id, headingPath: ["المطلب الثاني"] });
    await mk({ body: "prof-unaccepted", provenance: "PROF", sourceAssetId: audio.id, sourcePage: 2, verificationStatus: "unverified" });
    await mk({ body: "juris", provenance: "JURIS", decisionId: decision.id });
    await mk({ body: "mine", provenance: "MINE" });

    const exam = await LawLenses.content(subject.id, { mode: "exam" });
    expect(exam.atoms.map((a) => a.body)).toEqual(["prof-1", "text-1", "prof-2"]);
    expect(exam.atoms.every((a) => ["PROF", "TEXT"].includes(a.provenance))).toBe(true);
    expect(exam.atoms[0].divergenceMarker).toBe("الأستاذ يتبنى رأيا");
    expect(exam.atoms[1].article.canonicalId).toBe("DOC:230");

    const jurist = await LawLenses.content(subject.id, { mode: "jurist" });
    const bodies = jurist.groups.flatMap((g) => g.atoms.map((a) => a.body));
    expect(bodies).toEqual(expect.arrayContaining(["juris", "mine", "prof-unaccepted", "prof-1"]));
  });

  test("lockdown: Exam is the default within N days, Jurist otherwise (N from settings)", async () => {
    const { subject } = await setup();
    const now = new Date();
    const inDays = (d) => new Date(now.getTime() + d * 86400000).toISOString();
    await LawSubject.update(subject.id, { examDate: inDays(9) });
    expect((await LawLenses.content(subject.id, { now })).mode).toBe("exam");
    await LawSubject.update(subject.id, { examDate: inDays(12) });
    expect((await LawLenses.content(subject.id, { now })).mode).toBe("jurist");
    await LawSetting.update({ examLockdownDays: 14 });
    const c = await LawLenses.content(subject.id, { now });
    expect([c.mode, c.lockdown]).toEqual(["exam", true]);
    // Never blocks: Jurist on request.
    expect((await LawLenses.content(subject.id, { now, mode: "jurist" })).mode).toBe("jurist");
  });

  test("Mention Bridge: ≤2 per topic, one verified JURIS + one DOCTRINE", async () => {
    const { subject, audio } = await setup();
    const { decision } = await LawDecision.create({ decisionNumber: "7", decisionDate: "2021-01-01" });
    const { doctrine } = await LawDoctrine.create({ author: "أ", work: "ب", paraphrase: "ج" });
    const topic = { headingPath: ["المطلب الأول"] };
    const j = await LawAtom.create({ subjectId: subject.id, provenance: "JURIS", body: "j", decisionId: decision.id, ...topic });
    expect((await LawAtom.update(j.atom.id, { mentionBridge: true })).error).toMatch(/verified/);
    await LawDecision.update(decision.id, { verified: true, sourceUrl: "https://juriscassation.cspj.ma/1" });
    expect((await LawAtom.update(j.atom.id, { mentionBridge: true })).atom.mentionBridge).toBe(true);
    const d = await LawAtom.create({ subjectId: subject.id, provenance: "DOCTRINE", body: "d", doctrineRefId: doctrine.id, mentionBridge: true, ...topic });
    expect(d.atom.mentionBridge).toBe(true);
    const d2 = await LawAtom.create({ subjectId: subject.id, provenance: "DOCTRINE", body: "d2", doctrineRefId: doctrine.id, ...topic });
    expect((await LawAtom.update(d2.atom.id, { mentionBridge: true })).error).toMatch(/at most 2|already/);
    const p = await LawAtom.create({ subjectId: subject.id, provenance: "PROF", body: "p", sourceAssetId: audio.id, sourcePage: 1 });
    expect((await LawAtom.update(p.atom.id, { mentionBridge: true })).error).toMatch(/only JURIS or DOCTRINE/);
  });
});

describe("candidate atoms (acceptance: every PROF atom jumps to its source)", () => {
  test("verified transcript → proposals → accepted PROF atoms with timestamps", async () => {
    const { subject } = await setup();
    const { batch } = await LawBatch.create({ clientBatchId: "notes-batch-0001", kind: "audio_recording", subjectId: subject.id });
    const a1 = await asset();
    await db().lawAsset.update({ where: { id: a1.id }, data: { batchId: batch.id } });
    const transcript = await db().lawDerivative.create({
      data: {
        batchId: batch.id,
        kind: "transcript",
        content: JSON.stringify({
          segments: [
            { assetId: a1.id, assetStart: 12, start: 12, end: 40, text: "تعريف العقد عند الأستاذ" },
            { assetId: a1.id, assetStart: 300, start: 300, end: 330, text: "شروط صحة العقد" },
          ],
        }),
      },
    });
    // Verifying the transcript enqueues candidate_atoms.
    await LawInbox.updateDerivative(transcript.id, { verificationStatus: "verified" });
    const [o] = [await worker.runOnce()];
    expect(o.job.type).toBe("candidate_atoms");
    expect(o.status).toBe("succeeded");
    const cand = await db().lawDerivative.findFirst({ where: { kind: "candidate_atoms" } });
    const proposals = JSON.parse(cand.content).atoms;
    expect(proposals).toHaveLength(2); // out-of-range index dropped
    expect((await LawInbox.items()).derivatives.map((d) => d.kind)).toContain("candidate_atoms");

    const r = await LawInbox.acceptAtoms(cand.id, [{ index: 0 }, { index: 1, body: "شروط صحة العقد (معدلة)" }]);
    expect(r.created.map((a) => [a.verificationStatus, a.sourceTimestampSec])).toEqual([
      ["verified", 12],
      ["edited", 300],
    ]);
    expect(r.created[0].profEmphasis).toBe(true);
    // Idempotent
    expect((await LawInbox.acceptAtoms(cand.id, [{ index: 0 }])).created).toHaveLength(0);

    const exam = await LawLenses.content(subject.id, { mode: "exam" });
    const profs = exam.atoms.filter((a) => a.provenance === "PROF");
    expect(profs.length).toBeGreaterThanOrEqual(2);
    for (const a of profs) {
      expect(a.source.url).toMatch(/\/api\/law\/assets\/.+\/file\?exp=/);
      expect(a.source.timestampSec != null || a.source.page != null).toBe(true);
    }
  });
});
