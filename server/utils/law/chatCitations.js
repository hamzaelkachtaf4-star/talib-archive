// Citation check for the legal chat (spec Phase 6.4). The ONLY accepted citation form is [CODE:number] where the id
// was in this turn's retrieved evidence. Every other way of naming an article (bare "الفصل 77", "article 3 du Code
// pénal", "CP:3", odd brackets, plurals, abbreviations, ordinal words, Arabic-Indic / Persian digits) is scrubbed
// unless it sits right next to an allowed bracketed id with the same number; scrubbed text is reported as unverified.
const { validateOutput } = require("./grounding");
const { normalizeCanonicalId, toWesternDigits } = require("./arabic");

const D = "[0-9\u0660-\u0669\u06F0-\u06F9]"; // western, Arabic-Indic, Persian digits
const NUM = `${D}+(?:[-–]${D}+)?(?:\\s*(?:مكرر|bis|ter)(?![\\p{L}]))?`;
const LIST = `${NUM}(?:\\s*(?:و|،|,|-|–|إلى|الى|et|à|and|to)\\s*${NUM})*`;
const ORD = "(?:أول|اول|ثاني|ثان|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر)[ةى]?";
const NOUN_AR = "(?:ال)?(?:فصل|فصلين|فصول|مادة|مادتين|مواد)";
const NOUN_ART = "(?:ال)?(?:مادة|مادتين|مواد)"; // only "article" in the ordinal form: "الفصل الأول" is a chapter / semester
const PATTERNS = [
  new RegExp(`${NOUN_AR}\\s*(?:رقم\\s*)?(?:${LIST})`, "giu"),
  new RegExp(`${NOUN_ART}\\s+(?:ال)?${ORD}`, "giu"),
  new RegExp(`(?<![\\p{L}\\p{N}])(?<!\\p{N}\\s{0,2})(?:م|ف)\\s*\\.\\s*(?:${LIST})`, "giu"),
  new RegExp(`(?<![\\p{L}\\p{N}])(?:articles?|art)\\s*\\.?\\s*(?:${LIST})(?:\\s*er)?`, "giu"),
];
// "الفصل 3 من السنة / الكتاب / الباب ...": the word means semester / part, not an article of a code.
const NOT_AN_ARTICLE = /^\s*من\s+(?:ال)?(?:سنة|أسدس|سداسي|محاضرة|درس|دراسة|مقرر|مادة دراسية)/u; // academic words only: "من الكتاب/الباب/القسم" is how real articles are cited
const slugRe = (slugs) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_.:/-])(?:[\\[\\(【「«]\\s*)?(${[...slugs].sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*:\\s*([0-9\\u0660-\\u0669\\u06F0-\\u06F9][0-9\\u0660-\\u0669\\u06F0-\\u06F9A-Za-z-]*)(?:\\s*[\\]\\)】」»])?(?![\\p{L}\\p{N}])`,
    "giu"
  );
const GAP = /^[\s()،,:–-]{0,4}$/; // only separators between a bare mention and its bracketed id

const westernNumbers = (s) => (toWesternDigits(String(s).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))).match(/\d+(?:-\d+)?/g) || []);

/**
 * @param {string} text model answer
 * @param {Set<string>} allowed canonical ids in this turn's evidence
 * @returns {{ text: string, verified: string[], stripped: string[] }}
 */
function scrub(text, allowed, knownSlugs = []) {
  const stripped = new Set();
  const verified = new Set();
  // 1. Normalize every code:number token: allowed -> canonical "[CODE:n]", anything else -> removed.
  // Only real corpus codes count as ids: "Amende: 2000" or "http://x:8080" are ordinary text and stay untouched.
  const slugs = new Set([...knownSlugs, ...[...allowed].map((id) => id.split(":")[0])]);
  let out = String(text);
  if (slugs.size)
    out = out.replace(slugRe(slugs), (m, code, num) => {
      const canon = normalizeCanonicalId(`${code}:${num}`);
      if (canon && allowed.has(canon)) { verified.add(canon); return `[${canon}]`; }
      stripped.add(canon || `${code}:${num}`);
      return "";
    });
  // 1b. A bracketed [CODE:number] is a citation by shape even when CODE is not a corpus code ([FRCC:1134]): remove and report.
  out = out.replace(/\[\s*([A-Za-z][A-Za-z0-9.-]{0,20})\s*:\s*(\d[\d\u0660-\u0669\u06F0-\u06F9A-Za-z-]*)\s*\]/g, (m, code, num) => {
    const canon = normalizeCanonicalId(`${code}:${num}`) || `${code}:${num}`;
    if (allowed.has(canon)) return m;
    stripped.add(canon);
    return "";
  });
  // 2. Bare article mentions: keep only those hugging an allowed bracket id with the same number.
  const brackets = () => [...out.matchAll(/\[([^\]]+)\]/g)].map((b) => ({ at: b.index, end: b.index + b[0].length, num: String(b[1]).split(":")[1] }));
  for (const re of PATTERNS) {
    const bs = brackets();
    out = out.replace(re, (m, ...rest) => {
      const offset = rest[rest.length - 2] && typeof rest[rest.length - 2] === "number" ? rest[rest.length - 2] : rest.find((x) => typeof x === "number");
      // "الفصل 3 من السنة" is a semester; "المادة ..." is always an article
      if (re === PATTERNS[0] && /^(?:ال)?فصل/u.test(m) && NOT_AN_ARTICLE.test(out.slice(offset + m.length))) return m;
      const nums = westernNumbers(m);
      const after = offset + m.length;
      const ok = nums.length > 0 && nums.every((n) => bs.some((b) => b.num === n && ((b.at >= after && GAP.test(out.slice(after, b.at))) || (b.end <= offset && GAP.test(out.slice(b.end, offset))))));
      if (ok) return m;
      stripped.add(m.trim());
      return "";
    });
  }
  out = out.replace(/\(\s*\)|【\s*】|\[\s*\]|«\s*»/g, "").replace(/[ \t]{2,}/g, " ").replace(/\s+([،.,؛:])/g, "$1").trim();
  return { text: out, verified: [...verified], stripped: [...stripped] };
}

/**
 * @param {{answer:string, citations?:{canonicalId:string, quote?:string}[]}} output  raw model output
 * @param {{canonicalId:string, text:string}[]} evidence  the blocks that were sent to the model
 */
async function checkChatOutput(output, evidence, { at = new Date(), knownSlugs = [] } = {}) {
  const allowed = new Set(evidence.map((e) => e.canonicalId));
  // Pass 1: existing corpus validation of citation objects (resolves ids, relabels non-verbatim quotes).
  const { output: cleaned, check } = await validateOutput({ answer: "", citations: output.citations || [] }, { at });
  // Pass 2: the answer text, strictly against this turn's evidence.
  const s = scrub(output.answer || "", allowed, knownSlugs);
  const citations = (cleaned.citations || []).filter((c) => c && typeof c.canonicalId === "string" && allowed.has(c.canonicalId));
  const dropped = (output.citations || []).map((c) => c?.canonicalId).filter((id) => id && !citations.some((c) => normalizeCanonicalId(id) === c.canonicalId));
  const verified = [...new Set([...s.verified, ...citations.map((c) => c.canonicalId)])];
  const unverified = [...new Set([...s.stripped, ...check.unresolved, ...dropped.map((d) => normalizeCanonicalId(d) || d)])].filter((u) => !verified.includes(u));
  return {
    answer: s.text,
    citations,
    meta: { verified, unverified, quoteMismatches: check.quoteMismatches, banner: unverified.length > 0 },
  };
}

module.exports = { checkChatOutput, scrub, PATTERNS, NOT_AN_ARTICLE };
