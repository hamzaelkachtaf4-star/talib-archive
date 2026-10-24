// Qanouni QR quick login (WhatsApp Web style). A signed-out device asks for a QR; it gets a public qrToken
// (inside the QR) and a private pollSecret (kept in memory). A signed-in device scans the QR and approves;
// the waiting device then polls with both and receives a session exactly once. A photo of the QR alone is
// never enough to obtain a session. Tokens live 5 minutes; only SHA-256 hashes are stored.
const crypto = require("crypto");
const { rawDb } = require("../utils/law/dbClient");

const TTL_MS = 5 * 60 * 1000;
const sha = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const random = () => crypto.randomBytes(24).toString("base64url");
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

function sameHash(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** "Chrome · macOS" from a user agent, for the approval prompt. */
function describeAgent(ua = "") {
  const browser =
    (/Edg\//.test(ua) && "Edge") ||
    (/OPR\//.test(ua) && "Opera") ||
    (/Firefox\//.test(ua) && "Firefox") ||
    (/Chrome\//.test(ua) && "Chrome") ||
    (/Safari\//.test(ua) && "Safari") ||
    null;
  const os =
    (/Windows/.test(ua) && "Windows") ||
    (/Android/.test(ua) && "Android") ||
    (/iPhone|iPad/.test(ua) && "iOS") ||
    (/Mac OS X/.test(ua) && "macOS") ||
    (/Linux/.test(ua) && "Linux") ||
    null;
  return [browser, os].filter(Boolean).join(" · ") || null;
}

const LawQrLogin = {
  TTL_MS,
  describeAgent,
  isToken: (t) => TOKEN.test(String(t || "")),

  async create({ userAgent = "", now = new Date() } = {}) {
    // Housekeeping on the way: nothing older than an hour is ever needed.
    await rawDb()
      .lawQrLogin.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3600_000) } } })
      .catch(() => {});
    const qrToken = random();
    const pollSecret = random();
    const expiresAt = new Date(now.getTime() + TTL_MS);
    await rawDb().lawQrLogin.create({
      data: {
        tokenHash: sha(qrToken),
        pollSecretHash: sha(pollSecret),
        requesterAgent: describeAgent(userAgent),
        expiresAt,
      },
    });
    return { qrToken, pollSecret, expiresAt };
  },

  async find(qrToken) {
    if (!this.isToken(qrToken)) return null;
    return rawDb().lawQrLogin.findUnique({ where: { tokenHash: sha(qrToken) } });
  },

  /** What the approving device shows before the student confirms. */
  async inspect(qrToken, now = new Date()) {
    const row = await this.find(qrToken);
    if (!row || row.status !== "pending" || row.expiresAt <= now) return { error: "qr_invalid" };
    return { requesterAgent: row.requesterAgent, expiresAt: row.expiresAt };
  },

  /** Approve (bind to userId) or deny a pending QR. Single-use: only a pending, unexpired row changes. */
  async decide(qrToken, userId, approve, now = new Date()) {
    if (!this.isToken(qrToken)) return { error: "qr_invalid" };
    const { count } = await rawDb().lawQrLogin.updateMany({
      where: { tokenHash: sha(qrToken), status: "pending", expiresAt: { gt: now } },
      data: approve
        ? { status: "approved", userId, approvedAt: now }
        : { status: "denied" },
    });
    return count === 1 ? { ok: true } : { error: "qr_invalid" };
  },

  /**
   * The waiting device. Returns {status:"pending"|"denied"|"expired"} or {status:"approved", userId} once:
   * the approved row is consumed in the same step, so a second poll gets qr_invalid.
   */
  async poll(qrToken, pollSecret, now = new Date()) {
    const row = await this.find(qrToken);
    if (!row || !pollSecret || !sameHash(row.pollSecretHash, sha(pollSecret)))
      return { error: "qr_invalid" };
    if (row.status === "denied") return { status: "denied" };
    if (row.status === "consumed") return { error: "qr_invalid" };
    if (row.status === "pending")
      return row.expiresAt <= now ? { status: "expired" } : { status: "pending" };
    const { count } = await rawDb().lawQrLogin.updateMany({
      where: { id: row.id, status: "approved" },
      data: { status: "consumed" },
    });
    if (count !== 1) return { error: "qr_invalid" };
    return { status: "approved", userId: row.userId };
  },
};

module.exports = { LawQrLogin };
