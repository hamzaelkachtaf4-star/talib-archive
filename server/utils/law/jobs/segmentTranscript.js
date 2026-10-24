// segment_transcript (spec §6.3): topic boundaries aligned with the professor's course plan.
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError } = require("../ai/errors");
const { db } = require("../dbClient");
const { subjectContext, saveDerivative } = require("./common");

const SCHEMA = {
  type: "OBJECT",
  properties: {
    topics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          startSec: { type: "NUMBER" },
          endSec: { type: "NUMBER" },
          headingPath: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "startSec", "endSec"],
      },
    },
  },
  required: ["topics"],
};

function fmt(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

async function segmentTranscript(job, ctx) {
  const source = await db().lawDerivative.findUnique({
    where: { id: job.payload.derivativeId },
  });
  if (!source || source.kind !== "transcript")
    throw new PermanentError("transcript not found");
  const batch = source.batchId
    ? await db().lawCaptureBatch.findUnique({ where: { id: source.batchId } })
    : null;
  const subject = await subjectContext(batch?.subjectId);
  const { segments = [] } = JSON.parse(source.content);
  if (!segments.length) return { skipped: "empty transcript" };

  const prompt = loadPrompt("segment_transcript", 1);
  const lines = segments
    .map((s) => `[${Math.round(s.start)}s ${fmt(s.start)}] ${s.text}`)
    .join("\n");
  const plan = subject?.coursePlan
    ? `تصميم الأستاذ:\n${subject.coursePlan}`
    : "لا يوجد تصميم للمادة بعد.";
  const out = await generate({
    purpose: "segmentation",
    prompt,
    system: prompt.text,
    parts: [{ text: `${plan}\n\nنص المحاضرة:\n${lines}` }],
    schema: SCHEMA,
    temperature: 0.1,
    jobId: job.id,
  });
  ctx.track(out);
  const derivative = await saveDerivative({
    batchId: source.batchId,
    kind: "segments",
    content: { sourceDerivativeId: source.id, topics: out.json.topics || [] },
    out,
    jobId: job.id,
  });
  return { derivativeId: derivative.id };
}

module.exports = { segmentTranscript };
