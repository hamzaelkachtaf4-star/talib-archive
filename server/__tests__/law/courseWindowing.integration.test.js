// A 200-page course must never travel in one model call. candidate_atoms sends bounded text windows and
// extract_pdf sends small sub-PDFs of the scanned pages; both checkpoint each window in the job payload so a
// retry does not pay twice, and a truncated vision answer is retried on smaller halves.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { LawUpload } = require("../../models/lawUpload");
const { LawBatch } = require("../../models/lawBatch");
const { LawJob } = require("../../models/lawJob");
const { LawSetting } = require("../../models/lawSetting");
const router = require("../../utils/law/ai/router");
const { ProviderError } = require("../../utils/law/ai/errors");
const { candidateAtoms } = require("../../utils/law/jobs/candidateAtoms");
const { extractPdf } = require("../../utils/law/jobs/extractPdf");

jest.setTimeout(60000);

// pdf-parse 1.1.1 chokes on pdf-lib-generated fixtures. The mock reports the page count (from pdf-lib, or from a
// "FAKEPDF:<n>" marker for files pdf-lib cannot open) and an empty text layer, except for pages listed in
// global.__textPages (0-based) which get a real-looking text layer.
jest.mock("pdf-parse/lib/pdf-parse.js", () => async (buf, opts) => {
  let count;
  try {
    const { PDFDocument: Doc } = require("pdf-lib");
    count = (await Doc.load(buf)).getPageCount();
  } catch {
    count = Number(/FAKEPDF:(\d+)/.exec(buf.toString("latin1"))[1]);
  }
  for (let i = 0; i < count; i++) {
    const withText = (global.__textPages || new Set()).has(i);
    const garbled = (global.__garbledPages || new Set()).has(i);
    // a garbled page: plenty of text, but in visual order (reversed words, split letters)
    const str = garbled ? "ريغ نيبو مهنيب وأ راجتلا ن وناقلا مق ر ر اجتلا ي ف ى وعدلا ".repeat(6) : "نص ".repeat(30);
    await opts.pagerender({ pageIndex: i, getTextContent: async () => ({ items: withText || garbled ? [{ str, transform: [0, 0, 0, 0, 0, 0] }] : [] }) });
  }
});

let tmp;
let storage;
const ENV = process.env;
beforeEach(async () => {
  storage = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-win-"));
  process.env = { ...ENV, STORAGE_DIR: storage, GEMINI_API_KEY: "k", GEMINI_MODEL_MULTIMODAL: "gm-multi", GEMINI_MODEL_FAST: "gm-fast" };
  tmp = await createTempDb();
  await LawSetting.update({ aiBudgetGeminiUsd: 50 });
});
afterEach(async () => {
  delete global.__textPages;
  delete global.__garbledPages;
  router.setClientFactory({ gemini: () => null, deepseek: () => null });
  await tmp.cleanup();
  process.env = ENV;
  fs.rmSync(storage, { recursive: true, force: true });
});

const ctx = { track() {} };
let n = 0;
async function importFile(batchId, data, mime) {
  const decl = { clientCaptureId: `win-${++n}-${crypto.randomBytes(4).toString("hex")}`, sha256: crypto.createHash("sha256").update(data).digest("hex"), bytes: data.length, mime, batchId, orderInBatch: 0 };
  const { upload } = await LawUpload.init(decl);
  for (let i = 0; i < upload.chunkCount; i++) await LawUpload.putChunk(upload.uploadId, i, data.subarray(i * upload.chunkSize, (i + 1) * upload.chunkSize));
  return (await LawUpload.complete(upload.uploadId)).asset;
}
const reloadJob = async (id) => {
  const row = await db().lawJob.findUnique({ where: { id } });
  return { id, payload: JSON.parse(row.payload) };
};
async function blankPdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save({ useObjectStreams: false })); // the old pdf-parse cannot read object streams
}
async function pdfPageCount(b64) {
  const buf = Buffer.from(b64, "base64");
  try {
    return (await PDFDocument.load(buf)).getPageCount();
  } catch {
    return Number(/FAKEPDF:(\d+)/.exec(buf.toString("latin1"))[1]);
  }
}
const fakePdf = (pages) => Buffer.from(`%PDF-1.4 FAKEPDF:${pages}`);

