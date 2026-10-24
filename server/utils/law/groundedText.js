// Text the model wrote for a student must not smuggle in statute references from memory (ground rule 1.6). Article mentions
// that the student's own material contains word for word are theirs to explain and are kept; every other bare reference
// ("الفصل 77", "article 3 du Code pénal", "[CP:3]") is stripped and reported.
const { scrub, PATTERNS, NOT_AN_ARTICLE } = require("./chatCitations");
const { toWesternDigits } = require("./arabic");

function scrubKeepingQuotes(text, sourcesText, knownSlugs) {
  const norm = (x) => toWesternDigits(String(x)).replace(/\s+/g, " ").trim();
  const hay = norm(sourcesText);
  const kept = [];
  let masked = String(text ?? "");
  for (const re of PATTERNS) {
    masked = masked.replace(re, (m, ...rest) => {
      const offset = rest.find((x) => typeof x === "number");
      if (re === PATTERNS[0] && /^(?:ال)?فصل/u.test(m) && NOT_AN_ARTICLE.test(masked.slice(offset + m.length))) return m;
      if (!hay.includes(norm(m))) return m;
      kept.push(m);
      return `\uE000${kept.length - 1}\uE001`;
    });
  }
  const s = scrub(masked, new Set(), knownSlugs);
  return { text: s.text.replace(/\uE000(\d+)\uE001/g, (_x, i) => kept[Number(i)]), stripped: s.stripped.filter((x) => !String(x).includes("\uE000")) };
}

module.exports = { scrubKeepingQuotes };
