// Qanouni password policy, mirrored from server/utils/law/passwordPolicy.js (a server test checks that both
// give the same answers). Drives the live checklist and the strength meter on the sign-up and reset forms.
const MIN = 8;
const MAX = 64;

export const PASSWORD_RULES = [
  ["length", (p) => p.length >= MIN && p.length <= MAX],
  ["upper", (p) => /[A-Z]/.test(p)],
  ["lower", (p) => /[a-z]/.test(p)],
  ["digit", (p) => /[0-9]/.test(p)],
  ["special", (p) => /[^A-Za-z0-9\s]/.test(p)],
];

export function checkPassword(password) {
  const p = typeof password === "string" ? password : "";
  const failed = PASSWORD_RULES.filter(([, test]) => !test(p)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}

/** 0 empty, 1 weak (Faible), 2 medium (Moyen), 3 strong (Fort): strong only when every rule passes. */
export function passwordStrength(password) {
  const p = typeof password === "string" ? password : "";
  if (!p) return 0;
  const { failed } = checkPassword(p);
  if (!failed.length) return 3;
  return failed.length <= 2 && p.length >= 6 ? 2 : 1;
}
