// Page splitting only: copies whole pages into a smaller PDF so a vision call sees a few pages, not the whole
// scan. This file must never draw text or embed fonts (Brain L-0006: pdf-lib cannot shape Arabic); the gate
// section pdf-no-arabic-shaping enforces that for this one exempt file. The handle returned here exposes only
// pageCount and sub(), so no other file can reach the pdf-lib document.
const { PDFDocument } = require("pdf-lib");

/** Handle for an already loaded document, or null when pdf-lib cannot copy its pages faithfully. */
function wrapDocument(doc) {
  // pdf-lib has no decryption: copyPages would carry encrypted streams into an unencrypted PDF (corrupt pages).
  if (doc.isEncrypted) return null;
  const pageCount = doc.getPageCount();
  return {
    pageCount,
    /** A PDF holding only the given 1-based pages. */
    async sub(pageNumbers) {
      if (!pageNumbers.length || pageNumbers.some((p) => !Number.isInteger(p) || p < 1 || p > pageCount))
        throw new RangeError("page number outside the document");
      const dst = await PDFDocument.create();
      const copied = await dst.copyPages(doc, pageNumbers.map((p) => p - 1));
      copied.forEach((p) => dst.addPage(p));
      return Buffer.from(await dst.save({ useObjectStreams: false })); // the bundled pdf-parse cannot read object streams
    },
  };
}

/** Opens a PDF once so several windows can be cut from it; null when it cannot be split (callers use the whole file). */
async function openPdf(buffer) {
  try {
    return wrapDocument(await PDFDocument.load(buffer, { ignoreEncryption: true }));
  } catch {
    return null;
  }
}

module.exports = { openPdf, wrapDocument };
