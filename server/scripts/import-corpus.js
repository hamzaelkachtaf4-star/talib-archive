#!/usr/bin/env node
// Imports the official legal texts listed in server/data/law/corpus/sources.json into the corpus.
//   node server/scripts/import-corpus.js [--only SLUG[,SLUG]] [--no-download] [--stage]
// For each source: download the official PDF (adala.justice.gov.ma) into server/storage/corpus-sources/ unless it is already there,
// extract its text with server/scripts/law/pdf_to_text.py (PDF text layer, or tesseract OCR for scrambled layers), parse it into
// articles, and commit it with the source URL, the consolidation date and the sha256 recorded. Re-running is a no-op.
// A PDF dropped by hand into corpus-sources/<SLUG>.pdf is used as is (no download), so a text the site refuses to serve can be supplied.
// Requires: python3 with `pymupdf`; `tesseract` with the `ara` model for OCR sources (TESSDATA_PREFIX if not system-wide).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { LawCorpus } = require("../models/lawCorpus");
const { rawDb } = require("../utils/law/dbClient");
const { asSystem } = require("../utils/law/tenant");
const { ingestFile, IngestError } = require("../utils/law/corpusIngest");

const SOURCES = path.resolve(__dirname, "../data/law/corpus/sources.json");
const DIR = path.resolve(__dirname, "../storage/corpus-sources");
const EXTRACTOR = path.resolve(__dirname, "law/pdf_to_text.py");
const PY = process.env.PYTHON || "python3";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, dest) {
  for (let i = 0; i < 5; i++) {
    try {
      await sleep(1500); // be polite to the ministry's server
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (study tool; corpus import)" }, signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error("not a PDF");
      fs.writeFileSync(dest, buf);
      return;
    } catch (e) {
      if (i === 4) throw e;
      await sleep(4000 * (i + 1));
    }
  }
}

function extract(pdf, txt, mode) {
  const args = [EXTRACTOR, ...(mode === "ocr" ? ["--ocr"] : []), pdf, txt];
  const r = spawnSync(PY, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  if (r.status !== 0) throw new Error(`text extraction failed for ${path.basename(pdf)} (is pymupdf${mode === "ocr" ? " / tesseract" : ""} installed?)`);
}

async function main() {
  const argv = process.argv.slice(2);
  const onlyArg = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  if (argv.includes("--only") && (!onlyArg || onlyArg.startsWith("--"))) { console.error("--only needs a comma-separated list of slugs"); process.exit(2); }
  const only = onlyArg ? new Set(onlyArg.split(",")) : null;
  const noDownload = argv.includes("--no-download");
  const commit = !argv.includes("--stage");
  const sources = JSON.parse(fs.readFileSync(SOURCES, "utf8")).filter((s) => !only || only.has(s.slug));
  fs.mkdirSync(DIR, { recursive: true });
  const provFile = path.join(DIR, "provenance.json");
  const prov = fs.existsSync(provFile) ? JSON.parse(fs.readFileSync(provFile, "utf8")) : {};
  const failed = [];
  for (const s of sources) {
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(s.slug) || s.slug.includes("..") || !/^https:\/\/adala\.justice\.gov\.ma\//.test(String(s.pdfUrl))) { failed.push(s.slug); console.error(`${s.slug}: skipped, bad slug or a source that is not https://adala.justice.gov.ma/`); continue; }
    const pdf = path.join(DIR, `${s.slug}.pdf`);
    const txt = path.join(DIR, `${s.slug}.txt`);
    try {
      let obtained = prov[s.slug]?.obtained || "download";
      if (!fs.existsSync(pdf)) {
        if (noDownload) throw new Error(`missing ${pdf}`);
        await download(s.pdfUrl, pdf);
        obtained = "download";
      } else if (!prov[s.slug]) obtained = "manual"; // a PDF that was already there and never recorded: supplied by hand
      const pdfSha = sha(fs.readFileSync(pdf));
      // The text is re-extracted whenever the PDF is not the one the existing text came from; it is written to a temp file and
      // moved into place only when extraction succeeded, so a crash never leaves half a text behind.
      if (!fs.existsSync(txt) || (prov[s.slug] && prov[s.slug].pdfSha256 !== pdfSha)) {
        const tmp = `${txt}.part`;
        extract(pdf, tmp, s.mode);
        fs.renameSync(tmp, txt);
      }
      const r = await asSystem(() => ingestFile({ slug: s.slug, filePath: txt, sourceUrl: s.pdfUrl, consolidatedAsOf: s.consolidatedAsOf, commit }, { LawCorpus, rawDb }));
      prov[s.slug] = { sourceUrl: s.pdfUrl, consolidatedAsOf: s.consolidatedAsOf, asOfBasis: s.asOfBasis, pdfSha256: pdfSha, textSha256: r.sha256, articles: r.articles, warnings: r.warnings, extraction: s.mode, obtained };
      console.log(`${s.slug}: ${r.status}, ${r.articles} articles, ${r.warnings} warnings`);
    } catch (e) {
      failed.push(s.slug);
      console.error(`${s.slug}: FAILED ${e instanceof IngestError ? `${e.code}: ` : ""}${e.message}\n  supply the official PDF as ${pdf} and re-run with --only ${s.slug} --no-download`);
    }
  }
  fs.writeFileSync(provFile, JSON.stringify(prov, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().then(() => process.exit(process.exitCode || 0), (e) => { console.error(e); process.exit(1); });
