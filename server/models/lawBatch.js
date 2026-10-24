// Capture batches (spec §5.2, §6.1): a photo set, an audio recording (its 5-minute segments) or an
// imported file. Created idempotently by clientBatchId so a batch made offline is created exactly once.
const { db } = require("../utils/law/dbClient");
const { LawJob } = require("./lawJob");
const { LawSession } = require("./lawSession");
const { LawTimetable } = require("./lawTimetable");
const { localDate, localTime } = require("../utils/law/time");

const KINDS = ["photo_batch", "audio_recording", "pdf", "import"];
const SLOT_GRACE_MIN = 15; // a capture just before/after a class still belongs to it

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Auto-labelling (spec §6.1): a capture made during a timetable slot goes to that slot's subject and
 * today's session for it. Placeholder slots (no subject) label nothing.
 */
async function slotAt(when) {
  const day = localDate(when);
  const t = toMinutes(localTime(when));
  const slots = await LawTimetable.forDate(day);
  return (
    slots.find(
      (s) =>
        s.subjectId &&
        t >= toMinutes(s.startTime) - SLOT_GRACE_MIN &&
        t <= toMinutes(s.endTime) + SLOT_GRACE_MIN
    ) || null
  );
}

function jobTypeFor(batch, assets) {
  if (batch.kind === "photo_batch") return "ocr_photo_batch";
  if (batch.kind === "audio_recording") return "transcribe_audio";
  if (batch.kind === "pdf") return "extract_pdf";
  const kinds = new Set(assets.map((a) => a.kind));
  if (kinds.has("audio")) return "transcribe_audio";
  if (kinds.has("pdf")) return "extract_pdf";
  if (kinds.has("photo")) return "ocr_photo_batch";
  return null;
}

const LawBatch = {
  KINDS,
  slotAt,

  create: async function ({
    clientBatchId,
    kind,
    subjectId = null,
    sessionId = null,
    expectedParts = null,
    capturedAt,
  } = {}) {
    if (
      typeof clientBatchId !== "string" ||
      clientBatchId.length < 8 ||
      clientBatchId.length > 100
    )
      return { error: "invalid clientBatchId" };
    if (!KINDS.includes(kind)) return { error: "invalid kind" };
    if (
      expectedParts !== null &&
      (!Number.isInteger(expectedParts) ||
        expectedParts < 1 ||
        expectedParts > 500)
    )
      return { error: "invalid expectedParts" };
    const existing = await db().lawCaptureBatch.findFirst({
      where: { clientBatchId },
    });
    if (existing) return { batch: existing, error: null };

    const when =
      capturedAt && !isNaN(Date.parse(capturedAt))
        ? new Date(capturedAt)
        : new Date();
    let labelled = { subjectId, sessionId };
    if (
      subjectId &&
      !(await db().lawSubject.findUnique({ where: { id: subjectId } }))
    )
      return { error: "unknown subject" };
    if (!subjectId) {
      const slot = await slotAt(when);
      if (slot) labelled.subjectId = slot.subjectId;
      if (slot && !sessionId)
        labelled.sessionId = (
          await LawSession.findOrCreate({
            subjectId: slot.subjectId,
            slotId: slot.id,
            date: localDate(when),
          })
        ).session?.id;
    } else if (!sessionId) {
      labelled.sessionId = (
        await LawSession.findOrCreate({
          subjectId,
          slotId: null,
          date: localDate(when),
        })
      ).session?.id;
    }

    try {
      const batch = await db().lawCaptureBatch.create({
        data: {
          clientBatchId,
          kind,
          expectedParts,
          capturedAt: when,
          ...labelled,
        },
      });
      return { batch, error: null };
    } catch (e) {
      if (e?.code !== "P2002") throw e;
      return {
        batch: await db().lawCaptureBatch.findFirst({
          where: { clientBatchId },
        }),
        error: null,
      };
    }
  },

  /**
   * Close the batch once every part has arrived and enqueue its processing job. Idempotent.
   * @returns {{batch, job, error, waiting?}}
   */
  complete: async function (id, { expectedParts } = {}) {
    let batch = await db().lawCaptureBatch.findUnique({ where: { id } });
    if (!batch) return { error: "not_found" };
    if (batch.status === "complete") {
      const job = await db().lawJob.findFirst({
        where: { payload: { contains: `"batchId":"${id}"` } },
      });
      return { batch, job, error: null };
    }
    if (expectedParts !== undefined) {
      if (!Number.isInteger(expectedParts) || expectedParts < 1)
        return { error: "invalid expectedParts" };
      batch = await db().lawCaptureBatch.update({
        where: { id },
        data: { expectedParts },
      });
    }
    const assets = await db().lawAsset.findMany({
      where: { batchId: id },
      orderBy: { orderInBatch: "asc" },
    });
    if (!batch.expectedParts) return { error: "expectedParts unknown" };
    if (assets.length < batch.expectedParts)
      return {
        error: "waiting for parts",
        waiting: batch.expectedParts - assets.length,
        batch,
      };

    const type = jobTypeFor(batch, assets);
    batch = await db().lawCaptureBatch.update({
      where: { id },
      data: { status: "complete", receivedParts: assets.length },
    });
    if (batch.sessionId)
      await db().lawClassSession.updateMany({
        where: { id: batch.sessionId },
        data: { status: "processing" },
      });
    const job = type ? await LawJob.enqueue(type, { batchId: id }) : null;
    return { batch, job, error: null };
  },

  get: async function (id) {
    return db().lawCaptureBatch.findUnique({
      where: { id },
      include: {
        assets: { orderBy: { orderInBatch: "asc" } },
        derivatives: true,
      },
    });
  },

  update: async function (id, { subjectId, sessionId } = {}) {
    const data = {};
    if (subjectId !== undefined) {
      if (
        subjectId &&
        !(await db().lawSubject.findUnique({ where: { id: subjectId } }))
      )
        return { error: "unknown subject" };
      data.subjectId = subjectId || null;
    }
    if (sessionId !== undefined) data.sessionId = sessionId || null;
    try {
      const batch = await db().lawCaptureBatch.update({ where: { id }, data });
      await db().lawAsset.updateMany({ where: { batchId: id }, data });
      return { batch, error: null };
    } catch {
      return { error: "not_found" };
    }
  },
};

module.exports = { LawBatch, jobTypeFor };
