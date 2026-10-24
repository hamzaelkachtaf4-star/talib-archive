// Phase 2 server pieces on a temp DB + temp storage: chunked resumable uploads, content addressing,
// batches with timetable auto-labelling, the job queue and the budget gate.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { LawUpload } = require("../../models/lawUpload");
const { LawBatch } = require("../../models/lawBatch");
const { LawJob } = require("../../models/lawJob");
const { LawSubject } = require("../../models/lawSubject");
const { LawTimetable } = require("../../models/lawTimetable");
const { LawSetting } = require("../../models/lawSetting");
const router = require("../../utils/law/ai/router");
const { BudgetError, ProviderError } = require("../../utils/law/ai/errors");
const { assetAbsPath } = require("../../utils/law/assets");
const { localDate, weekdayOf } = require("../../utils/law/time");

jest.setTimeout(60000);

let tmp;
let storage;
const ENV = process.env;
beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-store-"));
  process.env = { ...ENV, STORAGE_DIR: storage };
  tmp = await createTempDb();
});
afterEach(async () => {
  await tmp.cleanup();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
let n = 0;
const cid = () => `capture-${++n}-${crypto.randomBytes(4).toString("hex")}`;

function chunksOf(buf, size) {
  const out = [];
  for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size));
  return out;
}

describe("chunked uploads", () => {
  test("out-of-order chunks, resume after restart, verified commit, write-once store", async () => {
    const data = crypto.randomBytes(5 * 1024 * 1024 + 123); // 3 chunks
    const decl = { clientCaptureId: cid(), sha256: sha(data), bytes: data.length, mime: "audio/webm" };
    const { upload } = await LawUpload.init(decl);
    expect(upload.chunkCount).toBe(3);
    const parts = chunksOf(data, upload.chunkSize);

    await LawUpload.putChunk(upload.uploadId, 2, parts[2]);
    await LawUpload.putChunk(upload.uploadId, 0, parts[0]);
    // "Tab killed": the client re-inits and learns which chunks the server already holds.
    const resumed = await LawUpload.init(decl);
    expect(resumed.upload.uploadId).toBe(upload.uploadId);
    expect(resumed.upload.receivedChunks).toEqual([0, 2]);
    expect((await LawUpload.complete(upload.uploadId)).error).toBe("missing chunks");

    await LawUpload.putChunk(upload.uploadId, 1, parts[1]);
    await LawUpload.putChunk(upload.uploadId, 1, parts[1]); // duplicate send is harmless
    const done = await LawUpload.complete(upload.uploadId);
    expect(done.error).toBeNull();
    expect(done.sha256).toBe(sha(data));
    const file = assetAbsPath(done.asset.storagePath);
    expect(sha(fs.readFileSync(file))).toBe(sha(data));
    expect(fs.statSync(file).mode & 0o222).toBe(0); // read-only original

    // Completing again (lost response) returns the same asset; init now says "already have it".
    expect((await LawUpload.complete(upload.uploadId)).asset.id).toBe(done.asset.id);
    const again = await LawUpload.init(decl);
    expect(again.alreadyHave).toBe(true);
    expect(fs.existsSync(path.join(storage, "law/uploads-tmp", upload.uploadId))).toBe(false);
  });

  test("hash mismatch is rejected and the staging is reset", async () => {
    const data = crypto.randomBytes(1000);
    const { upload } = await LawUpload.init({ clientCaptureId: cid(), sha256: sha(Buffer.from("other")), bytes: 1000, mime: "image/jpeg" });
    await LawUpload.putChunk(upload.uploadId, 0, data);
    const r = await LawUpload.complete(upload.uploadId);
    expect(r.error).toBe("hash mismatch");
    expect(await db().lawAsset.count()).toBe(0);
    expect((await LawUpload.init({ clientCaptureId: (await db().lawUpload.findUnique({ where: { id: upload.uploadId } })).clientCaptureId, sha256: sha(Buffer.from("other")), bytes: 1000, mime: "image/jpeg" })).upload.receivedChunks).toEqual([]);
  });

  test("same bytes captured twice are stored once", async () => {
    const data = crypto.randomBytes(2048);
    const a = await LawUpload.init({ clientCaptureId: cid(), sha256: sha(data), bytes: data.length, mime: "image/jpeg" });
    await LawUpload.putChunk(a.upload.uploadId, 0, data);
    const first = await LawUpload.complete(a.upload.uploadId);
    const b = await LawUpload.init({ clientCaptureId: cid(), sha256: sha(data), bytes: data.length, mime: "image/jpeg" });
    expect(b.alreadyHave).toBe(true);
    expect(b.asset.id).toBe(first.asset.id);
    expect(await db().lawAsset.count()).toBe(1);
  });

  test("rejects wrong chunk sizes and bad declarations", async () => {
    expect((await LawUpload.init({ clientCaptureId: "short", sha256: "x", bytes: 1, mime: "a" })).error).toBeTruthy();
    const data = crypto.randomBytes(3000);
    const { upload } = await LawUpload.init({ clientCaptureId: cid(), sha256: sha(data), bytes: 3000, mime: "image/png" });
    expect((await LawUpload.putChunk(upload.uploadId, 0, data.subarray(0, 10))).error).toMatch(/must be 3000 bytes/);
    expect((await LawUpload.putChunk(upload.uploadId, 5, data)).error).toBe("invalid index");
  });

  test("expired staging is cleaned after 48 h", async () => {
    const data = crypto.randomBytes(100);
    const { upload } = await LawUpload.init({ clientCaptureId: cid(), sha256: sha(data), bytes: 100, mime: "image/png" });
    await LawUpload.putChunk(upload.uploadId, 0, data);
    const later = new Date(Date.now() + 49 * 3600 * 1000);
    expect(await LawUpload.cleanupExpired(later)).toBe(1);
    expect(fs.existsSync(path.join(storage, "law/uploads-tmp", upload.uploadId))).toBe(false);
  });
});

