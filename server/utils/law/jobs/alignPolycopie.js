// align_polycopie (spec §6.3): pages of a verified polycopié → positions in the course plan
// (polycopie_map derivative, reviewed in the Inbox).
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError } = require("../ai/errors");
const { db } = require("../dbClient");
const { saveDerivative } = require("./common");
const { serializeOutline } = require("../coursePlan");

const SCHEMA = {
  type: "OBJECT",
  properties: {
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          page: { type: "INTEGER" },
          headingPath: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["page", "headingPath"],
      },
    },
  },
  required: ["pages"],
};

async function alignPolycopie(job, ctx) {
  const source = await db().lawDerivative.findUnique({
    where: { id: job.payload.derivativeId },
  });
  if (!source) throw new PermanentError("derivative not found");
  const content = JSON.parse(source.content);
  if (content.source !== "pdf") throw new PermanentError("not a polycopié");
  const batch = source.batchId
    ? await db().lawCaptureBatch.findUnique({ where: { id: source.batchId } })
    : null;
  const subject = batch?.subjectId
    ? await db().lawSubject.findUnique({ where: { id: batch.subjectId } })
    : null;
  if (!subject?.coursePlan) return { skipped: "no course plan" };
  const prompt = loadPrompt("align_polycopie", 1);
  const pages = (content.pages || [])
    .map((p) => `[صفحة ${p.page}]\n${String(p.text).slice(0, 1500)}`)
    .join("\n\n");
  const out = await generate({
    purpose: "polycopie_alignment",
    prompt,
    system: prompt.text,
    parts: [
      {
        text: `تصميم الأستاذ:\n${serializeOutline(JSON.parse(subject.coursePlan))}\n\nالصفحات:\n${pages}`,
      },
    ],
    schema: SCHEMA,
    temperature: 0,
    jobId: job.id,
  });
  ctx.track(out);
  const d = await saveDerivative({
    batchId: source.batchId,
    assetId: source.assetId,
    kind: "polycopie_map",
    content: { sourceDerivativeId: source.id, pages: out.json.pages || [] },
    out,
    jobId: job.id,
  });
  return { derivativeId: d.id };
}

module.exports = { alignPolycopie };
