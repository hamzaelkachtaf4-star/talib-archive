// Qanouni password policy (registration, owner setup, password change and reset). Mirrored for the live
// checklist in frontend/src/components/LawOS/lib/passwordPolicy.js; keep the two rule lists identical.
// "Special" is any printable character that is not a letter, digit or space (the UI shows !@#$%^&*… as
// examples), so passphrases with - _ + = also qualify.
const MIN = 8;
const MAX = 64;

const RULES = [
  ["length", (p) => p.length >= MIN && p.length <= MAX],
  ["upper", (p) => /[A-Z]/.test(p)],
  ["lower", (p) => /[a-z]/.test(p)],
  ["digit", (p) => /[0-9]/.test(p)],
  ["special", (p) => /[^A-Za-z0-9\s]/.test(p)],
];

/** @returns {{ok:boolean, failed:string[]}} */
function checkPassword(password) {
  const p = typeof password === "string" ? password : "";
  const failed = RULES.filter(([, test]) => !test(p)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}

/** Error code for the API, or null. */
function passwordPolicyError(password) {
  return checkPassword(password).ok ? null : "weak_password";
}

module.exports = { checkPassword, passwordPolicyError, PASSWORD_MIN: MIN, PASSWORD_MAX: MAX };
