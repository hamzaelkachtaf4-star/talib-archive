// Phase 2 acceptance (spec §11), server side, against a fake Gemini server:
// - a 90-minute imported recording produces a timestamped transcript (real ffmpeg split, merged offsets);
// - a photo batch produces an unverified OCR derivative and the session needs review;
// - exceeding the budget pauses jobs visibly; raising it resumes them.
// The ffmpeg test needs LAWOS_TEST_FFMPEG=/path/to/ffmpeg (Docker has ffmpeg; see CLAUDE.md).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { startFakeGemini } = require("../../utils/law/testing/fakeGemini");
const { db } = require("../../utils/law/dbClient");
const { LawUpload } = require("../../models/lawUpload");
const { LawBatch } = require("../../models/lawBatch");
const { LawSetting } = require("../../models/lawSetting");
const { LawInbox } = require("../../models/lawInbox");
const { LawJob } = require("../../models/lawJob");
const worker = require("../../utils/law/worker");
const router = require("../../utils/law/ai/router");
const { geminiClient } = require("../../utils/law/ai/gemini");
const { deepseekClient } = require("../../utils/law/ai/deepseek");

jest.setTimeout(240000);
const FFMPEG = process.env.LAWOS_TEST_FFMPEG;

let tmp;
let storage;
let fake;
const ENV = process.env;
beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-pipe-"));
  fake = await startFakeGemini();
  process.env = {
    ...ENV,
    STORAGE_DIR: storage,
    GEMINI_API_KEY: "test-key",
    GEMINI_BASE_URL: fake.url,
    GEMINI_MODEL_MULTIMODAL: "fake-multimodal",
    GEMINI_MODEL_FAST: "fake-fast",
    FFMPEG_PATH: FFMPEG || "ffmpeg",
    FFPROBE_PATH: "/nonexistent/ffprobe", // exercises the ffmpeg-only duration fallback
  };
  router.setClientFactory({ gemini: (cfg) => geminiClient(cfg.gemini), deepseek: (cfg) => deepseekClient(cfg.deepseek) });
  tmp = await createTempDb();
  await LawSetting.update({ aiBudgetGeminiUsd: 50 });
});
afterEach(async () => {
  await tmp.cleanup();
  await fake.close();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
let n = 0;
async function importFile(batchId, data, mime, order = 0) {
  const decl = { clientCaptureId: `cap-${++n}-${crypto.randomBytes(4).toString("hex")}`, sha256: sha(data), bytes: data.length, mime, batchId, orderInBatch: order };
  const { upload } = await LawUpload.init(decl);
  for (let i = 0; i < upload.chunkCount; i++)
    await LawUpload.putChunk(upload.uploadId, i, data.subarray(i * upload.chunkSize, (i + 1) * upload.chunkSize));
  return (await LawUpload.complete(upload.uploadId)).asset;
}

async function drain() {
  const outcomes = [];
  for (let r; (r = await worker.runOnce()); ) outcomes.push(r);
  return outcomes;
}

(FFMPEG ? test : test.skip)("90-minute imported recording → timestamped transcript → topics", async () => {
  const audio = path.join(storage, "lecture.webm");
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "5400", "-c:a", "libopus", "-b:a", "6k", audio]);
  const data = fs.readFileSync(audio);
  const { batch } = await LawBatch.create({ clientBatchId: "import-90min-0001", kind: "import", expectedParts: 1 });
  await importFile(batch.id, data, "audio/webm");
  const done = await LawBatch.complete(batch.id);
  expect(done.job.type).toBe("transcribe_audio");

  const outcomes = await drain();
  expect(outcomes.map((o) => [o.job.type, o.status])).toEqual([
    ["transcribe_audio", "succeeded"],
    ["segment_transcript", "succeeded"],
  ]);
  const transcript = await db().lawDerivative.findFirst({ where: { kind: "transcript" } });
  expect(transcript.verificationStatus).toBe("unverified");
  const content = JSON.parse(transcript.content);
  expect(content.durationSec).toBeGreaterThan(5390);
  expect(content.durationSec).toBeLessThan(5410);
  // 9 parts of ~10 min, each transcribed separately and placed on one timeline.
  const audioCalls = fake.state.generateCalls.filter((c) => c.system.startsWith("أنت ناسخ محترف"));
  expect(audioCalls).toHaveLength(9);
  const starts = content.segments.map((s) => s.start);
  expect(starts).toEqual([...starts].sort((a, b) => a - b));
  expect(starts[starts.length - 1]).toBeGreaterThan(5300);
  expect(content.segments.every((s) => s.assetId && s.assetStart >= 0)).toBe(true);
  expect(await db().lawDerivative.count({ where: { kind: "segments" } })).toBe(1);

  const job = await db().lawJob.findFirst({ where: { type: "transcribe_audio" } });
  expect(job.tokensIn).toBeGreaterThan(5400 * 32); // audio tokens were metered
  expect(job.estimatedCostUsd).toBeGreaterThan(0);
});

