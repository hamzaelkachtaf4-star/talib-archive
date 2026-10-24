// candidate_atoms (spec §6.3): from a VERIFIED transcript or OCR derivative, propose PROF atoms with their
// source reference (asset + timestamp, or asset + page). Proposals are an unverified derivative in the
// Inbox; only atoms the student accepts become LawNoteAtoms (spec §1.3).
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError } = require("../ai/errors");
const { db } = require("../dbClient");
const { subjectContext, saveDerivative } = require("./common");
const { serializeOutline } = require("../coursePlan");
const crypto = require("crypto");
const { LawJob } = require("../../../models/lawJob");
const { windowByChars } = require("./windows");

// ~12 000 Arabic characters (about 5-6k tokens) per call; a course of any length is many small calls.
const WINDOW_CHARS = 12000;
const PLAN_CHARS = 3000; // the outline is repeated in every window, so it is capped
const WINDOW_MAX_OUTPUT_TOKENS = 8192;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    atoms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          body: { type: "STRING" },
          sourceIndex: { type: "INTEGER" },
          headingPath: { type: "ARRAY", items: { type: "STRING" } },
          profEmphasis: { type: "BOOLEAN" },
          kind: { type: "STRING" },
        },
        required: ["body", "sourceIndex"],
      },
    },
  },
  required: ["atoms"],
};

/** Numbered source units, each mapped to a PROF source reference. */
function unitsOf(derivative, content, batchAssets) {
  if (derivative.kind === "transcript")
    return (content.segments || []).map((s) => ({
      text: s.text,
      ref: {
        sourceAssetId: s.assetId,
        sourceTimestampSec: s.assetStart ?? s.start,
        sourcePage: null,
      },
    }));
  if (derivative.kind === "ocr_text") {
    if (content.source === "pdf")
      return (content.pages || []).map((p) => ({
        text: p.text,
        ref: {
          sourceAssetId: derivative.assetId,
          sourcePage: p.page,
          sourceTimestampSec: null,
        },
      }));
    return (content.pages || []).map((p, i) => ({
      text: p.text,
      ref: {
        sourceAssetId: p.assetId || batchAssets[i]?.id,
        sourcePage: 1,
        sourceTimestampSec: null,
      },
    }));
  }
  throw new PermanentError(`cannot extract atoms from ${derivative.kind}`);
}

async function candidateAtoms(job, ctx) {
  const source = await db().lawDerivative.findUnique({
    where: { id: job.payload.derivativeId },
  });
  if (!source) throw new PermanentError("derivative not found");
  if (!["verified", "edited"].includes(source.verificationStatus))
    throw new PermanentError("source derivative is not verified");
  const batch = source.batchId
    ? await db().lawCaptureBatch.findUnique({
        where: { id: source.batchId },
        include: { assets: { orderBy: { orderInBatch: "asc" } } },
      })
    : null;
  const units = unitsOf(
    source,
    JSON.parse(source.content),
    batch?.assets || []
  ).filter((u) => u.text?.trim() && u.ref.sourceAssetId);
  if (!units.length) return { skipped: "no text" };
  const subject = await subjectContext(batch?.subjectId);
  const plan = subject?.coursePlan
    ? serializeOutline(JSON.parse(subject.coursePlan))
    : "";

  const prompt = loadPrompt("candidate_atoms", 1);
  const planText = plan ? `تصميم الأستاذ:\n${plan.slice(0, PLAN_CHARS)}\n\n` : "";
  // Unit indexes stay global (they map to sources); each window may only reference its own units.
  const windows = windowByChars(units, (u) => `[0000] ${u.text}`, WINDOW_CHARS);
  const done = { ...(job.payload.windows || {}) };
  let lastOut = null;
  // Keyed by what the window contains (positions, sources and text), not by its number: if the student edits
  // the verified text before a retry, stale results are never reused.
  const keyOf = (idxs) =>
    `${source.id}:${crypto
      .createHash("sha1")
      .update(
        idxs
          .map((i) => `${i}|${units[i].ref.sourceAssetId}|${units[i].ref.sourcePage}|${units[i].ref.sourceTimestampSec}|${units[i].text}`)
          .join("\0")
      )
      .digest("hex")}`;
  for (const idxs of windows) {
    const key = keyOf(idxs);
    if (done[key]) continue; // checkpointed by an earlier attempt: never pay twice
    const out = await generate({
      purpose: "candidate_atoms",
      prompt,
      system: prompt.text,
      parts: [
        {
          text: `${planText}المقاطع:\n${idxs.map((i) => `[${i}] ${units[i].text}`).join("\n")}`,
        },
      ],
      schema: SCHEMA,
      temperature: 0.1,
      maxOutputTokens: WINDOW_MAX_OUTPUT_TOKENS,
      jobId: job.id,
    });
    ctx.track(out);
    lastOut = out;
    const inWindow = new Set(idxs);
    done[key] = (out.json.atoms || [])
      .filter(
        (a) =>
          Number.isInteger(a.sourceIndex) &&
          inWindow.has(a.sourceIndex) &&
          String(a.body || "").trim()
      )
      .map((a) => ({
        body: String(a.body).trim(),
        headingPath: Array.isArray(a.headingPath)
          ? a.headingPath.filter((h) => typeof h === "string")
          : [],
        profEmphasis: !!a.profEmphasis,
        kind: a.kind || "other",
        sourceIndex: a.sourceIndex,
        sourceExcerpt: units[a.sourceIndex].text.slice(0, 400),
        ...units[a.sourceIndex].ref,
      }));
    await LawJob.updatePayload(job.id, { ...job.payload, windows: done });
  }
  const atoms = windows.flatMap((idxs) => done[keyOf(idxs)] || []);
  const out = lastOut;
  const derivative = await saveDerivative({
    batchId: source.batchId,
    assetId: source.assetId,
    kind: "candidate_atoms",
    content: {
      sourceDerivativeId: source.id,
      sessionId: batch?.sessionId || null,
      atoms,
      accepted: [],
    },
    out,
    jobId: job.id,
  });
  // Saved: drop the checkpoints from the job payload (the client lists payloads).
  // (job.payload is the copy loaded at claim time, so the checkpoints written during this attempt are not in it.)
  const { windows: _dropped, ...rest } = job.payload;
  if (windows.length) await LawJob.updatePayload(job.id, rest);
  return { derivativeId: derivative.id, proposed: atoms.length };
}

module.exports = { candidateAtoms, CANDIDATE_SCHEMA: SCHEMA };
