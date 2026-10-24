const { openPdf, wrapDocument } = require("../../../utils/law/jobs/pdfPages");

describe("pdfPages", () => {
  test("a file pdf-lib cannot open yields null (callers fall back to whole-file windows)", async () => {
    expect(await openPdf(Buffer.from("not a pdf at all"))).toBeNull();
  });

  test("an encrypted document yields null: pdf-lib cannot decrypt, copying its streams would corrupt pages", () => {
    expect(wrapDocument({ isEncrypted: true, getPageCount: () => 3 })).toBeNull();
  });

  test("the handle exposes only page count and cutting, never the document", async () => {
    const { PDFDocument } = require("pdf-lib");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 4; i++) doc.addPage();
    const h = await openPdf(Buffer.from(await doc.save({ useObjectStreams: false })));
    expect(Object.keys(h).sort()).toEqual(["pageCount", "sub"]);
    expect(h.pageCount).toBe(4);
    const sub = await h.sub([2, 4]);
    expect((await PDFDocument.load(sub)).getPageCount()).toBe(2);
  });

  test("sub rejects page numbers outside the document", async () => {
    const { PDFDocument } = require("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage();
    const h = await openPdf(Buffer.from(await doc.save({ useObjectStreams: false })));
    await expect(h.sub([2])).rejects.toThrow();
  });
});