describe("candidate_atoms windows", () => {
  const PAGES = 40;
  const PAGE_CHARS = 1500;
  async function setup() {
    const { batch } = await LawBatch.create({ clientBatchId: `atoms-${++n}-abcdef`, kind: "import", expectedParts: 1 });
    const asset = await importFile(batch.id, await blankPdf(1), "application/pdf");
    const pages = Array.from({ length: PAGES }, (_, i) => ({ page: i + 1, text: `${i}` .padEnd(PAGE_CHARS, "ن") }));
    const d = await db().lawDerivative.create({
      data: { assetId: asset.id, batchId: batch.id, kind: "ocr_text", content: JSON.stringify({ source: "pdf", pages }), verificationStatus: "verified" },
    });
    const job = await LawJob.enqueue("candidate_atoms", { derivativeId: d.id });
    return { d, job };
  }
  // One atom per window (the first unit it sees) plus a bogus reference to unit 0 that is outside later windows.
  function stub(calls, failOnCall = null) {
    const gen = async (req) => {
      calls.push(req);
      if (failOnCall === calls.length) throw new ProviderError("503", 503);
      const idx = [...req.parts[0].text.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
      const atoms = [{ body: `atom-${idx[0]}`, sourceIndex: idx[0] }];
      if (idx[0] !== 0) atoms.push({ body: "out-of-window", sourceIndex: 0 });
      return { text: "{}", json: { atoms }, model: "m", usage: { tokensIn: 1, tokensOut: 1 } };
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
  }

  test("sends bounded windows, keeps global source indexes, drops references outside the window", async () => {
    const { d, job } = await setup();
    const calls = [];
    stub(calls);
    const r = await candidateAtoms(await reloadJob(job.id), ctx);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const c of calls) {
      expect(c.parts[0].text.length).toBeLessThanOrEqual(13500); // 12 000-char window + framing
      expect(c.maxOutputTokens).toBeLessThanOrEqual(8192);
    }
    const out = await db().lawDerivative.findUnique({ where: { id: r.derivativeId } });
    const atoms = JSON.parse(out.content).atoms;
    expect(atoms.some((a) => a.body === "out-of-window")).toBe(false);
    expect(atoms).toHaveLength(calls.length);
    for (const a of atoms) expect(a.sourcePage).toBe(a.sourceIndex + 1); // page numbers follow the global unit index
    expect(new Set(atoms.map((a) => a.sourceIndex)).size).toBe(atoms.length);
    expect(r.proposed).toBe(atoms.length);
    expect(d.id).toBeTruthy();
  });

  test("a failed window resumes from the checkpoint: finished windows are not paid for twice", async () => {
    const { job } = await setup();
    const first = [];
    stub(first, 3); // 3rd window fails
    await expect(candidateAtoms(await reloadJob(job.id), ctx)).rejects.toBeInstanceOf(ProviderError);
    expect(first).toHaveLength(3);
    const second = [];
    stub(second);
    const r = await candidateAtoms(await reloadJob(job.id), ctx);
    const total = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeId } })).content).atoms.length;
    expect(second.length).toBe(total - 2); // only the windows after the two checkpointed ones were called again
  });


  test("editing the verified text between attempts re-reads only the windows whose text changed", async () => {
    const { d, job } = await setup();
    const first = [];
    stub(first, 3); // windows 0 and 1 are checkpointed, window 2 fails
    await expect(candidateAtoms(await reloadJob(job.id), ctx)).rejects.toBeInstanceOf(ProviderError);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: d.id } })).content);
    content.pages[0].text = "تصحيح الطالب".padEnd(PAGE_CHARS, "ب"); // same length, different text, in window 0
    await db().lawDerivative.update({ where: { id: d.id }, data: { content: JSON.stringify(content) } });
    const second = [];
    stub(second);
    const r = await candidateAtoms(await reloadJob(job.id), ctx);
    const total = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeId } })).content).atoms.length;
    expect(second.length).toBe(total - 1); // only window 1 was reused; window 0 changed, window 2+ never ran
    const atoms = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeId } })).content).atoms;
    expect(atoms[0].sourceExcerpt).toContain("تصحيح الطالب"); // the excerpt comes from the edited text, not a stale checkpoint
  });

  test("checkpoints are dropped from the job payload once the derivative is saved", async () => {
    const { job } = await setup();
    stub([]);
    await candidateAtoms(await reloadJob(job.id), ctx);
    const payload = JSON.parse((await db().lawJob.findUnique({ where: { id: job.id } })).payload);
    expect(payload.windows).toBeUndefined();
  });

  test("one unit larger than the window is still processed", async () => {
    const { batch } = await LawBatch.create({ clientBatchId: `atoms-${++n}-big0000`, kind: "import", expectedParts: 1 });
    const asset = await importFile(batch.id, await blankPdf(1), "application/pdf");
    const d = await db().lawDerivative.create({
      data: { assetId: asset.id, batchId: batch.id, kind: "ocr_text", content: JSON.stringify({ source: "pdf", pages: [{ page: 1, text: "ن".repeat(40000) }] }), verificationStatus: "verified" },
    });
    const job = await LawJob.enqueue("candidate_atoms", { derivativeId: d.id });
    const calls = [];
    stub(calls);
    const r = await candidateAtoms(await reloadJob(job.id), ctx);
    expect(calls).toHaveLength(1);
    expect(r.proposed).toBe(1);
  });
});

