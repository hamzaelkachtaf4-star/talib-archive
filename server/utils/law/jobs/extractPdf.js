// extract_pdf (spec §6.3): text layer first (no AI cost); only pages without usable text go to Gemini
// vision. align_polycopie needs the course plan and is scheduled in Phase 4.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");
const { PermanentError, ProviderError } = require("../ai/errors");
const { geminiClient } = require("../ai/gemini");
const { lawConfig } = require("../config");
const { LawJob } = require("../../../models/lawJob");
const { chunkEvery } = require("./windows");
const { openPdf } = require("./pdfPages");
const { looksGarbledArabic } = require("./textQuality");
const {
  loadBatch,
  markSessionNeedsReview,
  saveDerivative,
  assetAbsPath,
} = require("./common");

const MIN_CHARS = 40; // below this a page is treated as scanned
const PAGES_PER_CALL = 10; // scanned pages per vision call; a longer scan is many small calls
const WINDOW_MAX_OUTPUT_TOKENS = 16384;
// pdf-lib parses the whole file in memory: above this size (or when it cannot open the file) windows ask for page
// numbers from the whole file, uploaded once per PDF. The input then covers every page on each call, so the
// windows are larger to keep the number of calls (and the re-billed input) down.
const DEFAULT_SPLIT_MAX_BYTES = 40 * 1024 * 1024;
const WHOLE_FILE_PAGES_PER_CALL = 40;
// Provider answers that more pages will not fix but fewer pages might: halve the window, and when a single
// page is still unreadable, give up on that page only.
const UNRESOLVABLE = /truncated|returned no text|invalid JSON/i;
// Upper bound on model calls spent on one window (halving, re-asking omitted pages). Whole-file mode resends
// the entire PDF on every call and the monthly budget is shared by all students, so this must stay small.
const MAX_CALLS_PER_WINDOW = 12;
const splitMaxBytes = () => {
  const n = Number(process.env.LAWOS_PDF_SPLIT_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SPLIT_MAX_BYTES;
};
const SCHEMA = {
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

/** Per-page text with pdf-parse (the lib entry avoids pdf-parse's debug self-test on require). */
async function textLayer(buffer, { maxPages = 0 } = {}) {
  const pdf = require("pdf-parse/lib/pdf-parse.js");
  const pages = [];
  await pdf(buffer, {
    max: maxPages, // 0 = every page; a cap keeps a hostile file from holding the process
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: true,
      });
      let last;
      let text = "";
      for (const item of content.items) {
        text +=
          last === undefined || last === item.transform[5]
            ? item.str
            : `\n${item.str}`;
        last = item.transform[5];
      }
      pages[pageData.pageIndex] = text.trim();
      return text;
    },
  });
  return pages.map((t) => t || "");
}

