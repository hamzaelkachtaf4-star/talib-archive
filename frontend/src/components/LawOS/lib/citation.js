// Direct citations typed in the Library search box: «م 230 د.ع», «الفصل 77 من الدستور», «art. 5 bis DOC».
// Pure and offline: it only decides WHAT to look up (code slug + article number); the corpus search resolves it.

const MAX_NUMBER = 9999;

const DIGITS = { "٠": 0, "١": 1, "٢": 2, "٣": 3, "٤": 4, "٥": 5, "٦": 6, "٧": 7, "٨": 8, "٩": 9, "۰": 0, "۱": 1, "۲": 2, "۳": 3, "۴": 4, "۵": 5, "۶": 6, "۷": 7, "۸": 8, "۹": 9 };

// Light Arabic normalisation (same spirit as the server's): no diacritics/tatweel, one alef, ى→ي, ة→ه, ئ→ي, ؤ→و.
const norm = (s) =>
  String(s)
    .replace(/[٠-٩۰-۹]/g, (d) => String(DIGITS[d]))
    .replace(/[ً-ٰٟـ‌‍‎‏]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const compact = (s) => norm(s).replace(/[.\s\-_/]/g, "");

// Abbreviations (dots and spaces ignored): د.ع = ظهير الالتزامات والعقود (DOC), ق.ج = القانون الجنائي, …
// «ق.م.م» resolves to the current civil procedure law 58.25 (the 1974 text is repealed; name it explicitly via «1974»).
const ABBREVIATIONS = {
  دع: "DOC", قلع: "DOC", ظلع: "DOC", doc: "DOC",
  قج: "CP", cp: "CP",
  قمج: "CPP", cpp: "CPP",
  قمم: "CPC-58.25", cpc: "CPC-58.25",
  مت: "CCOM", ccom: "CCOM",
  مش: "CT", ct: "CT",
  ما: "MOUDAWANA", moudawana: "MOUDAWANA",
  ظتع: "DAHIR-LAND-REG",
};

// Full names, most specific first (the first phrase contained in the code part wins). Written naturally; norm() is applied at match time.
const NAMES = [
  ["المسطرة الجنائية", "CPP"],
  ["المسطرة المدنية", "CPC-58.25"],
  ["الالتزامات والعقود", "DOC"],
  ["مجموعة القانون الجنائي", "CP"],
  ["القانون الجنائي", "CP"],
  ["مدونة التجارة", "CCOM"],
  ["مدونة الشغل", "CT"],
  ["مدونة الأسرة", "MOUDAWANA"],
  ["الدستور", "CONST-2011"],
  ["التحفيظ العقاري", "DAHIR-LAND-REG"],
];
// Two-letter abbreviations that are also everyday words must be typed with their dots («م.أ», not «ما»).
const NEEDS_DOTS = new Set(["ما", "مت", "مش"]);
// Numbering forms the corpus cannot express: never guess the base article.
const UNSUPPORTED = /(ثالث|رابع|ter\b|مرتين|quater)/;

/** Code part -> slug; null = a code part we do not recognise; the year 1974 is only valid for civil procedure. */
function resolveCode(part) {
  let p = norm(part).replace(/^من\s+/, "").replace(/^(?:لسنه|سنه)\s+/, "");
  if (!p || UNSUPPORTED.test(p)) return null;
  const c = compact(p);
  if (Object.prototype.hasOwnProperty.call(ABBREVIATIONS, c)) {
    if (NEEDS_DOTS.has(c) && !/\./.test(part)) return null;
    return ABBREVIATIONS[c];
  }
  const years = p.match(/\d+/g) || [];
  p = p.replace(/\b(?:ل?سنه)\b/g, " ");
  const hit = NAMES.find(([name]) => ` ${p} `.includes(` ${norm(name)} `) || p.includes(norm(name)));
  if (!hit) return null;
  if (years.length) {
    // Only «المسطرة المدنية … 1974» names a different (repealed) text; any other year means another version or law.
    return hit[1] === "CPC-58.25" && years.length === 1 && years[0] === "1974" ? "CPC-1974" : null;
  }
  return hit[1];
}

const LABEL = "(?:المادة|الماده|مادة|ماده|الفصل|فصل|م|ف|article|art\\.?)";
const NUM = "(\\d{1,5}(?:\\s*[-./]\\s*\\d{1,3})?)";
const SUFFIX = "(?:\\s*-?\\s*(مكرر|bis))?";
const isFasl = (l) => /^(?:ال)?فصل$|^ف$/.test(l || "");

const text = { kind: "text" };

/** @returns {{kind:"citation", slug:string|null, number:string} | {kind:"text"}} */
export function parseCitation(input) {
  if (typeof input !== "string") return text;
  const t = norm(input.slice(0, 200));
  if (!t) return text;

  // [label] number [مكرر] [من] [code]      e.g. «م 230 د.ع», «الفصل 77 من الدستور», «230 د.ع»
  let m = new RegExp(`^(?:(${LABEL})\\s*)?${NUM}${SUFFIX}\\s*(.*)$`).exec(t);
  let label, num, bis, rest;
  if (m) [, label, num, bis, rest] = m;
  else {
    // [code] [label] number [مكرر]           e.g. «د.ع 230», «مدونة الأسرة 88-1»
    m = new RegExp(`^(.*?)\\s*(?:(${LABEL})\\s*)?${NUM}${SUFFIX}$`).exec(t);
    if (!m) return text;
    [, rest, label, num, bis] = m;
  }
  const parts = num.split(/\s*[-./]\s*/);
  if (!parts.every((x) => Number.isInteger(Number(x)) && Number(x) >= 0) || Number(parts[0]) < 1 || Number(parts[0]) > MAX_NUMBER) return text;
  const base = parts.map(Number).join("-");
  const number = bis ? `${base}-مكرر` : base;
  const code = (rest || "").trim();
  if (!code) return label ? { kind: "citation", slug: null, number } : text; // a bare number is a text search
  let slug = resolveCode(code);
  if (!slug) return text; // unknown code word: let full-text search handle it
  if (slug === "CPC-58.25" && isFasl(label)) slug = "CPC-1974"; // 1974 numbers its articles «الفصل», 58.25 «المادة»
  return { kind: "citation", slug, number };
}

const RECENTS_MAX = 8;

/** Newest first, no duplicates, capped. Entries are {canonicalId, label}; junk is ignored. */
export function pushRecent(list, entry) {
  const base = Array.isArray(list) ? list : [];
  if (!entry || typeof entry.canonicalId !== "string" || !entry.canonicalId) return base;
  return [{ canonicalId: entry.canonicalId, label: String(entry.label || "") }, ...base.filter((x) => x.canonicalId !== entry.canonicalId)].slice(0, RECENTS_MAX);
}