describe("extract_pdf windows", () => {
  async function setup(pages) {
    const { batch } = await LawBatch.create({ clientBatchId: `pdf-${++n}-abcdefg`, kind: "import", expectedParts: 1 });
    await importFile(batch.id, await blankPdf(pages), "application/pdf");
    const job = await LawJob.enqueue("extract_pdf", { batchId: batch.id });
    return { batch, job };
  }
  // Echoes one page per page of the sub-PDF it receives: "<call>:<subpage>".
  function stub(calls, { failCall = null, failStatus = 503, truncateAbove = null } = {}) {
    const gen = async (req) => {
      const pdf = req.parts.find((p) => p.inlineData);
      const k = await pdfPageCount(pdf.inlineData.data);
      calls.push({ k, maxOutputTokens: req.maxOutputTokens, text: req.parts[0].text });
      if (failCall === calls.length) throw new ProviderError("provider down", failStatus); // status 0: the router does not auto-retry it
      if (truncateAbove !== null && k > truncateAbove) throw new ProviderError("gemini output truncated (MAX_TOKENS)");
      return { text: "{}", json: { pages: Array.from({ length: k }, (_, i) => ({ page: i + 1, text: `${calls.length}:${i + 1}` })) }, model: "m", usage: { tokensIn: 1, tokensOut: 1 } };
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
  }
  const pagesOf = async (r) => JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content).pages;

  test("25 scanned pages go out as sub-PDFs of at most 10 pages, mapped back to original page numbers", async () => {
    const { job } = await setup(25);
    const calls = [];
    stub(calls);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(calls.map((c) => c.k)).toEqual([10, 10, 5]);
    for (const c of calls) expect(c.maxOutputTokens).toBeLessThanOrEqual(16384);
    expect(pages).toHaveLength(25);
    expect(pages.every((p) => p.method === "vision")).toBe(true);
    expect(pages[0].text).toBe("1:1");
    expect(pages[10].text).toBe("2:1"); // original page 11 = first page of window 2
    expect(pages[24].text).toBe("3:5");
  });

  test("a truncated answer is retried on halves until it fits", async () => {
    const { job } = await setup(12);
    const calls = [];
    stub(calls, { truncateAbove: 5 });
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(pages).toHaveLength(12);
    expect(pages.every((p) => p.method === "vision" && p.text)).toBe(true);
    expect(calls.map((c) => c.k)).toEqual([10, 5, 5, 2]); // 10 truncated -> two halves of 5, then the last 2 pages
  });

  test("a single page that cannot be read is marked vision_failed and the rest of the PDF is kept", async () => {
    const { job } = await setup(1);
    const calls = [];
    stub(calls, { truncateAbove: 0 });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(content.pages[0]).toMatchObject({ page: 1, method: "vision_failed", text: "" });
    expect(content.failedPages).toEqual([1]);
    expect(calls).toHaveLength(1); // no pointless retries of a single page
  });

  test("one unreadable page in the middle: only that page fails, neighbours are read, nothing is paid twice", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1"; // whole-file mode: the stub sees original page numbers
    const { job } = await setup(12);
    const calls = [];
    const gen = async (req) => {
      const asked = req.parts[0].text.replace(/[^0-9,]/g, "").split(",").map(Number);
      calls.push(asked);
      if (asked.includes(7)) throw new ProviderError("gemini output truncated (MAX_TOKENS)");
      return { text: "{}", json: { pages: asked.map((p) => ({ page: p, text: `t${p}` })) }, model: "m", usage: { tokensIn: 1, tokensOut: 1 } };
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(content.failedPages).toEqual([7]);
    expect(content.pages[6]).toMatchObject({ method: "vision_failed", text: "" });
    expect(content.pages.filter((p) => p.method === "vision").map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    expect(content.pages[7].text).toBe("t8");
    expect(calls.filter((c) => c.length === 1 && c[0] === 7)).toHaveLength(1); // the bad page is tried once on its own
  });

  test("transient provider errors still fail the job (only unresolvable pages are skipped)", async () => {
    const { job } = await setup(3);
    stub([], { failCall: 1, failStatus: 0 });
    await expect(extractPdf(await reloadJob(job.id), ctx)).rejects.toBeInstanceOf(ProviderError);
  });

  test("a failed window resumes from the checkpoint", async () => {
    const { job } = await setup(25);
    const first = [];
    stub(first, { failCall: 2, failStatus: 0 });
    await expect(extractPdf(await reloadJob(job.id), ctx)).rejects.toBeInstanceOf(ProviderError);
    const second = [];
    stub(second);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(second.map((c) => c.k)).toEqual([10, 5]); // window 1 was checkpointed
    expect(pages).toHaveLength(25);
  });

  test("two PDFs in one batch: a retry keeps the first PDF's saved pages", async () => {
    const { batch } = await LawBatch.create({ clientBatchId: `pdf-${++n}-twopdfs0`, kind: "import", expectedParts: 2 });
    await importFile(batch.id, await blankPdf(3), "application/pdf");
    await importFile(batch.id, await blankPdf(15), "application/pdf");
    const job = await LawJob.enqueue("extract_pdf", { batchId: batch.id });
    const first = [];
    stub(first, { failCall: 3, failStatus: 0 }); // PDF1 window (3), PDF2 window (10), PDF2 window (5) fails
    await expect(extractPdf(await reloadJob(job.id), ctx)).rejects.toBeInstanceOf(ProviderError);
    const second = [];
    stub(second);
    await extractPdf(await reloadJob(job.id), ctx);
    expect(second.map((c) => c.k)).toEqual([5]); // only the unfinished window is paid for again
  });

  test("partly scanned PDF: only scanned pages are sent and sub-PDF numbers map to the right original pages", async () => {
    const { batch } = await LawBatch.create({ clientBatchId: `pdf-${++n}-partial00`, kind: "import", expectedParts: 1 });
    await importFile(batch.id, await blankPdf(12), "application/pdf");
    const job = await LawJob.enqueue("extract_pdf", { batchId: batch.id });
    global.__textPages = new Set([1, 2, 6]); // original pages 2, 3 and 7 have a text layer
    const calls = [];
    stub(calls);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(calls.map((c) => c.k)).toEqual([9]);
    expect([2, 3, 7].map((p) => pages[p - 1].method)).toEqual(["text", "text", "text"]);
    // scanned originals are [1,4,5,6,8,9,10,11,12]: sub-page i is the i-th of those
    expect(pages[0].text).toBe("1:1");
    expect(pages[3].text).toBe("1:2"); // original page 4
    expect(pages[7].text).toBe("1:5"); // original page 8
    expect(pages[11].text).toBe("1:9"); // original page 12
  });

  test("a PDF that pdf-lib cannot open falls back to whole-file windows instead of failing forever", async () => {
    const { batch } = await LawBatch.create({ clientBatchId: `pdf-${++n}-fakepdf00`, kind: "import", expectedParts: 1 });
    await importFile(batch.id, fakePdf(12), "application/pdf");
    const job = await LawJob.enqueue("extract_pdf", { batchId: batch.id });
    const calls = [];
    stub(calls);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(calls.map((c) => c.k)).toEqual([12]); // whole file, one window (<= 40 pages per call in this mode)
    expect(calls[0].text).toContain("1, 2, 3"); // original page numbers are requested
    expect(pages.every((p) => p.method === "vision")).toBe(true);
  });

  test("above the split size limit the whole file is used with larger windows (no per-window sub-PDF)", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1";
    const { job } = await setup(45);
    const calls = [];
    stub(calls);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(calls.map((c) => c.k)).toEqual([45, 45]); // full file each call, 40 + 5 pages requested
    expect(pages).toHaveLength(45);
    expect(pages.every((p) => p.method === "vision")).toBe(true);
  });

  test("no temp sub-PDF is left behind after a failed window", async () => {
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("lawos-pdfwin-"));
    const { job } = await setup(25);
    stub([], { failCall: 2, failStatus: 0 });
    await expect(extractPdf(await reloadJob(job.id), ctx)).rejects.toBeInstanceOf(ProviderError);
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("lawos-pdfwin-"));
    expect(after.sort()).toEqual(before.sort());
  });

  test("payload checkpoints are dropped once the derivatives are saved", async () => {
    const { job } = await setup(12);
    stub([]);
    await extractPdf(await reloadJob(job.id), ctx);
    const payload = JSON.parse((await db().lawJob.findUnique({ where: { id: job.id } })).payload);
    expect(payload.pdfPages).toBeUndefined();
  });

  test("pages the model leaves out of a successful answer are asked for once more, then flagged vision_failed", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1";
    const { job } = await setup(6);
    const calls = [];
    const gen = async (req) => {
      const asked = req.parts[0].text.replace(/[^0-9,]/g, "").split(",").map(Number);
      calls.push(asked);
      const answered = asked.filter((p) => p !== 4); // page 4 is never returned, the rest always is
      return { text: "{}", json: { pages: answered.map((p) => ({ page: p, text: `t${p}` })) }, model: "m", usage: { tokensIn: 1, tokensOut: 1 } };
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(content.failedPages).toEqual([4]);
    expect(content.pages[3]).toMatchObject({ method: "vision_failed", text: "" });
    expect(content.pages.filter((p) => p.method === "vision")).toHaveLength(5);
    expect(calls).toEqual([[1, 2, 3, 4, 5, 6], [4]]); // one targeted re-ask, not a loop
  });

  test("repeated 'no text' answers on identical whole-file input cannot burn unlimited calls", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1";
    const { job } = await setup(40);
    let n = 0;
    const gen = async () => {
      n++;
      throw new ProviderError("gemini returned no text (finishReason: SAFETY)");
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(n).toBeLessThanOrEqual(24); // two budgets of 12, then the zero-progress breaker flags the rest
    expect(content.failedPages).toHaveLength(40); // everything flagged for the student, job still finished
  });

  test("one bad page does not take the readable pages with it, even when the halving budget runs out", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1"; // whole-file mode: 40 pages per call, original page numbers
    const { job } = await setup(40);
    const calls = [];
    const gen = async (req) => {
      const asked = req.parts[0].text.replace(/[^0-9,]/g, "").split(",").map(Number);
      calls.push(asked);
      if (asked.includes(1)) throw new ProviderError("gemini output truncated (MAX_TOKENS)");
      return { text: "{}", json: { pages: asked.map((p) => ({ page: p, text: `t${p}` })) }, model: "m", usage: { tokensIn: 1, tokensOut: 1 } };
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(content.failedPages).toEqual([1]);
    expect(content.pages.filter((p) => p.method === "vision")).toHaveLength(39);
    expect(content.pages[39].text).toBe("t40");
  });

  test("a PDF that is blocked on every call stops after two barren windows, not after one call per window", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1";
    const { job } = await setup(120); // 3 windows of 40
    let n = 0;
    const gen = async () => {
      n++;
      throw new ProviderError("gemini returned no text (finishReason: SAFETY)");
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(n).toBeLessThanOrEqual(24);
    expect(content.failedPages).toHaveLength(120);
  });

  test("a refused stretch in the middle flags only those pages: the rest of the PDF is still sent and read", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1"; // whole-file mode: the stub sees original page numbers
    const { job } = await setup(160);
    const calls = [];
    const gen = async (req) => {
      const asked = req.parts[0].text.replace(/[^0-9,]/g, "").split(",").map(Number);
      calls.push(asked);
      if (asked.some((p) => p >= 41 && p <= 82)) throw new ProviderError("gemini returned no text (finishReason: SAFETY)");
      return { text: "{}", json: { pages: asked.map((p) => ({ page: p, text: `t${p}` })) }, model: "m", usage: { tokensIn: 1, tokensOut: 1 } };
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(content.failedPages).toEqual(Array.from({ length: 42 }, (_, i) => 41 + i));
    expect(content.pages.filter((p) => p.method === "vision")).toHaveLength(118);
    expect(content.pages[159].text).toBe("t160"); // pages after the bad stretch were sent
    const sent = new Set(calls.flat());
    expect(sent.has(160) && sent.has(120)).toBe(true);
  });

  test("a PDF refused from the very first page on every call still stops early and flags the rest", async () => {
    process.env.LAWOS_PDF_SPLIT_MAX_BYTES = "1";
    const { job } = await setup(400);
    let n = 0;
    const gen = async () => {
      n++;
      throw new ProviderError("gemini returned no text (finishReason: SAFETY)");
    };
    router.setClientFactory({ gemini: () => ({ generate: gen }), deepseek: () => ({ generate: gen }) });
    const r = await extractPdf(await reloadJob(job.id), ctx);
    const content = JSON.parse((await db().lawDerivative.findUnique({ where: { id: r.derivativeIds[0] } })).content);
    expect(n).toBeLessThanOrEqual(24);
    expect(content.failedPages).toHaveLength(400);
  });

  test("a page whose text layer is garbled (visual-order Arabic) is read by vision, not accepted as text", async () => {
    const { job } = await setup(4);
    global.__textPages = new Set([0, 2, 3]); // pages 1, 3, 4 have a clean text layer
    global.__garbledPages = new Set([1]); // page 2 has a text layer, but in visual order
    const calls = [];
    stub(calls);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(calls.map((c) => c.k)).toEqual([1]); // only the garbled page was sent
    expect(pages.map((p) => p.method)).toEqual(["text", "vision", "text", "text"]);
    expect(pages[1].text).toBe("1:1");
  });

  test("without Gemini a garbled page is flagged and its corrupt text is not kept", async () => {
    delete process.env.GEMINI_API_KEY;
    const { job } = await setup(2);
    global.__textPages = new Set([0]);
    global.__garbledPages = new Set([1]);
    const pages = await pagesOf(await extractPdf(await reloadJob(job.id), ctx));
    expect(pages[0].method).toBe("text");
    expect(pages[1]).toMatchObject({ method: "garbled_pending_ai", text: "" });
    const content = JSON.parse((await db().lawDerivative.findFirst({ where: { kind: "ocr_text" }, orderBy: { createdAt: "desc" } })).content);
    expect(content.garbledPages).toEqual([2]); // listed, so a review screen can explain the blank page
  });
});
