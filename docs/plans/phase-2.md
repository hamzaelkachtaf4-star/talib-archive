# Phase 2 — Capture and Inbox (plan)

Spec refs: §1.2–1.3, §5.2, §6.1–6.3, §7.1, §7.3, §9.2–9.3, §9.8 (`/ai/usage`), §11 Phase 2.

## Data (migration `law_phase2_capture`)
- **LawAsset:** immutable original, `sha256` unique, `clientCaptureId` unique.
- **LawCaptureBatch:** adds `clientBatchId` (unique) so a batch created offline is created on the server
  idempotently.
- **LawUpload:** upload staging. Holds `uploadId`, `clientCaptureId` (unique), the declared `sha256`, bytes,
  mime, kind, chunk size, received chunk indexes, status and expiry (48 h).
- **LawJob:** as in spec §5.2.
- **LawDerivative:** as in spec §5.2.
- `LawAiCall` already exists.

## Server
| Path | Purpose |
|---|---|
| `utils/law/assets.js` | Content-addressed store `storage/law/assets/<sha[0:2]>/<sha>.<ext>`. Write-once: an existing file is never rewritten |
| `models/lawUpload.js` | `init` (dedupes by clientCaptureId or sha256 and returns received chunks to resume), `putChunk` (atomic tmp+rename, idempotent), `complete` (stream-concatenate, verify SHA-256, move to the asset store, create the `LawAsset`), and cleanup of staging older than 48 h |
| `models/lawBatch.js` | Idempotent create by `clientBatchId`. Auto-labels from the timetable slot active at `capturedAt` (subject plus today's session). `complete` enqueues the processing job |
| `models/lawJob.js` | SQLite queue: atomic claim (`updateMany` guarded on status), exponential backoff (max 4 attempts), stale-lock recovery, `paused_budget` |
| `utils/law/worker.js` | In-process loop, **one job at a time**, polling every 5 s. Hourly housekeeping. Disabled with `LAWOS_WORKER=off` |
| `utils/law/ai/config.js`, `ai/router.js` | Routing table §7.1 (setting-overridable), budget gate, `LawAiCall` logging. Price table from env, with documented estimates as defaults |
| `utils/law/ai/gemini.js` | REST client (no SDK): `generateContent`, Files API resumable upload and polling, JSON output. Base URL from env (`GEMINI_BASE_URL`), which a test can point at a fake |
| `utils/law/ai/deepseek.js` | OpenAI-compatible chat client (the fallback for text tasks) |
| `utils/law/prompts/*.md` + `prompts.js` | Versioned Arabic prompts with English headers (§7.3) |
| `utils/law/media.js` | `ffprobe` duration; `ffmpeg -c copy` split into 10-minute parts so a 90-minute lecture never exceeds model output limits. No re-encoding, so CPU on the dv6 stays negligible |
| `utils/law/jobs/*.js` | `ocr_photo_batch`, `transcribe_audio` (split, transcribe each part, merge with time offsets), `segment_transcript`, `extract_pdf` (text first, Gemini vision for scanned pages) |
| `endpoints/law/capture.js` | Upload, batch and asset routes. Asset files are streamed with Range support, through short-lived signed URLs so `<img>`/`<audio>` work without auth headers |
| `endpoints/law/inbox.js` | `/inbox`, `/jobs`, `/jobs/:id/retry`, `/derivatives/:id`, `/ai/usage` |

## Frontend
- **Upload engine:** `public/lawos-upload-engine.js` is a classic script used by both the service worker
  and the page.
  - It reads the `captures`/`batches` stores in IndexedDB (DB version 2), sends 2 MB chunks and resumes
    from the server's received-chunk list.
  - It deletes a local blob only after an acknowledgement whose sha256 matches.
  - It runs on Background Sync (`lawos-upload`), on app open and foreground, and when the network returns.
    Without a service worker (dev) it runs in the page.
- **Capture tab:**
  - CameraBatchCapture: in-app `getUserMedia` multi-shot plus a gallery picker, reorder, client resize to a
    2400 px long edge and JPEG.
  - AudioRecorder: MediaRecorder, a new file every 5 minutes, Wake Lock, level meter, elapsed time.
  - ImportFile (audio, PDF, images), UploadQueueStatus, and the Inbox sub-view.
- **Inbox:** DerivativeReview shows the original next to the text, with inline edit and accept/reject.
  For transcripts, clicking a timestamp seeks the audio. Also failed jobs with retry, and a budget-pause
  banner.
- **Settings:** an AI usage screen showing spend per provider and purpose against the budget.

## Tests
- **Unit:** job queue (claim exclusivity, backoff, max attempts, stale locks), budget gate, router
  fallback, Gemini client request/response shapes (mocked fetch), prompt loader, transcript merge
  offsets, auto-labelling.
- **Integration (temp DB + temp storage):** chunked upload with out-of-order chunks, resume after a
  restart, hash mismatch rejected, duplicate content deduplicated; batch → job → derivative through a fake
  Gemini HTTP server.
- **E2E (browser):** 14 photos captured offline upload after reconnecting, with matching hashes. A reload
  mid-upload resumes without loss. A 90-minute file is imported and transcribed end to end against the fake
  Gemini server, using the real ffmpeg split.

## Status (2026-10-10): implemented
Verified locally on Node 24, without a real Gemini key: the pipeline runs against
`server/utils/law/testing/fakeGemini.js`, a local server with the REST shapes verified against
ai.google.dev.

- **Tests:** 246 jest tests pass. That includes the upload, batch and queue integration tests, the
  router/budget tests, the AI client unit tests, and the pipeline tests.
- **Acceptance, 14 offline photos:** `deploy/e2e/capture-offline.cjs` captures 14 photos in airplane mode,
  and they upload after reconnecting with all 14 SHA-256 values matching the server's `LawAsset` rows.
- **Acceptance, kill mid-upload:** in the same e2e, the page is closed in the middle of a throttled 12 MB
  upload. Nothing is lost: the upload finishes, through the service-worker engine or on reopen, and the
  hash matches. Resuming from the server's received-chunk list is also covered by an integration test.
- **Acceptance, 90-minute recording:** a 90-minute imported recording produces a timestamped transcript
  (pipeline test, with a real ffmpeg split into 9 parts and the merged timeline checked). The same pipeline
  in production mode also produced an OCR derivative, reviewed in the browser through signed image URLs.
- **Acceptance, budget pause:** exceeding the budget pauses jobs visibly, with no provider call made.
  Raising the budget resumes them (pipeline test and the Inbox banner).
- **Regressions:** the offline-shell and offline-review e2e tests still pass.

Not verified:
- real Gemini output quality, since there is no API key yet;
- in-app camera and recorder on the S23, since headless Chromium has no camera or mic. The gallery and
  import paths go through the same queue.
- Background Sync while the app is fully closed, which needs a real Android device.
