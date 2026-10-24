// Ingestion of an official legal text into the corpus (RC3 Phase 6). The ONLY way statute text reaches the app: from a
// source file a person supplies, with the URL it was published at, the date its consolidation is current to, and the file's
// sha256 recorded next to it. The text is parsed into a review import (nothing is live until it is committed); a file whose
// sha256 is already recorded for that code is a no-op. Nothing here fetches anything from the network.
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const catalog = require("./corpusCatalog");
const { localDate } = require("./time");
// Strict: Date.parse rolls "2026-02-30" over to March 2, which is not a date anyone published a text on.
const isDateStr = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const MAX_BYTES = 10 * 1024 * 1024; // never above the 10M characters createImport accepts (UTF-8 is at least one byte per character)
const TEXT_EXT = new Set([".txt", ".md"]);

class IngestError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "IngestError";
    this.code = code;
  }
}

/** Only https URLs with a host; credentials in the URL are refused (they would be stored). */
function checkSourceUrl(u) {
  let url;
  try { url = new URL(String(u)); } catch { throw new IngestError("invalid_source_url", "--source-url must be the https address the text was published at"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new IngestError("invalid_source_url", "--source-url must be an https address without credentials");
  return url.toString();
}

const sha256File = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * @param {{ slug:string, filePath:string, sourceUrl:string, consolidatedAsOf:string, validFrom?:string, commit?:boolean }} args
 * @param {{ LawCorpus:object, rawDb:Function }} deps  injected so tests can run against a temp database
 * @returns {Promise<{status:'staged'|'committed'|'unchanged', importId?:string, articles:number, warnings:number, sha256:string, slug:string}>}
 */
async function ingestFile(args, { LawCorpus, rawDb }) {
  const { slug, filePath, sourceUrl, consolidatedAsOf, validFrom, commit = false } = args;
  const entry = catalog.entry(slug);
  if (!entry) throw new IngestError("unknown_catalog_entry", `'${slug}' is not in the catalog (server/data/law/corpus/catalog.json)`);
  if (!isDateStr(consolidatedAsOf) || consolidatedAsOf > localDate(new Date())) throw new IngestError("invalid_consolidation_date", "--as-of must be a past or present date, YYYY-MM-DD");
  const url = checkSourceUrl(sourceUrl);
  if (validFrom !== undefined && !isDateStr(validFrom)) throw new IngestError("invalid_valid_from", "--valid-from must be YYYY-MM-DD");
  if (!TEXT_EXT.has(path.extname(String(filePath)).toLowerCase())) throw new IngestError("unsupported_file", "give the text as a .txt or .md file (extract a PDF with the app's PDF import, then export the text)");
  let stat;
  try { stat = fs.statSync(filePath); } catch { throw new IngestError("file_not_found", `no such file: ${filePath}`); }
  if (!stat.isFile()) throw new IngestError("file_not_found", `not a file: ${filePath}`);
  if (stat.size === 0) throw new IngestError("empty_file");
  if (stat.size > MAX_BYTES) throw new IngestError("file_too_large");
  const buf = fs.readFileSync(filePath);
  const text = buf.toString("utf8");
  if (text.includes("�")) throw new IngestError("not_utf8", "the file is not valid UTF-8 text");
  const sha256 = sha256File(buf);

  const db = rawDb();
  await LawCorpus.ensureCodesSeeded();
  let code = await db.lawCode.findUnique({ where: { slug } });
  if (!code) {
    code = await db.lawCode.create({
      data: { slug, family: slug, titleAr: entry.titleAr, titleFr: entry.titleFr, normLevel: entry.normLevel, domain: entry.domain, numberingLabel: entry.numberingLabel || "المادة", reviewed: false },
    });
  }

  // The same file for the same code is recorded once: re-running the script changes nothing.
  const prior = await db.lawSourceDocument.findFirst({ where: { sha256, imports: { some: { codeId: code.id, status: { in: ["review", "committed"] } } } }, include: { imports: { where: { codeId: code.id, status: { in: ["review", "committed"] } }, select: { id: true, status: true, articles: true, warnings: true } } } });
  if (prior) {
    const imp = prior.imports[0];
    // Staged earlier and now asked to go live: publish that import instead of reporting "unchanged".
    if (commit && imp.status === "review") {
      const done = await LawCorpus.commitImport(imp.id);
      if (done.error) throw new IngestError("commit_failed", done.error);
      await db.lawCode.update({ where: { id: code.id }, data: { reviewed: false } });
      return { status: "committed", importId: imp.id, articles: JSON.parse(imp.articles || "[]").length, warnings: JSON.parse(imp.warnings || "[]").length, sha256, slug };
    }
    return { status: "unchanged", importId: imp.id, articles: JSON.parse(imp.articles || "[]").length, warnings: JSON.parse(imp.warnings || "[]").length, sha256, slug };
  }

  const created = await LawCorpus.createImport({ codeSlug: slug, validFrom: validFrom || consolidatedAsOf, text, url, title: entry.titleAr });
  if (created.error) throw new IngestError("import_failed", created.error);
  const imp = created.import;
  if (imp.articles.length === 0) {
    await db.lawCorpusImport.update({ where: { id: imp.id }, data: { status: "failed" } });
    throw new IngestError("no_articles_found", "no article headings were recognised in this text; nothing was staged for review");
  }
  // Provenance: the raw file's checksum (not the normalised text's) and the consolidation date sit on the source document.
  await db.lawSourceDocument.update({ where: { id: imp.sourceDocumentId }, data: { sha256, consolidatedAsOf, url, origin: "manual_upload" } });

  if (commit) {
    const done = await LawCorpus.commitImport(imp.id);
    if (done.error) throw new IngestError("commit_failed", done.error);
    // Machine-parsed text is live but not yet vouched for: the Library shows it as "under review" until a person reviews it.
    await db.lawCode.update({ where: { id: code.id }, data: { reviewed: false } });
    return { status: "committed", importId: imp.id, articles: imp.articles.length, warnings: imp.warnings.length, sha256, slug };
  }
  return { status: "staged", importId: imp.id, articles: imp.articles.length, warnings: imp.warnings.length, sha256, slug };
}

/** The provenance of each code's latest committed import (for the catalog endpoint). */
async function provenanceBySlug(rawDb) {
  // select only what is shown: an import row carries the whole raw text and every parsed article.
  const rows = await rawDb().lawCorpusImport.findMany({
    where: { status: "committed" },
    orderBy: { committedAt: "desc" },
    distinct: ["codeId"],
    select: { committedAt: true, code: { select: { slug: true } }, sourceDocument: { select: { url: true, sha256: true, consolidatedAsOf: true } } },
  });
  const out = new Map();
  for (const r of rows) {
    if (out.has(r.code.slug)) continue;
    out.set(r.code.slug, { sourceUrl: r.sourceDocument?.url || null, consolidatedAsOf: r.sourceDocument?.consolidatedAsOf || null, sha256: r.sourceDocument?.sha256 || null, committedAt: r.committedAt });
  }
  return out;
}

module.exports = { ingestFile, provenanceBySlug, checkSourceUrl, IngestError, MAX_BYTES };
