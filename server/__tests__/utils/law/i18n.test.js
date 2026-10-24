// Qanouni interface languages: every Arabic UI string wrapped in tr() has a French and an English
// translation, and placeholders ({0}, {1}…) survive translation. Darija may reuse the Arabic.
const fs = require("fs");
const path = require("path");

const FRONT = path.resolve(__dirname, "../../../../frontend/src");
const DICTS = Object.fromEntries(
  ["fr", "en", "ary"].map((l) => [
    l,
    JSON.parse(fs.readFileSync(path.join(FRONT, `locales/qanouni/${l}.json`), "utf8")),
  ])
);
// Data values and Arabic legal templates that must stay Arabic in every language.
const KEEP_ARABIC = new Set([
  "محكمة النقض",
  "الفصل 1 …",
  "المبحث الأول: … المطلب الأول: … المطلب الثاني: … المبحث الثاني: …",
]);

function keys() {
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []
    );
  const out = new Set();
  for (const f of [...walk(path.join(FRONT, "components/LawOS")), ...walk(path.join(FRONT, "pages/LawOS"))])
    for (const m of fs.readFileSync(f, "utf8").matchAll(/\btr\(\s*("(?:[^"\\]|\\.)*")/g))
      out.add(JSON.parse(m[1]));
  return [...out];
}

const placeholders = (s) => (s.match(/\{\d+\}/g) || []).sort().join();

test("every UI string has French and English translations", () => {
  const all = keys();
  expect(all.length).toBeGreaterThan(500);
  for (const lang of ["fr", "en"]) {
    const missing = all.filter((k) => !KEEP_ARABIC.has(k) && !DICTS[lang][k]);
    expect({ lang, missing }).toEqual({ lang, missing: [] });
  }
});

test("translations keep placeholders and never translate data values", () => {
  for (const [lang, dict] of Object.entries(DICTS))
    for (const [k, v] of Object.entries(dict)) {
      expect({ lang, k, p: placeholders(v) }).toEqual({ lang, k, p: placeholders(k) });
      expect(KEEP_ARABIC.has(k)).toBe(false);
    }
});
