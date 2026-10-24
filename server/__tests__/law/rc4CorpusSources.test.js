// The corpus import manifest: every source names a catalog entry, an https official URL, a real past date and a known extraction mode.
const sources = require("../../data/law/corpus/sources.json");
const catalog = require("../../utils/law/corpusCatalog");

describe("corpus sources manifest", () => {
  test("every source resolves to a catalog entry with official https provenance", () => {
    const slugs = new Set();
    for (const s of sources) {
      expect(catalog.entry(s.slug)).not.toBeNull();
      expect(slugs.has(s.slug)).toBe(false);
      slugs.add(s.slug);
      const u = new URL(s.pdfUrl);
      expect(u.protocol).toBe("https:");
      expect(u.hostname).toMatch(/(^|\.)(justice\.gov\.ma|sgg\.gov\.ma)$/);
      expect(s.consolidatedAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${s.consolidatedAsOf}T00:00:00Z`) <= new Date()).toBe(true);
      expect(["text", "ocr"]).toContain(s.mode);
      expect(s.asOfBasis).toBeTruthy();
    }
  });

  test("covers the seven core codes the spec requires", () => {
    const have = new Set(sources.map((s) => s.slug));
    for (const need of ["DOC", "CP", "CPC-58.25", "CPP", "CCOM", "MOUDAWANA", "CT", "ORG-FINANCES", "ORG-REGIONS", "ORG-PREFECTURES", "ORG-COMMUNES", "FRAMEWORK-INVESTMENT", "FRAMEWORK-HEALTH", "FRAMEWORK-EDUCATION"]) expect(have.has(need)).toBe(true);
  });

  test("no catalog entry is a placeholder: a text is listed to students only once it has been imported", () => {
    for (const e of catalog.load().entries) expect(e.status).not.toBe("pending_source");
  });
});
