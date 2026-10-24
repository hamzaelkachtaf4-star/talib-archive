#!/usr/bin/env node
// Usage:
//   node server/scripts/law/ingest-corpus.js --slug DOC --file ./doc.txt --source-url https://... --as-of 2026-09-30 [--valid-from 2026-09-30] [--commit]
// Stages an official legal text as a review import (or commits it with --commit). Records the file's sha256, the source URL and the
// consolidation date. Re-running with the same file changes nothing. Run with Node 24 from the repository root.
const { LawCorpus } = require("../../models/lawCorpus");
const { rawDb } = require("../../utils/law/dbClient");
const { asSystem } = require("../../utils/law/tenant");
const { ingestFile, IngestError } = require("../../utils/law/corpusIngest");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") out.commit = true;
    else if (a.startsWith("--")) out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else throw new IngestError("usage", `unexpected argument ${a}`);
  }
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const need of ["slug", "file", "sourceUrl", "asOf"]) if (!a[need]) throw new IngestError("usage", `missing --${need.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  const r = await asSystem(() => ingestFile({ slug: a.slug, filePath: a.file, sourceUrl: a.sourceUrl, consolidatedAsOf: a.asOf, validFrom: a.validFrom, commit: !!a.commit }, { LawCorpus, rawDb }));
  console.log(JSON.stringify(r, null, 2));
  if (r.status === "staged") console.log("Staged for review. Open the import in the app (Library > corpus import) and commit it there, or re-run with --commit.");
}

main().then(() => process.exit(0), (e) => {
  console.error(e instanceof IngestError ? `ingest-corpus: ${e.code}: ${e.message}` : e);
  process.exit(e instanceof IngestError && e.code === "usage" ? 2 : 1);
});
