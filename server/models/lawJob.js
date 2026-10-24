// SQLite-backed job queue (spec §5.2, §6.3). One worker, one job at a time. Claims are atomic via a
// status-guarded updateMany, so even a second worker process (spec §4.2 later option) can't double-run.
const os = require("os");
const { db, rawDb } = require("../utils/law/dbClient");

const TYPES = [
  "ocr_photo_batch",
  "transcribe_audio",
  "extract_pdf",
  "segment_transcript",
  "align_polycopie",
  "embed",
  "scrape_source",
  "parse_bo_issue",
  "weekly_recap",
  "push_reminder",
  "rebuild_index",
  "parse_corpus_import",
  "candidate_atoms",
  "critique_case",
  "critique_dissertation",
];
const STALE_LOCK_MS = 30 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;
const WORKER_ID = `${os.hostname()}:${process.pid}`;

function parse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

function present(j) {
  return j ? { ...j, payload: parse(j.payload) } : null;
}

/** Exponential backoff: 30 s, 2 min, 8 min, 32 min… */
function backoffMs(attempts) {
  return BASE_BACKOFF_MS * 4 ** Math.max(0, attempts - 1);
}

const LawJob = {
  TYPES,
  WORKER_ID,
  backoffMs,

  enqueue: async function (
    type,
    payload = {},
    {
      priority = 0,
      runAfter = new Date(),
      maxAttempts = 4,
      userId = undefined, // system context only: the user a scheduled job runs for
    } = {}
  ) {
    if (!TYPES.includes(type)) throw new Error(`unknown job type ${type}`);
    return present(
      await db().lawJob.create({
        data: {
          type,
          payload: JSON.stringify(payload),
          priority,
          runAfter,
          maxAttempts,
          ...(userId !== undefined ? { userId } : {}),
        },
      })
    );
  },

  /** Claim the next runnable job, or null. */
  claim: async function ({ now = new Date(), workerId = WORKER_ID } = {}) {
    // Recover jobs whose worker died mid-run (container restart, OOM kill).
    await db().lawJob.updateMany({
      where: {
        status: "running",
        lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) },
      },
      data: { status: "queued", lockedAt: null, lockedBy: null },
    });
    for (let tries = 0; tries < 3; tries++) {
      const next = await db().lawJob.findFirst({
        where: { status: "queued", runAfter: { lte: now } },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });
      if (!next) return null;
      const { count } = await db().lawJob.updateMany({
        where: { id: next.id, status: "queued" },
        data: {
          status: "running",
          lockedAt: now,
          lockedBy: workerId,
          attempts: { increment: 1 },
        },
      });
      if (count === 1)
        return present(
          await db().lawJob.findUnique({ where: { id: next.id } })
        );
    }
    return null;
  },

  succeed: async function (
    id,
    { status = "succeeded", usage = {}, durationMs } = {}
  ) {
    return db().lawJob.update({
      where: { id },
      data: {
        status,
        lockedAt: null,
        lockedBy: null,
        error: null,
        durationMs,
        ...usage,
      },
    });
  },

  /** Retry with backoff, or fail permanently once attempts are exhausted. */
  fail: async function (
    id,
    error,
    { now = new Date(), permanent = false } = {}
  ) {
    const job = await db().lawJob.findUnique({ where: { id } });
    if (!job) return null;
    const message = String(error?.message || error).slice(0, 1000);
    const retry = !permanent && job.attempts < job.maxAttempts;
    return db().lawJob.update({
      where: { id },
      data: {
        status: retry ? "queued" : "failed",
        runAfter: retry
          ? new Date(now.getTime() + backoffMs(job.attempts))
          : job.runAfter,
        lockedAt: null,
        lockedBy: null,
        error: message,
      },
    });
  },

  /** Budget gate hit: park the job visibly; it is never dropped (spec §6.3). */
  pauseForBudget: async function (id, message) {
    const job = await db().lawJob.findUnique({ where: { id } });
    return db().lawJob.update({
      where: { id },
      data: {
        status: "paused_budget",
        lockedAt: null,
        lockedBy: null,
        error: message,
        attempts: Math.max(0, (job?.attempts || 1) - 1), // a budget pause is not a failed attempt
      },
    });
  },

  /** Manual retry from the Inbox (failed or paused). */
  retry: async function (id) {
    const job = await db().lawJob.findUnique({ where: { id } });
    if (!job) return { error: "not_found" };
    if (!["failed", "paused_budget", "needs_review"].includes(job.status))
      return { error: "not retryable" };
    const updated = await db().lawJob.update({
      where: { id },
      data: {
        status: "queued",
        attempts: 0,
        runAfter: new Date(),
        error: null,
      },
    });
    return { job: present(updated), error: null };
  },

  /** Unpause every user's jobs that waited on a provider's budget (after the admin raises it). */
  resumeBudgetPaused: async function () {
    const { count } = await rawDb().lawJob.updateMany({
      where: { status: "paused_budget" },
      data: { status: "queued", runAfter: new Date() },
    });
    return count;
  },

  /** Checkpoint progress (e.g. transcribed parts) so a retry resumes instead of paying again. */
  updatePayload: async function (id, payload) {
    return db().lawJob.update({
      where: { id },
      data: { payload: JSON.stringify(payload) },
    });
  },

  list: async function ({ status, take = 100 } = {}) {
    const rows = await db().lawJob.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map(present);
  },

  get: async function (id) {
    return present(await db().lawJob.findUnique({ where: { id } }));
  },
};

module.exports = { LawJob };
