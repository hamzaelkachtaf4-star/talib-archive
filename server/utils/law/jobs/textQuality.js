// Detects a PDF text layer that is stored in VISUAL order: Arabic words reversed ("غير بينهم" as "ريغ نيبو مهنيب") and
// letters split apart ("القانون" as "ن وناقلا"). Such text is not empty, so it used to be accepted as good text, and
// a statute built from it is wrong in places nobody would notice. Typed Arabic has almost no isolated single letters
// once legitimate uses are set aside (measured on typed notes: <= 0.5%); the visual-order PDF that prompted this had
// 1.5%-15% per page, median 9.8%.
//
// Legitimate isolated letters that must NOT count: a lone "و" (the conjunction), short-vowel marks that the PDF
// reader emits apart from their letter (يُعاقب -> "ي", "ُ", "عاقب"), units and abbreviations beside a number
// (سنة 2011 م، 1200 د، ف 1), and list markers (أ - ... / أ ... ب ... ج ...: letters in abjad order).
const MIN_WORDS = 30;
const MIN_ISOLATED = 5;
const RATIO = 0.02;
const LETTER = /^[ء-ي]$/;
const PUNCT = /^[-–—)(.:،؛/\\]$/;
const DIGITS = /\d/;
const HARAKAT = /\s*[ً-ٰٟ]\s*/g; // fathatan .. sukun, dagger alef
const ABJAD = "أبجدهوزحطيكلمنسعفصقرشتثخذضظغ"; // "ا" is looked up as "أ"

function looksGarbledArabic(text) {
  if (typeof text !== "string" || !text) return false;
  // Presentation forms fold to base letters; detached vowel marks are joined back before judging.
  const words = text.normalize("NFKC").replace(HARAKAT, "").split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS) return false;
  const isolated = []; // indexes of candidate isolated letters
  for (let i = 0; i < words.length; i++) {
    if (!LETTER.test(words[i]) || words[i] === "و") continue;
    if (PUNCT.test(words[i + 1] || "") || PUNCT.test(words[i - 1] || "")) continue; // "أ - ...", "( ب )"
    if (DIGITS.test(words[i + 1] || "") || DIGITS.test(words[i - 1] || "")) continue; // "2011 م", "ف 1"
    isolated.push(i);
  }
  // Lettered lists: a marker's successor in abjad order is the next isolated letter ("أ ... ب ... ج ...").
  const order = (c) => ABJAD.indexOf(c === "ا" ? "أ" : c);
  const marker = new Set();
  for (let k = 0; k + 1 < isolated.length; k++) {
    const a = order(words[isolated[k]]);
    const b = order(words[isolated[k + 1]]);
    if (a >= 0 && b === a + 1) {
      marker.add(isolated[k]);
      marker.add(isolated[k + 1]);
    }
  }
  const count = isolated.filter((i) => !marker.has(i)).length;
  return count >= MIN_ISOLATED && count / words.length >= RATIO;
}

module.exports = { looksGarbledArabic };
