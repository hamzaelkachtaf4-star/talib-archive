/* LAW-OS upload engine (spec §6.2). Classic script shared by the service worker (importScripts) and the
 * page (when no service worker controls it, e.g. in dev), so there is exactly one implementation.
 *
 * Reads the IndexedDB queue written by the page:
 *   batches   { clientBatchId, kind, subjectId, capturedAt, closed, expectedParts, serverBatchId }
 *   captures  { clientCaptureId, clientBatchId, blob, sha256, bytes, mime, kind, orderInBatch, ... }
 * For each capture: init → missing chunks (2 MB, resumable from the server's list) → complete. The local
 * blob is deleted only after the server acknowledges the matching SHA-256. A closed batch whose captures
 * are all uploaded is completed on the server, which enqueues its processing job.
 * Progress is announced on BroadcastChannel("lawos-upload").
 *
 * Keep the IndexedDB schema in sync with frontend/src/components/LawOS/lib/idb.js.
 */
(function (global) {
  const DB_NAME = "lawos";
  const DB_VERSION = 5;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("lawos-upload") : null;
  let current = null;

  function upgrade(db) {
    if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
    if (!db.objectStoreNames.contains("reviewQueue")) db.createObjectStore("reviewQueue", { keyPath: "clientReviewId" });
    if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    if (!db.objectStoreNames.contains("captures")) db.createObjectStore("captures", { keyPath: "clientCaptureId" });
    if (!db.objectStoreNames.contains("batches")) db.createObjectStore("batches", { keyPath: "clientBatchId" });
    if (!db.objectStoreNames.contains("ttQueue")) db.createObjectStore("ttQueue", { keyPath: "clientOpId" });
    if (!db.objectStoreNames.contains("legalTexts")) db.createObjectStore("legalTexts", { keyPath: "slug" });
    if (!db.objectStoreNames.contains("todos")) db.createObjectStore("todos", { keyPath: "clientId" });
  }

  let dbPromise = null;
  function openDb() {
    if (!dbPromise)
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => upgrade(req.result);
        req.onsuccess = () => {
          req.result.onversionchange = () => {
            req.result.close();
            dbPromise = null;
          };
          resolve(req.result);
        };
        req.onerror = () => {
          dbPromise = null;
          reject(req.error);
        };
      });
    return dbPromise;
  }

  function reqP(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function store(name, mode = "readonly") {
    const db = await openDb();
    return db.transaction(name, mode).objectStore(name);
  }

  const getAll = async (name) => reqP((await store(name)).getAll());
  const get = async (name, key) => reqP((await store(name)).get(key));
  const put = async (name, value) => reqP((await store(name, "readwrite")).put(value));
  const del = async (name, key) => reqP((await store(name, "readwrite")).delete(key));

  function announce(event) {
    try {
      channel && channel.postMessage(event);
    } catch (e) {
      /* ignore */
    }
  }

  async function api(base, token, method, path, body, raw) {
    const headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    if (raw) headers["Content-Type"] = "application/octet-stream";
    else if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(base + "/law" + path, {
      method,
      headers,
      body: raw ? raw : body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* empty body */
    }
    return { ok: res.ok, status: res.status, data };
  }

  class Stop extends Error {}

  async function ensureServerBatch(ctx, batch) {
    if (batch.serverBatchId) return batch.serverBatchId;
    const r = await api(ctx.base, ctx.token, "POST", "/batches", {
      clientBatchId: batch.clientBatchId,
      kind: batch.kind,
      subjectId: batch.subjectId || null,
      capturedAt: batch.capturedAt,
      expectedParts: batch.closed ? batch.expectedParts : null,
    });
    if (r.status === 401 || r.status === 403) throw new Stop("auth");
    if (!r.ok) throw new Stop("batch create failed: " + r.status);
    batch.serverBatchId = r.data.batch.id;
    await put("batches", batch);
    return batch.serverBatchId;
  }

  async function uploadCapture(ctx, cap, serverBatchId) {
    const init = await api(ctx.base, ctx.token, "POST", "/uploads/init", {
      clientCaptureId: cap.clientCaptureId,
      sha256: cap.sha256,
      bytes: cap.bytes,
      mime: cap.mime,
      kind: cap.kind,
      batchId: serverBatchId,
      orderInBatch: cap.orderInBatch,
      capturedAt: cap.capturedAt,
      durationSec: cap.durationSec,
      widthPx: cap.widthPx,
      heightPx: cap.heightPx,
      originalFilename: cap.originalFilename,
      deviceId: cap.deviceId,
    });
    if (init.status === 401 || init.status === 403) throw new Stop("auth");
    if (!init.ok) throw new Stop("init failed: " + init.status);

    if (!init.data.alreadyHave) {
      const { uploadId, chunkSize, chunkCount, receivedChunks } = init.data;
      const have = new Set(receivedChunks);
      for (let i = 0; i < chunkCount; i++) {
        if (have.has(i)) continue;
        const part = cap.blob.slice(i * chunkSize, Math.min(cap.bytes, (i + 1) * chunkSize));
        const r = await api(ctx.base, ctx.token, "PUT", "/uploads/" + uploadId + "/chunks/" + i, null, part);
        if (!r.ok) throw new Stop("chunk failed: " + r.status);
        ctx.sentBytes += part.size;
        announce({ type: "progress", clientCaptureId: cap.clientCaptureId, chunk: i + 1, of: chunkCount, sentBytes: ctx.sentBytes });
      }
      const done = await api(ctx.base, ctx.token, "POST", "/uploads/" + uploadId + "/complete");
      if (done.status === 409 || done.status === 422) throw new Stop("complete needs retry: " + done.status);
      if (!done.ok) throw new Stop("complete failed: " + done.status);
      if (done.data.sha256 !== cap.sha256) throw new Stop("server hash differs");
    } else if (init.data.sha256 !== cap.sha256) {
      throw new Stop("server hash differs");
    }
    // Acknowledged with a matching hash: the local copy can go (spec §6.2).
    await del("captures", cap.clientCaptureId);
    ctx.uploaded++;
    announce({ type: "uploaded", clientCaptureId: cap.clientCaptureId, sha256: cap.sha256 });
  }

  async function runInner(opts) {
    const ctx = { base: opts.apiBase || "/api", token: opts.token || null, uploaded: 0, completed: 0, sentBytes: 0 };
    if (!ctx.token) {
      const saved = await get("meta", "authToken");
      ctx.token = (saved && saved.value) || null;
    } else {
      await put("meta", { key: "authToken", value: ctx.token });
    }
    announce({ type: "start" });
    try {
      const batches = (await getAll("batches")).sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
      const captures = await getAll("captures");
      for (const batch of batches) {
        const mine = captures
          .filter((c) => c.clientBatchId === batch.clientBatchId)
          .sort((a, b) => a.orderInBatch - b.orderInBatch);
        if (!mine.length && !batch.closed) continue; // a recording still in progress with nothing to send
        const serverBatchId = await ensureServerBatch(ctx, batch);
        for (const cap of mine) await uploadCapture(ctx, cap, serverBatchId);
        if (batch.closed) {
          const r = await api(ctx.base, ctx.token, "POST", "/batches/" + serverBatchId + "/complete", {
            expectedParts: batch.expectedParts,
          });
          if (r.ok) {
            await del("batches", batch.clientBatchId);
            ctx.completed++;
            announce({ type: "batch-complete", clientBatchId: batch.clientBatchId, job: r.data.job && r.data.job.id });
          } else if (r.status !== 409) {
            throw new Stop("batch complete failed: " + r.status);
          }
        }
      }
      await put("meta", { key: "uploadStatus", value: { lastRunAt: new Date().toISOString(), lastError: null } });
      announce({ type: "idle", uploaded: ctx.uploaded, completed: ctx.completed });
      return { ok: true, uploaded: ctx.uploaded, completed: ctx.completed };
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      await put("meta", { key: "uploadStatus", value: { lastRunAt: new Date().toISOString(), lastError: message } });
      announce({ type: "error", message: message });
      return { ok: false, error: message, uploaded: ctx.uploaded };
    }
  }

  /** Runs the queue once; concurrent calls share the same run. */
  function run(opts) {
    if (!current)
      current = runInner(opts || {}).finally(function () {
        current = null;
      });
    return current;
  }

  async function pending() {
    const captures = await getAll("captures");
    const batches = await getAll("batches");
    return {
      captures: captures.length,
      bytes: captures.reduce((s, c) => s + (c.bytes || 0), 0),
      batches: batches.length,
      openRecordings: batches.filter((b) => !b.closed).length,
    };
  }

  global.LawUploadEngine = { run: run, pending: pending, DB_VERSION: DB_VERSION };
})(typeof self !== "undefined" ? self : window);