test("photo batch → unverified OCR derivative → inbox → verified", async () => {
  const { batch } = await LawBatch.create({ clientBatchId: "photos-0001-abcd", kind: "photo_batch", expectedParts: 3 });
  for (let i = 0; i < 3; i++) await importFile(batch.id, crypto.randomBytes(800), "image/jpeg", i);
  await LawBatch.complete(batch.id);
  const [o] = await drain();
  expect(o.status).toBe("succeeded");
  const inbox = await LawInbox.items();
  expect(inbox.derivatives).toHaveLength(1);
  const d = await LawInbox.derivative(inbox.derivatives[0].id);
  expect(d.content.pages.map((p) => p.text)).toEqual(["نص الصفحة 0", "نص الصفحة 1", "نص الصفحة 2"]);
  expect(d.assets).toHaveLength(3);
  expect(d.assets[0].url).toMatch(/\/file\?exp=\d+&sig=/);
  const edited = await LawInbox.updateDerivative(d.id, { content: { pages: [{ ...d.content.pages[0], text: "مصحح" }] } });
  expect(edited.derivative.verificationStatus).toBe("edited");
  expect((await LawInbox.items()).derivatives).toHaveLength(0);
});

test("budget exceeded → job paused visibly → budget raised → job completes", async () => {
  await LawSetting.update({ aiBudgetGeminiUsd: 0.000001 });
  await db().lawAiCall.create({ data: { provider: "gemini", model: "x", purpose: "ocr", status: "ok", estimatedCostUsd: 1 } });
  const { batch } = await LawBatch.create({ clientBatchId: "photos-0002-abcd", kind: "photo_batch", expectedParts: 1 });
  await importFile(batch.id, crypto.randomBytes(500), "image/jpeg");
  await LawBatch.complete(batch.id);
  const [o] = await drain();
  expect(o.status).toBe("paused_budget");
  const inbox = await LawInbox.items();
  expect(inbox.pausedJobs).toHaveLength(1);
  expect(inbox.pausedJobs[0].error).toMatch(/budget/);
  expect(fake.state.generateCalls).toHaveLength(0); // nothing was spent

  await LawSetting.update({ aiBudgetGeminiUsd: 10 });
  expect(await LawJob.resumeBudgetPaused()).toBe(1);
  const [o2] = await drain();
  expect(o2.status).toBe("succeeded");
});

test("missing Gemini key → permanent failure, visible in the inbox, no retries", async () => {
  delete process.env.GEMINI_API_KEY;
  const { batch } = await LawBatch.create({ clientBatchId: "photos-0003-abcd", kind: "photo_batch", expectedParts: 1 });
  await importFile(batch.id, crypto.randomBytes(500), "image/jpeg");
  await LawBatch.complete(batch.id);
  const [o] = await drain();
  expect(o.status).toBe("failed");
  expect((await LawInbox.items()).failedJobs).toHaveLength(1);
});
