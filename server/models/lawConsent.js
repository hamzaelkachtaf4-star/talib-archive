// Qanouni Collab, Phase 0: acceptance of the legal notice (academic tool, copyright and privacy, personal
// data, AI accuracy). A student must accept the current version before using shared (squad) features; a new
// version requires a new acceptance. The IP and user agent are kept as evidence of consent, nothing more.
const { rawDb } = require("../utils/law/dbClient");

const CONSENT_VERSION = "1.1.0"; // 1.1.0: learner memory ("ذاكرتي") disclosure + off switch (Phase 10)

const LawConsent = {
  CONSENT_VERSION,

  get: async function (userId) {
    const row = await rawDb().lawUserConsent.findUnique({ where: { userId } });
    return {
      version: CONSENT_VERSION,
      accepted:
        !!row &&
        row.version === CONSENT_VERSION &&
        row.termsAccepted &&
        row.academicNotice &&
        row.privacyAccepted,
      acceptedVersion: row?.version || null,
      acceptedAt: row?.acceptedAt || null,
    };
  },

  /** All three boxes must be true and the version must be the current one. */
  accept: async function (userId, { termsAccepted, academicNotice, privacyAccepted, version }, meta = {}) {
    if (version !== CONSENT_VERSION) return { error: "consent_version_mismatch" };
    if (termsAccepted !== true || academicNotice !== true || privacyAccepted !== true)
      return { error: "consent_incomplete" };
    const data = {
      termsAccepted: true,
      academicNotice: true,
      privacyAccepted: true,
      version: CONSENT_VERSION,
      acceptedAt: new Date(),
      ipAddress: meta.ip ? String(meta.ip).slice(0, 64) : null,
      userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
    };
    await rawDb().lawUserConsent.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return { consent: await this.get(userId), error: null };
  },
};

module.exports = { LawConsent };