async function uploadInto(batchId, order, data = crypto.randomBytes(500), mime = "image/jpeg") {
  const { upload } = await LawUpload.init({ clientCaptureId: cid(), sha256: sha(data), bytes: data.length, mime, batchId, orderInBatch: order });
  await LawUpload.putChunk(upload.uploadId, 0, data);
  return (await LawUpload.complete(upload.uploadId)).asset;
}

describe("batches", () => {
  test("idempotent by clientBatchId; completes only when every part arrived; enqueues OCR", async () => {
    const { batch } = await LawBatch.create({ clientBatchId: "batch-0001-abcd", kind: "photo_batch", expectedParts: 2 });
    expect((await LawBatch.create({ clientBatchId: "batch-0001-abcd", kind: "photo_batch", expectedParts: 2 })).batch.id).toBe(batch.id);
    await uploadInto(batch.id, 0);
    const early = await LawBatch.complete(batch.id);
    expect(early.error).toBe("waiting for parts");
    await uploadInto(batch.id, 1);
    const done = await LawBatch.complete(batch.id);
    expect(done.batch.status).toBe("complete");
    expect(done.job.type).toBe("ocr_photo_batch");
    expect((await LawBatch.complete(batch.id)).batch.status).toBe("complete");
    expect(await db().lawJob.count()).toBe(1);
  });

  test("a capture during a timetable slot is labelled with its subject and today's session", async () => {
    const { subject } = await LawSubject.create({ name: "القانون الجنائي الخاص" });
    const now = new Date();
    const today = localDate(now);
    const hh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Casablanca", hour: "2-digit", hourCycle: "h23" }).format(now));
    const start = `${String(Math.max(0, hh - 1)).padStart(2, "0")}:00`;
    const end = `${String(Math.min(23, hh + 1)).padStart(2, "0")}:59`;
    await LawTimetable.replace([{ weekday: weekdayOf(today), startTime: start, endTime: end, subjectId: subject.id }]);
    const { batch } = await LawBatch.create({ clientBatchId: "batch-0002-abcd", kind: "audio_recording", capturedAt: now.toISOString() });
    expect(batch.subjectId).toBe(subject.id);
    const session = await db().lawClassSession.findUnique({ where: { id: batch.sessionId } });
    expect(session.date).toBe(today);
    // A second capture in the same class joins the same session.
    const { batch: b2 } = await LawBatch.create({ clientBatchId: "batch-0003-abcd", kind: "photo_batch", capturedAt: now.toISOString() });
    expect(b2.sessionId).toBe(batch.sessionId);
  });
});

