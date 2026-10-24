// Qanouni one-time email codes (registration and password reset). A 6-digit code from a CSPRNG, stored only
// as an HMAC, valid 10 minutes. At most 5 wrong guesses per code, then the email is locked for 15 minutes;
// a new code can be requested at most once a minute. Unscoped client: there is no user yet.
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashCode(purpose, email, code) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET || "qanouni-email-codes")
    .update(`${purpose}:${email}:${code}`)
    .digest("hex");
}

function sameHash(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const seconds = (ms) => Math.max(1, Math.ceil(ms / 1000));

const LawEmailCode = {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  LOCK_MS,
  RESEND_COOLDOWN_MS,

  newCode() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  },

  /**
   * Creates or replaces the code for (purpose, email). `payload` (an object) replaces the stored one when
   * given; a resend passes none and keeps it.
   * @returns {{code, expiresAt, resendInSec} | {error:"locked"|"cooldown", retryAfterSec}}
   */
  async issue({ purpose, email, payload, now = new Date() }) {
    const existing = await rawDb().lawEmailCode.findUnique({
      where: { purpose_email: { purpose, email } },
    });
    if (existing?.lockedUntil && existing.lockedUntil > now)
      return { error: "locked", retryAfterSec: seconds(existing.lockedUntil - now) };
    if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS)
      return {
        error: "cooldown",
        retryAfterSec: seconds(RESEND_COOLDOWN_MS - (now - existing.lastSentAt)),
      };
    const code = this.newCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const data = {
      codeHash: hashCode(purpose, email, code),
      expiresAt,
      attempts: 0,
      lockedUntil: null,
      lastSentAt: now,
      ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
    };
    await rawDb().lawEmailCode.upsert({
      where: { purpose_email: { purpose, email } },
      create: { purpose, email, ...data },
      update: data,
    });
    return { code, expiresAt, resendInSec: seconds(RESEND_COOLDOWN_MS) };
  },

  /** True when a code is pending for (purpose, email) (resend only makes sense then). */
  async pending({ purpose, email }) {
    return !!(await rawDb().lawEmailCode.findUnique({
      where: { purpose_email: { purpose, email } },
    }));
  },

  /**
   * Checks a code. The attempt is counted before comparing (atomic increment), so parallel guesses can never
   * exceed MAX_ATTEMPTS. A correct code is consumed (single use).
   * @returns {{payload:object|null} | {error:"invalid_code"|"code_expired"|"locked", attemptsLeft?, retryAfterSec?}}
   */
  async verify({ purpose, email, code, now = new Date() }) {
    const row = await rawDb().lawEmailCode.findUnique({
      where: { purpose_email: { purpose, email } },
    });
    if (!row) return { error: "invalid_code", attemptsLeft: 0 };
    if (row.lockedUntil && row.lockedUntil > now)
      return { error: "locked", retryAfterSec: seconds(row.lockedUntil - now) };
    if (row.expiresAt <= now) return { error: "code_expired" };
    const counted = await rawDb().lawEmailCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    const lock = async () => {
      const lockedUntil = new Date(now.getTime() + LOCK_MS);
      await rawDb().lawEmailCode.update({ where: { id: row.id }, data: { lockedUntil } });
      return { error: "locked", retryAfterSec: seconds(LOCK_MS) };
    };
    if (counted.attempts > MAX_ATTEMPTS) return lock();
    const ok =
      /^\d{6}$/.test(String(code || "")) &&
      sameHash(row.codeHash, hashCode(purpose, email, String(code)));
    if (!ok) {
      if (counted.attempts >= MAX_ATTEMPTS) return lock();
      return { error: "invalid_code", attemptsLeft: MAX_ATTEMPTS - counted.attempts };
    }
    await rawDb().lawEmailCode.delete({ where: { id: row.id } }).catch(() => {});
    return { payload: row.payload ? JSON.parse(row.payload) : null };
  },

  /** Housekeeping: drop codes that expired (and are no longer locked) more than a day ago. */
  async prune(now = new Date()) {
    const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);
    await rawDb().lawEmailCode.deleteMany({
      where: { expiresAt: { lt: cutoff }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    });
  },
};

module.exports = { LawEmailCode };