async function extractPdf(job, ctx) {
  const batch = await loadBatch(job.payload.batchId);
  const pdfs = batch.assets.filter((a) => a.kind === "pdf");
  if (!pdfs.length) throw new PermanentError("batch has no PDF");
  const derivatives = [];
  // Page texts read by earlier attempts are never paid for twice. One map for the whole job (keys carry the
  // asset id): each save rewrites the payload, so it must hold every PDF's pages, not just the current one.
  const done = { ...(job.payload.pdfPages || {}) };
  // Pages the model cannot read even one at a time (output limit, empty answer, unusable JSON): marked
  // vision_failed so the rest of the PDF is kept; the student sees them in the Inbox and can type them in.
  const failed = new Set(job.payload.pdfFailed || []);
  for (const asset of pdfs) {
    const file = assetAbsPath(asset.storagePath);
    const buffer = fs.readFileSync(file);
    let texts;
    try {
      texts = await textLayer(buffer);
    } catch (e) {
      throw new PermanentError(`unreadable PDF: ${e.message}`);
    }
    const pages = texts.map((text, i) => ({
      page: i + 1,
      text,
      method: "text",
    }));
    // A page is read by vision when it has no text layer, or when the layer is in visual order (garbled Arabic): accepting
    // that text would put corrupted words into a statute with nothing to show it.
    const garbled = new Set(pages.filter((p) => looksGarbledArabic(p.text)).map((p) => p.page));
    const scanned = pages
      .filter((p) => p.text.replace(/\s/g, "").length < MIN_CHARS || garbled.has(p.page))
      .map((p) => p.page);
    let out = null;
    if (scanned.length) {
      const cfg = lawConfig();
      if (!cfg.ai.geminiEnabled) {
        for (const p of pages) {
          if (!scanned.includes(p.page)) continue;
          if (garbled.has(p.page)) Object.assign(p, { text: "", method: "garbled_pending_ai" }); // the corrupt text is not kept
          else p.method = "scanned_pending_ai";
        }
      } else {
        const gem = geminiClient(cfg.gemini);
        const prompt = loadPrompt("extract_pdf_vision", 1);
        const handle = buffer.length <= splitMaxBytes() ? await openPdf(buffer) : null;
        const keyOf = (page) => `${asset.id}:${page}`;

        // The whole file, uploaded on first use and reused by every window of this PDF.
        let whole = null;
        const wholeFile = async () => (whole ||= await gem.mediaPart(file, "application/pdf", asset.id));

        const flag = async (nums) => {
          for (const p of nums) failed.add(keyOf(p));
          await LawJob.updatePayload(job.id, { ...job.payload, pdfPages: done, pdfFailed: [...failed] });
        };

        // One vision call for these (ascending) page numbers. An unresolvable answer is retried on two halves;
        // pages missing from a successful answer are asked for once more; whatever is still unread when a single
        // page fails, or the window's call budget is spent, is flagged vision_failed.
        const readWindow = async (nums, budget, reask = true) => {
          if (budget.left <= 0) {
            budget.unsent.push(...nums); // never sent: not the model's fault, so not flagged; they get a window of their own
            return;
          }
          budget.left--;
          let tmpDir = null;
          let media = null;
          let sub = false; // true: the model sees a sub-PDF and numbers pages 1..n inside it
          let split = false;
          try {
            let bytes = null;
            if (handle) {
              try {
                bytes = await handle.sub(nums);
              } catch {
                bytes = null; // pdf-lib could not copy these pages: use the whole file for this window
              }
            }
            let part;
            if (bytes) {
              tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-pdfwin-"));
              const f = path.join(tmpDir, "window.pdf");
              fs.writeFileSync(f, bytes);
              media = await gem.mediaPart(f, "application/pdf", `${asset.id}-${nums[0]}`);
              part = media.part;
              sub = true;
            } else {
              part = (await wholeFile()).part;
            }
            const asked = sub ? nums.map((_, i) => i + 1) : nums;
            const res = await generate({
              purpose: "pdf_vision",
              prompt,
              system: prompt.text,
              parts: [{ text: `الصفحات المطلوبة: ${asked.join(", ")}` }, part],
              schema: SCHEMA,
              temperature: 0,
              maxOutputTokens: WINDOW_MAX_OUTPUT_TOKENS,
              jobId: job.id,
            });
            ctx.track(res);
            out = res;
            for (const v of res.json.pages || []) {
              const orig = sub ? nums[v.page - 1] : v.page;
              if (nums.includes(orig)) done[keyOf(orig)] = v.text || "";
            }
            await LawJob.updatePayload(job.id, { ...job.payload, pdfPages: done, pdfFailed: [...failed] });
          } catch (e) {
            if (!(e instanceof ProviderError && UNRESOLVABLE.test(e.message))) throw e;
            if (nums.length > 1) split = true;
            else await flag(nums);
          } finally {
            if (media) await media.cleanup();
            if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
          }
          if (split) {
            const mid = Math.ceil(nums.length / 2);
            await readWindow(nums.slice(0, mid), budget);
            await readWindow(nums.slice(mid), budget);
            return;
          }
          const missing = nums.filter((p) => !(keyOf(p) in done) && !failed.has(keyOf(p)));
          if (missing.length) {
            if (reask) await readWindow(missing, budget, false);
            else await flag(missing);
          }
        };

        try {
          const perCall = handle ? PAGES_PER_CALL : WHOLE_FILE_PAGES_PER_CALL;
          const queue = chunkEvery(scanned.filter((p) => !(keyOf(p) in done) && !failed.has(keyOf(p))), perCall);
          // Zero-progress breaker: a PDF the model refuses on every call from the very start (e.g. SAFETY) must not
          // cost one budget per window for the whole document. It only applies while NOTHING of this PDF has been
          // read: once a page has been read, a refused stretch is just a bad stretch, and the pages after it are
          // still sent (they are never flagged unless the model actually failed on them).
          const anyRead = () => scanned.some((p) => keyOf(p) in done);
          let barren = 0;
          for (let guard = 0; queue.length && guard < scanned.length * 2 + 10; guard++) {
            const nums = queue.shift();
            const budget = { left: MAX_CALLS_PER_WINDOW, unsent: [] };
            await readWindow(nums, budget);
            barren = !anyRead() ? barren + 1 : 0;
            if (barren >= 2) {
              await flag([...budget.unsent, ...queue.flat()].filter((p) => !(keyOf(p) in done) && !failed.has(keyOf(p))));
              break;
            }
            if (budget.unsent.length) queue.unshift(...chunkEvery(budget.unsent, perCall));
          }
        } finally {
          if (whole) await whole.cleanup();
        }
        for (const p of pages) {
          if (!scanned.includes(p.page)) continue;
          if (keyOf(p.page) in done) Object.assign(p, { text: done[keyOf(p.page)], method: "vision" });
          else if (failed.has(keyOf(p.page))) Object.assign(p, { text: "", method: "vision_failed" });
          else if (garbled.has(p.page)) Object.assign(p, { text: "", method: "garbled_pending_ai" }); // never keep corrupt text, whatever stopped the loop
        }
      }
    }
    const failedPages = pages.filter((p) => p.method === "vision_failed").map((p) => p.page);
    const garbledPages = pages.filter((p) => p.method === "garbled_pending_ai").map((p) => p.page); // blank until read by a model
    derivatives.push(
      (
        await saveDerivative({
          batchId: batch.id,
          assetId: asset.id,
          kind: "ocr_text",
          content: { source: "pdf", pages, ...(failedPages.length ? { failedPages } : {}), ...(garbledPages.length ? { garbledPages } : {}) },
          out,
          jobId: job.id,
        })
      ).id
    );
  }
  await markSessionNeedsReview(batch.sessionId);
  // The result is saved: drop the page texts from the job payload (the client lists payloads).
  // (job.payload is the copy loaded at claim time, so pages checkpointed during this attempt are not in it.)
  const { pdfPages: _p, pdfFailed: _f, ...rest } = job.payload;
  if (Object.keys(done).length || failed.size) await LawJob.updatePayload(job.id, rest);
  return { derivativeIds: derivatives };
}

module.exports = { extractPdf, textLayer };
