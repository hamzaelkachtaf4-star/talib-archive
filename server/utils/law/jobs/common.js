const { db } = require("../dbClient");
const { assetAbsPath } = require("../assets");
const { PermanentError } = require("../ai/errors");

async function loadBatch(batchId) {
  const batch = await db().lawCaptureBatch.findUnique({
    where: { id: batchId },
    include: { assets: { orderBy: { orderInBatch: "asc" } } },
  });
  if (!batch) throw new PermanentError(`batch ${batchId} not found`);
  return batch;
}

async function subjectContext(subjectId) {
  if (!subjectId) return null;
  return db().lawSubject.findUnique({
    where: { id: subjectId },
    select: {
      name: true,
      nameFr: true,
      professorName: true,
      professorNotes: true,
      coursePlan: true,
    },
  });
}

/** Short context block for prompts: subject + professor terminology (spec §3.1). No personal data. */
function contextText(subject) {
  if (!subject) return "";
  const lines = [
    `المادة: ${subject.name}${subject.nameFr ? ` (${subject.nameFr})` : ""}`,
  ];
  if (subject.professorNotes)
    lines.push(
      `ملاحظات عن مصطلحات الأستاذ: ${subject.professorNotes.slice(0, 1500)}`
    );
  return lines.join("\n");
}

async function markSessionNeedsReview(sessionId) {
  if (sessionId)
    await db().lawClassSession.updateMany({
      where: { id: sessionId },
      data: { status: "needs_review" },
    });
}

async function saveDerivative({
  batchId = null,
  assetId = null,
  kind,
  content,
  language = "ar",
  out,
  jobId,
}) {
  return db().lawDerivative.create({
    data: {
      batchId,
      assetId,
      kind,
      content: typeof content === "string" ? content : JSON.stringify(content),
      language,
      provider: out?.provider ?? null,
      model: out?.model ?? null,
      jobId,
    },
  });
}

module.exports = {
  loadBatch,
  subjectContext,
  contextText,
  markSessionNeedsReview,
  saveDerivative,
  assetAbsPath,
};
