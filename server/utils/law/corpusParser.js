// Splits raw statute text (from an official PDF's text layer, Gemini OCR, or pasted text) into articles
// for the import review screen (spec §6.5). It proposes boundaries; the student confirms them.
const { toWesternDigits } = require("./arabic");

// "الفصل 77" / "الفصل ٧٧" / "المادة 88-1" / "المادة 12 مكرر" / "Article 77" at the start of a line.
const ARTICLE_RE =
  /^\s*(?:ال)?(فصل|مادة|Article|Art\.?)\s+([0-9٠-٩]+(?:\s*[-–]\s*[0-9٠-٩]+)?(?:\s*(?:مكرر|ثالثا|رابعا|bis|ter))?)\s*[:.\-–—]?\s*(.*)$/i;
// No \b: in JS it only knows ASCII word characters, so it never matches after an Arabic word.
const HEADING_RE =
  /^\s*(الكتاب|القسم|الباب|الفرع|الجزء|Livre|Titre|Chapitre|Section)(?=[\s:،.-]|$)(.*)$/i;
const HEADING_LEVEL = {
  الجزء: 0,
  Livre: 0,
  الكتاب: 0,
  القسم: 1,
  Titre: 1,
  الباب: 2,
  Chapitre: 2,
  الفرع: 3,
  Section: 3,
};

function cleanNumber(raw) {
  return toWesternDigits(raw)
    .replace(/\s*[-–]\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ (مكرر|ثالثا|رابعا|bis|ter)$/i, "-$1");
}

function baseNumber(num) {
  const n = parseInt(num, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{articles: {number, headingPath, text, warnings}[], warnings: string[]}}
 */
function parseArticles(rawText) {
  const lines = String(rawText ?? "")
    .replace(/\r/g, "")
    .split("\n");
  const articles = [];
  const headings = [];
  let current = null;

  for (const line of lines) {
    const art = ARTICLE_RE.exec(line);
    if (art) {
      if (current) articles.push(current);
      current = {
        number: cleanNumber(art[2]),
        headingPath: headings.filter(Boolean).map((h) => h.text),
        lines: art[3] ? [art[3]] : [],
      };
      continue;
    }
    const head = HEADING_RE.exec(line);
    if (head && line.trim().length < 160) {
      const key = Object.keys(HEADING_LEVEL).find(
        (k) => k.toLowerCase() === head[1].toLowerCase()
      );
      const level = HEADING_LEVEL[key] ?? 3;
      headings.length = level;
      headings[level] = { text: line.trim() };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) articles.push(current);

  const out = articles.map((a) => ({
    number: a.number,
    headingPath: a.headingPath,
    text: a.lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    warnings: [],
  }));

  const warnings = [];
  const seen = new Map();
  let prev = null;
  for (const a of out) {
    if (!a.text) a.warnings.push("empty");
    if (seen.has(a.number)) a.warnings.push("duplicate");
    seen.set(a.number, true);
    const n = baseNumber(a.number);
    if (prev !== null && n !== null && n > prev + 1 && !/-/.test(a.number))
      a.warnings.push(`gap:${prev + 1}-${n - 1}`);
    if (n !== null) prev = Math.max(prev ?? n, n);
  }
  if (!out.length) warnings.push("no articles detected");
  return { articles: out, warnings };
}

module.exports = { parseArticles, cleanNumber };
