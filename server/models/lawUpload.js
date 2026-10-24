// Chunked, resumable uploads (spec §6.2, §9.2). Chunks land in storage/law/uploads-tmp/<uploadId>/;
// completion stream-concatenates them, verifies the declared SHA-256 and moves the file into the
// immutable asset store. Every step is idempotent so a killed tab or a lost response never duplicates
// or loses data: the client simply retries.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db } = require("../utils/law/dbClient");
const { lawPath } = require("../utils/law/storage");
const {
  KINDS,
  baseMime,
  kindFor,
  commitToStore,
} = require("../utils/law/assets");

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB: small enough for flaky mobile links
const MAX_CHUNK = 6 * 1024 * 1024;
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB per file (a 3 h lecture in Opus is ~100 MB)
const TTL_MS = 48 * 3600 * 1000;
const SHA = /^[0-9a-f]{64}$/;

function stagingDir(uploadId) {
  return lawPath("uploads-tmp", uploadId);
}

function parse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function present(u) {
  return {
    uploadId: u.id,
    chunkSize: u.chunkSize,
    chunkCount: u.chunkCount,
    receivedChunks: parse(u.receivedChunks, []),
    status: u.status,
  };
}

async function linkAssetToBatch(asset, batchId, orderInBatch) {
  if (!batchId || asset.batchId) return asset;
  const batch = await db().lawCaptureBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) return asset;
  const updated = await db().lawAsset.update({
    where: { id: asset.id },
    data: {
      batchId,
      orderInBatch,
      sessionId: asset.sessionId ?? batch.sessionId,
      subjectId: asset.subjectId ?? batch.subjectId,
    },
  });
  const receivedParts = await db().lawAsset.count({ where: { batchId } });
  await db().lawCaptureBatch.update({
    where: { id: batchId },
    data: { receivedParts },
  });
  return updated;
}

