// transcribe_audio (spec §6.3): every audio asset of the batch (recorder segments or one imported file),
// split into ≤10-minute parts with ffmpeg stream copy, each part transcribed with timestamps, then merged
// on one timeline. Per-part results are checkpointed in the job payload so a retry never pays twice.
const fs = require("fs");
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError } = require("../ai/errors");
const { geminiClient } = require("../ai/gemini");
const { lawConfig } = require("../config");
const { probeDuration, splitAudio } = require("../media");
const { db } = require("../dbClient");
const { LawJob } = require("../../../models/lawJob");
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
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          text: { type: "STRING" },
          uncertain: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["start", "end", "text"],
      },
    },
  },
  required: ["segments"],
};
const PART_SEC = 600;
const SPLIT_ABOVE_SEC = 12 * 60;
const MIN_PART_SEC = 1.5;

/**
 * Places part-relative segments on the batch timeline.
 * @returns segments with absolute start/end (batch timeline) and assetId + assetStart (for jump-to-audio)
 */
function mergeSegments(partResults) {
  const out = [];
  for (const r of partResults) {
    for (const s of r.segments || []) {
      const start = Math.max(0, Math.min(Number(s.start) || 0, r.durationSec));
      const end = Math.max(
        start,
        Math.min(Number(s.end) || start, r.durationSec)
      );
      out.push({
        assetId: r.assetId,
        assetStart: Math.round((r.assetOffsetSec + start) * 10) / 10,
        start: Math.round((r.timelineOffsetSec + start) * 10) / 10,
        end: Math.round((r.timelineOffsetSec + end) * 10) / 10,
        text: String(s.text || "").trim(),
        uncertain: s.uncertain || [],
      });
    }
  }
  return out.filter((s) => s.text).sort((a, b) => a.start - b.start);
}

async function transcribeAudio(job, ctx) {
  const batch = await loadBatch(job.payload.batchId);
  const audio = batch.assets.filter((a) => a.kind === "audio");
  if (!audio.length) throw new PermanentError("batch has no audio");
  const cfg = lawConfig();
  if (!cfg.ai.geminiEnabled) throw new PermanentError("Gemini not configured");
  const gem = geminiClient(cfg.gemini);
  const prompt = loadPrompt("transcribe_audio", 1);
  const subject = await subjectContext(batch.subjectId);
  const done = { ...(job.payload.parts || {}) };

  const partResults = [];
  let timeline = 0;
  let lastOut = null;
  for (const asset of audio) {
    const file = assetAbsPath(asset.storagePath);
    const duration = asset.durationSec || (await probeDuration(file));
    if (!asset.durationSec)
      await db().lawAsset.update({
        where: { id: asset.id },
        data: { durationSec: duration },
      });
    const split =
      duration > SPLIT_ABOVE_SEC ? await splitAudio(file, PART_SEC) : null;
    const parts = split
      ? split.parts
      : [{ file, offsetSec: 0, durationSec: duration }];
    try {
      for (const [i, part] of parts.entries()) {
        const key = `${asset.id}:${i}`;
        // Copy-mode cuts snap to packets and can leave a sub-second tail: not worth a model call.
        if (part.durationSec < MIN_PART_SEC) continue;
        if (!done[key]) {
          const { part: media, cleanup } = await gem.mediaPart(
            part.file,
            asset.mime,
            `${asset.id}-${i}`
          );
          try {
            const out = await generate({
              purpose: "transcription",
              prompt,
              system: prompt.text,
              parts: [
                {
                  text: [
                    contextText(subject),
                    `مدة هذا المقطع: ${Math.round(part.durationSec)} ثانية`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                },
                media,
              ],
              schema: SCHEMA,
              temperature: 0,
              maxOutputTokens: 32768,
              jobId: job.id,
            });
            ctx.track(out);
            lastOut = out;
            done[key] = {
              segments: out.json.segments || [],
              provider: out.provider,
              model: out.model,
            };
            await LawJob.updatePayload(job.id, { ...job.payload, parts: done });
          } finally {
            await cleanup();
          }
        }
        partResults.push({
          assetId: asset.id,
          segments: done[key].segments,
          durationSec: part.durationSec,
          assetOffsetSec: part.offsetSec,
          timelineOffsetSec: timeline + part.offsetSec,
        });
      }
    } finally {
      if (split) fs.rmSync(split.dir, { recursive: true, force: true });
    }
    timeline += duration;
  }

  const segments = mergeSegments(partResults);
  const last = Object.values(done).find((d) => d.provider) || {};
  const derivative = await saveDerivative({
    batchId: batch.id,
    kind: "transcript",
    content: { durationSec: Math.round(timeline * 10) / 10, segments },
    out: lastOut || last,
    jobId: job.id,
  });
  await markSessionNeedsReview(batch.sessionId);
  await LawJob.enqueue("segment_transcript", {
    derivativeId: derivative.id,
    batchId: batch.id,
  });
  return { derivativeId: derivative.id, segments: segments.length };
}

module.exports = { transcribeAudio, mergeSegments, TRANSCRIPT_SCHEMA: SCHEMA };