describe("job queue", () => {
  test("claims one job at a time, by priority", async () => {
    await LawJob.enqueue("embed", {}, { priority: 0 });
    const high = await LawJob.enqueue("ocr_photo_batch", { batchId: "x" }, { priority: 5 });
    const a = await LawJob.claim();
    expect(a.id).toBe(high.id);
    const b = await LawJob.claim();
    expect(b.id).not.toBe(a.id);
    expect(await LawJob.claim()).toBeNull();
  });

  test("backoff, then permanent failure after max attempts", async () => {
    const job = await LawJob.enqueue("embed", {}, { maxAttempts: 2 });
    let now = new Date();
    await LawJob.claim({ now });
    const first = await LawJob.fail(job.id, new Error("boom"), { now });
    expect(first.status).toBe("queued");
    expect(first.runAfter.getTime()).toBe(now.getTime() + 30000);
    expect(await LawJob.claim({ now })).toBeNull(); // not due yet
    now = new Date(now.getTime() + 31000);
    await LawJob.claim({ now });
    const second = await LawJob.fail(job.id, new Error("boom again"), { now });
    expect(second.status).toBe("failed");
    expect(second.error).toBe("boom again");
    expect((await LawJob.retry(job.id)).job.status).toBe("queued");
  });

  test("a job locked by a dead worker is recovered", async () => {
    const job = await LawJob.enqueue("embed", {});
    const t0 = new Date();
    await LawJob.claim({ now: t0 });
    const later = new Date(t0.getTime() + 31 * 60000);
    const again = await LawJob.claim({ now: later });
    expect(again.id).toBe(job.id);
    expect(again.attempts).toBe(2);
  });
});

describe("AI router and budget gate", () => {
  const prompt = { id: "t", version: 1, hash: "h" };
  let calls;
  beforeEach(() => {
    calls = [];
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_MODEL_MULTIMODAL = "gm-multi";
    process.env.GEMINI_MODEL_FAST = "gm-fast";
    process.env.DEEPSEEK_API_KEY = "k";
    process.env.DEEPSEEK_BASE_URL = "http://deepseek.invalid";
    process.env.DEEPSEEK_MODEL_REASONING = "ds-r";
  });
  afterEach(() => router.setClientFactory({ gemini: () => null, deepseek: () => null }));

  function fake(behaviour) {
    router.setClientFactory({
      gemini: () => ({ generate: async (r) => behaviour("gemini", r) }),
      deepseek: () => ({ generate: async (r) => behaviour("deepseek", r) }),
    });
  }
  const ok = (provider, r) => {
    calls.push([provider, r.model]);
    return { text: "{}", json: {}, model: r.model, usage: { tokensIn: 1_000_000, tokensOut: 0 } };
  };

  test("no budget set → BudgetError, nothing called", async () => {
    fake(ok);
    await expect(router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] })).rejects.toBeInstanceOf(BudgetError);
    expect(calls).toHaveLength(0);
  });

  test("routes by purpose/tier, logs cost, and stops at the budget", async () => {
    fake(ok);
    await LawSetting.update({ aiBudgetGeminiUsd: 0.5 });
    const out = await router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] });
    expect(out.provider).toBe("gemini");
    expect(calls[0]).toEqual(["gemini", "gm-fast"]);
    expect(out.costUsd).toBeCloseTo(0.3); // 1M input tokens × default 0.30
    await router.generate({ purpose: "ocr", prompt, parts: [{ text: "x" }] });
    expect(calls[1]).toEqual(["gemini", "gm-multi"]);
    // 0.6 spent ≥ 0.5 budget
    await expect(router.generate({ purpose: "ocr", prompt, parts: [{ text: "x" }] })).rejects.toBeInstanceOf(BudgetError);
    const logged = await db().lawAiCall.findMany();
    expect(logged).toHaveLength(2);
    expect(logged.every((l) => l.promptHash && !("content" in l))).toBe(true);
  });

  test("falls back on provider errors for text tasks only", async () => {
    await LawSetting.update({ aiBudgetGeminiUsd: 5, aiBudgetDeepseekUsd: 5 });
    fake((p, r) => {
      if (p === "gemini") throw new ProviderError("503");
      return ok(p, r);
    });
    const out = await router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] });
    expect(out.provider).toBe("deepseek");
    await expect(
      router.generate({ purpose: "transcription", prompt, parts: [{ inlineData: { mimeType: "audio/webm", data: "" } }] })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("routing override from settings", async () => {
    fake(ok);
    await LawSetting.update({ aiBudgetDeepseekUsd: 5, aiRouting: { segmentation: "deepseek" } });
    const out = await router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] });
    expect(out.provider).toBe("deepseek");
  });

  test("usage report groups spend by provider and purpose", async () => {
    fake(ok);
    await LawSetting.update({ aiBudgetGeminiUsd: 10 });
    await router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] });
    const u = await router.usage();
    expect(u.byProvider.gemini.calls).toBe(1);
    expect(u.byProvider.gemini.purposes[0].purpose).toBe("segmentation");
    expect(u.budgets.gemini).toBe(10);
  });
});