const LawUpload = {
  CHUNK_SIZE,
  TTL_MS,

  /**
   * Declare an upload. Returns { alreadyHave, asset } when the content or capture is already stored,
   * otherwise the upload with the chunks the server already holds (resume).
   */
  init: async function (input = {}) {
    const {
      clientCaptureId,
      sha256,
      bytes,
      mime,
      kind,
      batchId = null,
      orderInBatch = 0,
    } = input;
    if (
      typeof clientCaptureId !== "string" ||
      clientCaptureId.length < 8 ||
      clientCaptureId.length > 100
    )
      return { error: "invalid clientCaptureId" };
    if (!SHA.test(sha256 || "")) return { error: "invalid sha256" };
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_BYTES)
      return { error: "invalid bytes" };
    if (typeof mime !== "string" || !mime) return { error: "invalid mime" };
    const k = kind || kindFor(mime);
    if (!KINDS.includes(k)) return { error: "invalid kind" };

    const byCapture = await db().lawAsset.findFirst({
      where: { clientCaptureId },
    });
    if (byCapture) return { alreadyHave: true, asset: byCapture, error: null };
    const byHash = await db().lawAsset.findFirst({ where: { sha256 } });
    if (byHash) {
      // Same bytes captured again (e.g. a re-import): content stays stored once.
      return {
        alreadyHave: true,
        asset: await linkAssetToBatch(byHash, batchId, orderInBatch),
        error: null,
      };
    }

    const existing = await db().lawUpload.findFirst({
      where: { clientCaptureId },
    });
    if (existing && existing.status === "open") {
      if (existing.sha256 !== sha256 || existing.bytes !== bytes)
        return { error: "clientCaptureId reused with different content" };
      return { upload: present(existing), error: null };
    }

    const meta = {};
    for (const k2 of [
      "capturedAt",
      "durationSec",
      "widthPx",
      "heightPx",
      "originalFilename",
      "deviceId",
      "sessionId",
      "subjectId",
    ])
      if (input[k2] !== undefined && input[k2] !== null) meta[k2] = input[k2];
    const upload = await db().lawUpload.create({
      data: {
        clientCaptureId,
        sha256,
        bytes,
        mime: baseMime(mime),
        kind: k,
        batchId,
        orderInBatch: Number.isInteger(orderInBatch) ? orderInBatch : 0,
        meta: JSON.stringify(meta),
        chunkSize: CHUNK_SIZE,
        chunkCount: Math.ceil(bytes / CHUNK_SIZE),
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
    fs.mkdirSync(stagingDir(upload.id), { recursive: true });
    return { upload: present(upload), error: null };
  },

  /** Store one chunk (Buffer). Re-sending a chunk overwrites it atomically. */
  putChunk: async function (uploadId, index, buf) {
    const u = await db().lawUpload.findUnique({ where: { id: uploadId } });
    if (!u || u.status !== "open") return { error: "not_found" };
    if (!Number.isInteger(index) || index < 0 || index >= u.chunkCount)
      return { error: "invalid index" };
    if (!Buffer.isBuffer(buf) || buf.length === 0 || buf.length > MAX_CHUNK)
      return { error: "invalid chunk" };
    const expected =
      index === u.chunkCount - 1
        ? u.bytes - u.chunkSize * (u.chunkCount - 1)
        : u.chunkSize;
    if (buf.length !== expected)
      return { error: `chunk ${index} must be ${expected} bytes` };

    const dir = stagingDir(uploadId);
    fs.mkdirSync(dir, { recursive: true });
    const final = path.join(dir, `${index}.part`);
    const tmp = `${final}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, final);

    // Recompute from disk so concurrent chunk requests can't lose each other's index.
    const received = fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.part$/.test(f))
      .map((f) => Number(f.split(".")[0]))
      .sort((a, b) => a - b);
    await db().lawUpload.update({
      where: { id: uploadId },
      data: { receivedChunks: JSON.stringify(received) },
    });
    return { receivedChunks: received, error: null };
  },

  /**
   * Verify and commit. Idempotent: completing an already-completed upload returns the same asset.
   * @returns {{asset, sha256, error}}
   */
  complete: async function (uploadId) {
    const u = await db().lawUpload.findUnique({ where: { id: uploadId } });
    if (!u) return { error: "not_found" };
    if (u.status === "complete") {
      const asset = await db().lawAsset.findFirst({
        where: { clientCaptureId: u.clientCaptureId },
      });
      if (asset) return { asset, sha256: asset.sha256, error: null };
    }
    const dir = stagingDir(uploadId);
    const missing = [];
    for (let i = 0; i < u.chunkCount; i++)
      if (!fs.existsSync(path.join(dir, `${i}.part`))) missing.push(i);
    if (missing.length) return { error: "missing chunks", missing };

    const assembled = path.join(dir, "assembled.bin");
    const hash = crypto.createHash("sha256");
    const out = fs.createWriteStream(assembled);
    for (let i = 0; i < u.chunkCount; i++) {
      const data = fs.readFileSync(path.join(dir, `${i}.part`));
      hash.update(data);
      if (!out.write(data)) await new Promise((r) => out.once("drain", r));
    }
    await new Promise((resolve, reject) =>
      out.end((e) => (e ? reject(e) : resolve()))
    );
    const sha256 = hash.digest("hex");
    const size = fs.statSync(assembled).size;
    if (sha256 !== u.sha256 || size !== u.bytes) {
      // Corrupt transfer: drop every chunk so the client re-sends from scratch.
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      await db().lawUpload.update({
        where: { id: uploadId },
        data: { receivedChunks: "[]" },
      });
      return { error: "hash mismatch", expected: u.sha256, actual: sha256 };
    }

    const storagePath = commitToStore(assembled, sha256, u.mime);
    const meta = parse(u.meta, {});
    let asset = await db().lawAsset.findFirst({ where: { sha256 } });
    if (!asset) {
      try {
        asset = await db().lawAsset.create({
          data: {
            sha256,
            kind: u.kind,
            mime: u.mime,
            bytes: u.bytes,
            storagePath,
            clientCaptureId: u.clientCaptureId,
            originalFilename: meta.originalFilename ?? null,
            durationSec: Number.isFinite(meta.durationSec)
              ? meta.durationSec
              : null,
            widthPx: Number.isInteger(meta.widthPx) ? meta.widthPx : null,
            heightPx: Number.isInteger(meta.heightPx) ? meta.heightPx : null,
            capturedAt:
              meta.capturedAt && !isNaN(Date.parse(meta.capturedAt))
                ? new Date(meta.capturedAt)
                : null,
            deviceId: meta.deviceId ?? null,
            sessionId: meta.sessionId ?? null,
            subjectId: meta.subjectId ?? null,
          },
        });
      } catch (e) {
        if (e?.code !== "P2002") throw e;
        asset = await db().lawAsset.findFirst({ where: { sha256 } });
      }
    }
    asset = await linkAssetToBatch(asset, u.batchId, u.orderInBatch);
    await db().lawUpload.update({
      where: { id: uploadId },
      data: { status: "complete" },
    });
    fs.rmSync(dir, { recursive: true, force: true });
    return { asset, sha256, error: null };
  },

  /** Housekeeping (spec §4.3): staging older than 48 h is removed. */
  cleanupExpired: async function (now = new Date()) {
    const expired = await db().lawUpload.findMany({
      where: { status: "open", expiresAt: { lt: now } },
    });
    for (const u of expired) {
      fs.rmSync(stagingDir(u.id), { recursive: true, force: true });
      await db().lawUpload.update({
        where: { id: u.id },
        data: { status: "failed" },
      });
    }
    // Orphan dirs (no DB row, e.g. after a restore).
    const root = lawPath("uploads-tmp");
    if (fs.existsSync(root))
      for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name);
        const age = now.getTime() - fs.statSync(full).mtimeMs;
        if (
          age > TTL_MS &&
          !(await db().lawUpload.findFirst({
            where: { id: name, status: "open" },
          }))
        )
          fs.rmSync(full, { recursive: true, force: true });
      }
    return expired.length;
  },
};

module.exports = { LawUpload };
