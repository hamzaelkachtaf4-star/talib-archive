// In-process job worker (spec §4.2, §6.3): one job at a time, so the dv6 is never asked to run two AI
// pipelines or two ffmpeg passes concurrently. kick() wakes it immediately after an enqueue.
const { LawJob } = require("../../models/lawJob");
const { LawUpload } = require("../../models/lawUpload");
const { BudgetError, PermanentError } = require("./ai/errors");
const { asSystem, runAs } = require("./tenant");
const { rawDb } = require("./dbClient");

const POLL_MS = 5000;
const HOUSEKEEPING_MS = 60 * 60 * 1000;

const handlers = {
  ocr_photo_batch: (...a) =>
    require("./jobs/ocrPhotoBatch").ocrPhotoBatch(...a),
  transcribe_audio: (...a) =>
    require("./jobs/transcribeAudio").transcribeAudio(...a),
  segment_transcript: (...a) =>
    require("./jobs/segmentTranscript").segmentTranscript(...a),
  extract_pdf: (...a) => require("./jobs/extractPdf").extractPdf(...a),
  scrape_source: (...a) => require("./jobs/radar").scrapeSource(...a),
  weekly_recap: (...a) => require("./jobs/radar").weeklyRecap(...a),
  critique_case: (...a) => require("./jobs/critique").critiqueCase(...a),
  critique_dissertation: (...a) =>
    require("./jobs/critique").critiqueDissertation(...a),
  candidate_atoms: (...a) =>
    require("./jobs/candidateAtoms").candidateAtoms(...a),
  align_polycopie: (...a) =>
    require("./jobs/alignPolycopie").alignPolycopie(...a),
  parse_corpus_import: (...a) =>
    require("./jobs/parseCorpusImport").parseCorpusImport(...a),
};

function registerHandler(type, fn) {
  handlers[type] = fn;
}

/** The context a job's handler runs in: its owner, or system for global jobs (radar scans). */
async function ownerContext(job) {
  if (!Number.isInteger(job.userId)) return { system: true };
  const user = await rawDb().users.findUnique({
    where: { id: job.userId },
    select: { role: true },
  });
  return { userId: job.userId, role: user?.role || "default" };
}

/** Runs one job if any is due. Returns the job outcome, or null when the queue is empty. */
async function runOnce({ now = new Date() } = {}) {
  return asSystem(async () => {
    const job = await LawJob.claim({ now });
    if (!job) return null;
    return execute(job, await ownerContext(job));
  });
}

/** Queue bookkeeping runs as system; the handler itself runs as the job's owner. */
async function execute(job, owner) {
  const started = Date.now();
  const usage = {
    tokensIn: 0,
    tokensOut: 0,
    estimatedCostUsd: 0,
    provider: null,
    model: null,
  };
  const ctx = {
    track(out) {
      usage.tokensIn += out.usage?.tokensIn || 0;
      usage.tokensOut += out.usage?.tokensOut || 0;
      usage.estimatedCostUsd += out.costUsd || 0;
      usage.provider = out.provider || usage.provider;
      usage.model = out.model || usage.model;
    },
  };
  const handler = handlers[job.type];
  try {
    if (!handler) throw new PermanentError(`no handler for ${job.type}`);
    const result = await runAs(owner, () => handler(job, ctx));
    await LawJob.succeed(job.id, { usage, durationMs: Date.now() - started });
    return { job, status: "succeeded", result };
  } catch (e) {
    // Job logs carry IDs and error messages only, never transcript text (spec §12).
    console.error(`[LAW-OS] job ${job.type} ${job.id} failed:`, e.message);
    if (e instanceof BudgetError) {
      await LawJob.pauseForBudget(job.id, e.message);
      return { job, status: "paused_budget", error: e.message };
    }
    const updated = await LawJob.fail(job.id, e, {
      permanent: e instanceof PermanentError,
    });
    return { job, status: updated?.status, error: e.message };
  }
}

let timer = null;
let running = false;
let stopped = true;
let lastHousekeeping = 0;
let lastSchedulerTick = 0;

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    if (Date.now() - lastSchedulerTick > 60 * 1000) {
      lastSchedulerTick = Date.now();
      await asSystem(() => require("./scheduler").tick()).catch((e) =>
        console.error("[LAW-OS] scheduler failed:", e.message)
      );
    }
    if (Date.now() - lastHousekeeping > HOUSEKEEPING_MS) {
      lastHousekeeping = Date.now();
      await asSystem(() => LawUpload.cleanupExpired()).catch((e) =>
        console.error("[LAW-OS] cleanup failed:", e.message)
      );
    }
    // Drain everything that is due, one at a time.
    while (!stopped && (await runOnce())) {}
  } catch (e) {
    console.error("[LAW-OS] worker tick failed:", e.message);
  } finally {
    running = false;
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  }
}

function start() {
  if (!stopped) return;
  stopped = false;
  timer = setTimeout(tick, 1000);
}

function stop() {
  stopped = true;
  if (timer) clearTimeout(timer);
}

/** Wake the worker now (after enqueueing). */
function kick() {
  if (stopped || running) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, 0);
}

module.exports = { start, stop, kick, runOnce, registerHandler, handlers };
