const fs = require("fs");
const express = require("express");
const { reqBody } = require("../../utils/http");
const { validatedRequest } = require("../../utils/middleware/validatedRequest");
const { auth, handle, badRequest, lawUser } = require("./helpers");
const { asSystem } = require("../../utils/law/tenant");
const { LawUpload } = require("../../models/lawUpload");
const { LawBatch } = require("../../models/lawBatch");
const { db } = require("../../utils/law/dbClient");
const { assetAbsPath } = require("../../utils/law/assets");
const { signAsset, verifyAsset } = require("../../utils/law/signedUrl");
const worker = require("../../utils/law/worker");

// Chunks arrive as application/octet-stream; the global JSON/text parsers leave them alone.
const rawChunk = express.raw({ type: () => true, limit: "8mb" });

/** Signed URL or normal auth. */
/** A valid signature was issued to the asset's owner, so the file is served as system; otherwise the
 * caller must be signed in and own the asset (the scoped lookup below returns 404 for anyone else). */
function assetAccess(req, res, next) {
  if (verifyAsset(req.params.id, req.query.exp, req.query.sig))
    return asSystem(next);
  return validatedRequest(req, res, () => lawUser(req, res, next));
}

/** Streams a file with HTTP Range support (audio seeking, spec §9.2). */
function streamFile(req, res, file, mime) {
  const size = fs.statSync(file).size;
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable"); // content-addressed
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (!range) {
    res.setHeader("Content-Length", size);
    return fs.createReadStream(file).pipe(res);
  }
  let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] !== "" && range[2] !== "" ? Number(range[2]) : size - 1;
  if (range[1] === "") end = size - 1;
  if (!(start >= 0 && start <= end && end < size)) {
    res.setHeader("Content-Range", `bytes */${size}`);
    return res.status(416).end();
  }
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", end - start + 1);
  return fs.createReadStream(file, { start, end }).pipe(res);
}

function lawCaptureEndpoints(router) {
  router.post(
    "/law/uploads/init",
    auth,
    handle("uploads_init", async (req, res) => {
      const r = await LawUpload.init(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      if (r.alreadyHave)
        return res.json({
          alreadyHave: true,
          asset: r.asset,
          sha256: r.asset.sha256,
        });
      res.json({ alreadyHave: false, ...r.upload });
    })
  );

  router.put(
    "/law/uploads/:uploadId/chunks/:index",
    auth,
    rawChunk,
    handle("uploads_chunk", async (req, res) => {
      const r = await LawUpload.putChunk(
        req.params.uploadId,
        Number(req.params.index),
        req.body
      );
      if (r.error) return badRequest(res, r.error);
      res.json({ receivedChunks: r.receivedChunks });
    })
  );

  router.post(
    "/law/uploads/:uploadId/complete",
    auth,
    handle("uploads_complete", async (req, res) => {
      const r = await LawUpload.complete(req.params.uploadId);
      if (r.error === "missing chunks")
        return res.status(409).json({ error: r.error, missing: r.missing });
      if (r.error === "hash mismatch")
        return res.status(422).json({ error: r.error });
      if (r.error) return badRequest(res, r.error);
      res.json({ asset: r.asset, sha256: r.sha256 });
    })
  );

  router.post(
    "/law/batches",
    auth,
    handle("batches_create", async (req, res) => {
      const r = await LawBatch.create(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ batch: r.batch });
    })
  );

  router.get(
    "/law/batches/:id",
    auth,
    handle("batches_get", async (req, res) => {
      const batch = await LawBatch.get(req.params.id);
      if (!batch) return res.status(404).json({ error: "not_found" });
      res.json({ batch });
    })
  );

  router.patch(
    "/law/batches/:id",
    auth,
    handle("batches_update", async (req, res) => {
      const r = await LawBatch.update(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ batch: r.batch });
    })
  );

  router.post(
    "/law/batches/:id/complete",
    auth,
    handle("batches_complete", async (req, res) => {
      const r = await LawBatch.complete(req.params.id, reqBody(req) || {});
      if (r.error === "waiting for parts")
        return res.status(409).json({ error: r.error, waiting: r.waiting });
      if (r.error) return badRequest(res, r.error);
      if (r.job) worker.kick();
      res.json({ batch: r.batch, job: r.job });
    })
  );

  router.get(
    "/law/assets/:id",
    auth,
    handle("assets_get", async (req, res) => {
      const asset = await db().lawAsset.findUnique({
        where: { id: req.params.id },
      });
      if (!asset) return res.status(404).json({ error: "not_found" });
      const { exp, sig } = signAsset(asset.id);
      res.json({
        asset,
        fileUrl: `/api/law/assets/${asset.id}/file?exp=${exp}&sig=${sig}`,
      });
    })
  );

  router.get(
    "/law/assets/:id/file",
    assetAccess,
    handle("assets_file", async (req, res) => {
      const asset = await db().lawAsset.findUnique({
        where: { id: req.params.id },
      });
      if (!asset) return res.status(404).json({ error: "not_found" });
      const file = assetAbsPath(asset.storagePath);
      if (!fs.existsSync(file))
        return res.status(410).json({ error: "file_missing" });
      streamFile(req, res, file, asset.mime);
    })
  );
}

module.exports = { lawCaptureEndpoints, streamFile };
