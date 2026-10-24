// ocr_photo_batch (spec §6.3): the session's pages, in order, in one multimodal call with structured output.
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError } = require("../ai/errors");
const { geminiClient } = require("../ai/gemini");
const { lawConfig } = require("../config");
const {
  loadBatch,
  subjectContext,
  contextText,
  markSessionNeedsReview,
  saveDerivative,
  assetAbsPath,
} = require("./common");

const SCHEMA = {
  type: "OBJECT",
  properties: {
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          text: { type: "STRING" },
          headings: { type: "ARRAY", items: { type: "STRING" } },
          frenchTerms: { type: "ARRAY", items: { type: "STRING" } },
          illegible: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["index", "text"],
      },
    },
  },
  required: ["pages"],
};
const MAX_PAGES_PER_CALL = 20;

async function ocrPhotoBatch(job, ctx) {
  const batch = await loadBatch(job.payload.batchId);
  const photos = batch.assets.filter((a) => a.kind === "photo");
  if (!photos.length) throw new PermanentError("batch has no photos");
  const prompt = loadPrompt("ocr_photo_batch", 1);
  const subject = await subjectContext(batch.subjectId);
  const gem = lawConfig().ai.geminiEnabled
    ? geminiClient(lawConfig().gemini)
    : null;

  const pages = [];
  let lastOut = null;
  for (let start = 0; start < photos.length; start += MAX_PAGES_PER_CALL) {
    const group = photos.slice(start, start + MAX_PAGES_PER_CALL);
    const cleanups = [];
    try {
      const parts = [
        {
          text: [contextText(subject), `عدد الصفحات: ${group.length}`]
            .filter(Boolean)
            .join("\n"),
        },
      ];
      for (const a of group) {
        if (!gem) throw new PermanentError("Gemini not configured");
        const { part, cleanup } = await gem.mediaPart(
          assetAbsPath(a.storagePath),
          a.mime,
          a.id
        );
        parts.push(part);
        cleanups.push(cleanup);
      }
      const out = await generate({
        purpose: "ocr",
        prompt,
        system: prompt.text,
        parts,
        schema: SCHEMA,
        temperature: 0,
        maxOutputTokens: 32768,
        jobId: job.id,
      });
      ctx.track(out);
      lastOut = out;
      for (const p of out.json.pages || []) {
        const asset = group[p.index];
        if (!asset) continue;
        pages.push({
          assetId: asset.id,
          index: start + p.index,
          text: p.text || "",
          headings: p.headings || [],
          frenchTerms: p.frenchTerms || [],
          illegible: p.illegible || [],
        });
      }
    } finally {
      for (const c of cleanups) await c();
    }
  }
  // Pages the model skipped are kept, empty and flagged, so the reviewer sees the gap.
  for (const [i, a] of photos.entries())
    if (!pages.some((p) => p.assetId === a.id))
      pages.push({
        assetId: a.id,
        index: i,
        text: "",
        headings: [],
        frenchTerms: [],
        illegible: ["[صفحة لم تُنسخ]"],
      });
  pages.sort((a, b) => a.index - b.index);

  const derivative = await saveDerivative({
    batchId: batch.id,
    kind: "ocr_text",
    content: { pages },
    out: lastOut,
    jobId: job.id,
  });
  await markSessionNeedsReview(batch.sessionId);
  return { derivativeId: derivative.id };
}

module.exports = { ocrPhotoBatch, OCR_SCHEMA: SCHEMA };
