// Usage: node scripts/i18n-add.mjs <file.json>   where file = { "arabic key": { "fr": "...", "en": "...", "ary": "..." } }
// Merges into frontend/src/locales/qanouni/{fr,en,ary}.json (keys sorted like the existing files; Arabic is the source).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const add = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const loc of ["fr", "en", "ary"]) {
  const f = path.join(root, `frontend/src/locales/qanouni/${loc}.json`);
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const [k, v] of Object.entries(add)) if (v[loc] && !(k in d)) d[k] = v[loc];
  const sorted = d; // keep existing order; new keys are appended
  fs.writeFileSync(f, JSON.stringify(sorted, null, 1) + "\n");
}
console.log("i18n merged:", Object.keys(add).length, "keys");
