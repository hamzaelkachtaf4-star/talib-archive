// Lists Arabic tr("...") keys used in LawOS source that a locale file lacks.
// Usage: node scripts/i18n-missing.mjs [fr|en|ary] [path-prefix...]   (default: fr, whole LawOS tree)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [loc = "fr", ...prefixes] = process.argv.slice(2);
const dict = JSON.parse(fs.readFileSync(path.join(root, `frontend/src/locales/qanouni/${loc}.json`), "utf8"));
const dirs = prefixes.length ? prefixes : ["frontend/src/components/LawOS", "frontend/src/pages/LawOS", "frontend/src/navigation"];
const files = [];
const walk = (p) => {
  const abs = path.join(root, p);
  if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isFile()) return /\.(jsx?|mjs)$/.test(abs) && files.push(abs);
  for (const f of fs.readdirSync(abs)) walk(path.join(p, f));
};
dirs.forEach(walk);
const re = /\btr\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g;
const missing = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3];
    let key;
    try { key = JSON.parse(`"${raw.replace(/"/g, '\\"').replace(/\\'/g, "'").replace(/\\`/g, "`")}"`); } catch { key = raw; }
    if (!/[؀-ۿ]/.test(key)) continue; // only Arabic source keys are translated
    if (!(key in dict)) missing.set(key, path.relative(root, f));
  }
}
for (const [k, f] of missing) console.log(`${f}\t${k}`);
console.error(`${missing.size} missing in ${loc}`);
process.exit(missing.size ? 1 : 0);
