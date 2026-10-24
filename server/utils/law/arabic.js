// Arabic normalization for indexing AND queries (spec §6.4). Original text is never modified: these
// produce shadow columns used only for matching.
//   normalize():  tashkeel/tatweel removed; أ إ آ ٱ → ا; final ى → ي and ة → ه; Arabic-Indic and
//                 Persian digits → Western; Latin lowercased with accents stripped.
//   lightStem():  per token, strip a leading [و|ف][ب|ك|ل]?ال combination (and لل) and common suffixes.
//                 Never root-stemming: فسخ and انفساخ must stay distinct legal terms.

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;
const TATWEEL = /ـ/g;
const ALEF = /[آأإٱ]/g; // آ أ إ ٱ
const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;

function toWesternDigits(s) {
  return String(s)
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalize(text) {
  return toWesternDigits(String(text ?? ""))
    .normalize("NFC")
    .replace(TASHKEEL, "")
    .replace(TATWEEL, "")
    .replace(ALEF, "ا")
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ة/g, "ه") // ة → ه
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Latin accents (é → e)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Prefix combinations, longest first. Single و/ف/ب/ك/ل alone are NOT stripped (they start real roots).
const PREFIXES = [
  "وبال",
  "وكال",
  "فبال",
  "فكال",
  "وال",
  "فال",
  "بال",
  "كال",
  "ولل",
  "فلل",
  "لل",
  "ال",
];
const SUFFIXES = ["ات", "ون", "ين", "ان", "ها", "هم", "هن", "يه", "ه", "ي"];
const MIN_STEM = 3;

function stemToken(tok) {
  if (!/[؀-ۿ]/.test(tok)) return tok;
  let t = tok;
  for (const p of PREFIXES)
    if (t.startsWith(p) && t.length - p.length >= MIN_STEM) {
      t = t.slice(p.length);
      break;
    }
  for (const s of SUFFIXES)
    if (t.endsWith(s) && t.length - s.length >= MIN_STEM) {
      t = t.slice(0, -s.length);
      break;
    }
  return t;
}

/** Light stem of already-normalized text. */
function lightStem(normalized) {
  return String(normalized).split(" ").filter(Boolean).map(stemToken).join(" ");
}

/** "doc:٧٧" → "DOC:77"; "cp : 88 مكرر" → "CP:88-مكرر". Returns null when malformed. */
function normalizeCanonicalId(id) {
  const m = /^\s*([A-Za-z][A-Za-z0-9.-]*)\s*:\s*(.+?)\s*$/.exec(
    toWesternDigits(String(id ?? ""))
  );
  if (!m) return null;
  const num = m[2].replace(/\s+/g, "-");
  if (!/^[0-9A-Za-z؀-ۿ-]+$/.test(num)) return null;
  return `${m[1].toUpperCase()}:${num}`;
}

module.exports = {
  normalize,
  lightStem,
  stemToken,
  toWesternDigits,
  normalizeCanonicalId,
};
