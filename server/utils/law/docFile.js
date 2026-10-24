// Text from a PDF a student attaches to a work-group document (RC4 Phase 8). Only the PDF's own text layer is read: a scanned
// PDF has none, and is told so (the lecture ingestion of a module reads scans with vision). The text goes into the editor for
// the student to check and correct: nothing is published from here.
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_CHARS = 20000; // the document size limit
const MAX_PAGES = 60;

async function pdfToText(dataUrl) {
  const m = /^data:application\/pdf;base64,/.exec(String(dataUrl || "").slice(0, 60)); // only the header is matched: never run a pattern over the whole payload
  if (!m) return { error: "unsupported_file" };
  const data = String(dataUrl).slice(m[0].length);
  if (Buffer.byteLength(data, "base64") > MAX_BYTES) return { error: "file_too_large" };
  const buf = Buffer.from(data, "base64");
  if (buf.subarray(0, 5).toString() !== "%PDF-") return { error: "unreadable_pdf" };
  let pages;
  try {
    pages = await Promise.race([
      require("./jobs/extractPdf").textLayer(buf, { maxPages: MAX_PAGES }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000).unref()),
    ]);
  } catch {
    return { error: "unreadable_pdf" };
  }
  const text = pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return { error: "no_text_layer" };
  return { text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS, error: null };
}

module.exports = { pdfToText, MAX_BYTES };
