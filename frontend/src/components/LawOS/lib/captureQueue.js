// Page side of the capture pipeline (spec §6.1-6.2). Captures are written to IndexedDB first (blob +
// SHA-256 + metadata), then the upload engine is woken: in the service worker when one controls the page
// (and through Background Sync where available), otherwise in the page itself.
import * as idb from "./idb";
import { sha256Hex } from "./media";
import { AUTH_TOKEN } from "@/utils/constants";

const ENGINE_URL = "/lawos-upload-engine.js";
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("lawos-upload")
    : null;
const listeners = new Set();

if (channel)
  channel.onmessage = (e) => {
    for (const fn of listeners) fn(e.data);
  };

/** Subscribe to engine events (progress, uploaded, batch-complete, error, idle) and local queue changes. */
export function onUploadEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event) {
  for (const fn of listeners) fn(event);
}

const uuid = () => crypto.randomUUID();

async function addCapture(
  batch,
  {
    blob,
    kind,
    orderInBatch,
    durationSec = null,
    widthPx = null,
    heightPx = null,
    originalFilename = null,
  }
) {
  const capture = {
    clientCaptureId: uuid(),
    clientBatchId: batch.clientBatchId,
    blob,
    sha256: await sha256Hex(blob),
    bytes: blob.size,
    mime: blob.type || "application/octet-stream",
    kind,
    orderInBatch,
    capturedAt: new Date().toISOString(),
    durationSec,
    widthPx,
    heightPx,
    originalFilename,
    deviceId: localStorage.getItem("lawos_device_id"),
  };
  await idb.put("captures", capture);
  return capture;
}

function newBatch(
  kind,
  { subjectId = null, closed = true, expectedParts = null } = {}
) {
  return {
    clientBatchId: uuid(),
    kind,
    subjectId: subjectId || null,
    capturedAt: new Date().toISOString(),
    closed,
    expectedParts,
  };
}

/** A photo set from the in-app camera or the gallery, in the reviewed order. */
export async function queuePhotoBatch(pages, { subjectId } = {}) {
  const batch = newBatch("photo_batch", {
    subjectId,
    expectedParts: pages.length,
  });
  for (const [i, p] of pages.entries())
    await addCapture(batch, {
      blob: p.blob,
      kind: "photo",
      orderInBatch: i,
      widthPx: p.width,
      heightPx: p.height,
    });
  await idb.put("batches", batch);
  emit({ type: "queued" });
  kick();
  return batch;
}

/** One imported file (audio from the native recorder, a PDF polycopié, or a single image). */
export async function queueImport(
  file,
  { subjectId, durationSec = null } = {}
) {
  const kind = file.type.startsWith("audio/")
    ? "audio"
    : file.type === "application/pdf"
      ? "pdf"
      : file.type.startsWith("image/")
        ? "photo"
        : "other";
  const batch = newBatch(
    kind === "pdf" ? "pdf" : kind === "photo" ? "photo_batch" : "import",
    { subjectId, expectedParts: 1 }
  );
  await addCapture(batch, {
    blob: file,
    kind,
    orderInBatch: 0,
    durationSec,
    originalFilename: file.name || null,
  });
  await idb.put("batches", batch);
  emit({ type: "queued" });
  kick();
  return batch;
}

/** Recording: open a batch, add 5-minute segments as they finish, close it at the end. */
export async function openRecording({ subjectId } = {}) {
  const batch = newBatch("audio_recording", { subjectId, closed: false });
  batch.lastSegmentAt = new Date().toISOString();
  await idb.put("batches", batch);
  return batch;
}

export async function addRecordingSegment(batch, blob, index, durationSec) {
  await addCapture(batch, {
    blob,
    kind: "audio",
    orderInBatch: index,
    durationSec,
  });
  const stored = (await idb.get("batches", batch.clientBatchId)) || batch;
  await idb.put("batches", {
    ...stored,
    lastSegmentAt: new Date().toISOString(),
    segments: index + 1,
  });
  emit({ type: "queued" });
  kick();
}

export async function closeRecording(batch, segmentCount) {
  const stored = (await idb.get("batches", batch.clientBatchId)) || batch;
  if (!segmentCount) {
    await idb.deleteMany("batches", [batch.clientBatchId]);
    return;
  }
  await idb.put("batches", {
    ...stored,
    closed: true,
    expectedParts: segmentCount,
  });
  emit({ type: "queued" });
  kick();
}

/**
 * A recording whose tab was killed never got closed. On the next app open, close it with the segments
 * that were saved (at most the last ≤5 minutes are lost, spec §6.1).
 */
export async function recoverInterruptedRecordings(activeBatchId = null) {
  const stale = Date.now() - 6 * 60 * 1000;
  const batches = await idb.getAll("batches");
  const captures = await idb.getAll("captures");
  let recovered = 0;
  for (const b of batches) {
    if (b.closed || b.clientBatchId === activeBatchId) continue;
    if (new Date(b.lastSegmentAt || b.capturedAt).getTime() > stale) continue;
    const n =
      b.segments ??
      captures.filter((c) => c.clientBatchId === b.clientBatchId).length;
    await closeRecording(b, n);
    recovered++;
  }
  return recovered;
}

export async function pendingStatus() {
  const captures = await idb.getAll("captures");
  const batches = await idb.getAll("batches");
  const status = await idb.getMeta("uploadStatus");
  return {
    captures: captures.length,
    bytes: captures.reduce((s, c) => s + (c.bytes || 0), 0),
    batches: batches.length,
    openRecordings: batches.filter((b) => !b.closed).length,
    lastError: status?.lastError || null,
    lastRunAt: status?.lastRunAt || null,
  };
}

let engineLoad = null;
function loadEngineInPage() {
  if (window.LawUploadEngine) return Promise.resolve(window.LawUploadEngine);
  if (!engineLoad)
    engineLoad = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ENGINE_URL;
      s.onload = () => resolve(window.LawUploadEngine);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  return engineLoad;
}

/** Wake the upload engine now; also register Background Sync so the browser retries on its own. */
export async function kick() {
  if (!navigator.onLine) return;
  const token = localStorage.getItem(AUTH_TOKEN);
  const ctrl = navigator.serviceWorker?.controller;
  if (ctrl) {
    ctrl.postMessage({ type: "LAWOS_UPLOAD_NOW", token });
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync?.register("lawos-upload");
    } catch {
      // Background Sync unsupported: foreground triggers still cover it.
    }
    return;
  }
  try {
    const engine = await loadEngineInPage();
    await engine.run({ token });
  } catch (e) {
    console.warn("[LAW-OS] upload engine unavailable:", e?.message);
  }
}

let started = false;
/** Upload on app open, when the network returns and when the app comes back to the foreground. */
export function startAutoUpload() {
  if (started) return;
  started = true;
  const run = () => {
    recoverInterruptedRecordings(window.__lawosActiveRecording || null)
      .catch(() => {})
      .finally(() => kick());
  };
  window.addEventListener("online", run);
  document.addEventListener(
    "visibilitychange",
    () => document.visibilityState === "visible" && run()
  );
  run();
}
