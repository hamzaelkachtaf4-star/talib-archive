// RC3 Phase 7: the human-readable friend code, XXXX-XXXX. 29 unambiguous characters (no 0/O, 1/I/L, U/V confusion
// on a screenshot or a spoken code), 29^8 (5e11) combinations. The older QAN-NAME-1234 codes keep working.
const crypto = require("crypto");

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ"; // 29 letters/digits: no 0 O 1 I L U V
const SHAPE = /^[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}$/;

function generate() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Accepts "abcd efgh", "abcd-efgh", "ABCDEFGH"; returns the canonical form or null. */
function normalize(raw) {
  const s = String(raw ?? "").toUpperCase().replace(/[\s-]+/g, "");
  if (s.length !== 8) return null;
  const code = `${s.slice(0, 4)}-${s.slice(4)}`;
  return SHAPE.test(code) ? code : null;
}

/** The WhatsApp share URL for a message that already contains the code (the app link is added by the client from its own origin). */
const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(String(text))}`;

module.exports = { ALPHABET, generate, normalize, whatsappUrl };
