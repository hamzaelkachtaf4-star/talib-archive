// parse_corpus_import: text of an uploaded official PDF → article proposals for the review screen.
// Text layer first; scanned pages go to Gemini vision only when configured, otherwise they are reported
// so the student can paste the text instead. Nothing here writes to the corpus (spec §6.5).
const fs = require("fs");
const { db } = require("../dbClient");
const { LawCorpus } = require("../../../models/lawCorpus");
const { PermanentError } = require("../ai/errors");
const { assetAbsPath } = require("../assets");
const { lawConfig } = require("../config");
const { geminiClient } = require("../ai/gemini");
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { textLayer } = require("./extractPdf");

const MIN_CHARS = 40;
const VISION_SCHEMA = {
  type: "OBJECT",
  properties: {
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { page: { type: "INTEGER" }, text: { type: "STRING" } },
        required: ["page", "text"],
      },
    },
  },
  required: ["pages"],
};

async function parseCorpusImport(job, ctx) {
  const imp = await db().lawCorpusImport.findUnique({
    where: { id: job.payload.importId },
    include: { sourceDocument: true },
  });
  if (!imp) throw new PermanentError("import not found");
  if (imp.status !== "parsing") return { skipped: imp.status };
  const src = imp.sourceDocument;
  if (!src?.storagePath)
    throw new PermanentError("import has no uploaded file");
  const file = assetAbsPath(src.storagePath);

  let pages;
  try {
    pages = await textLayer(fs.readFileSync(file));
  } catch (e) {
    await db().lawCorpusImport.update({
      where: { id: imp.id },
      data: { status: "failed" },
    });
    throw new PermanentError(`unreadable PDF: ${e.message}`);
  }
  const scanned = pages
    .map((t, i) => (t.replace(/\s/g, "").length < MIN_CHARS ? i + 1 : null))
    .filter(Boolean);
  const warnings = [];
  if (scanned.length) {
    const cfg = lawConfig();
    if (!cfg.ai.geminiEnabled) {
      warnings.push(
        `scanned pages without text: ${scanned.join(", ")} (paste their text or configure Gemini)`
      );
    } else {
      const gem = geminiClient(cfg.gemini);
      const prompt = loadPrompt("extract_pdf_vision", 1);
      const { part, cleanup } = await gem.mediaPart(
        file,
        "application/pdf",
        src.id
      );
      try {
        const out = await generate({
          purpose: "pdf_vision",
          prompt,
          system: prompt.text,
          parts: [{ text: `الصفحات المطلوبة: ${scanned.join(", ")}` }, part],
          schema: VISION_SCHEMA,
          temperature: 0,
          maxOutputTokens: 65536,
          jobId: job.id,
        });
        ctx.track(out);
        for (const p of out.json.pages || [])
          if (scanned.includes(p.page)) pages[p.page - 1] = p.text || "";
        warnings.push(
          `pages read by AI OCR (verify carefully): ${scanned.join(", ")}`
        );
      } finally {
        await cleanup();
      }
    }
  }
  await LawCorpus.finishParsing(imp.id, pages.join("\n"), warnings);
  return { importId: imp.id };
}

module.exports = { parseCorpusImport };
