// Server-side secret for phone hashing (RC2 1.3). HMAC-SHA256(PHONE_HASH_KEY, E.164): one key for all records,
// because a per-record salt would make contact matching impossible. The key is the whole defence (Moroccan mobile
// numbers are a tiny space), so it must be >= 32 chars, come from the environment and never reach a client.
// PHONE_HASH_PEPPER is the pre-rc2 name; honoured so existing hashes stay valid.
const MIN_LEN = 32;

const rawKey = () => process.env.PHONE_HASH_KEY || process.env.PHONE_HASH_PEPPER || "";
const phoneKey = () => (rawKey().length >= MIN_LEN ? rawKey() : null);
const contactMatchEnabled = () => process.env.FEATURE_CONTACT_MATCH === "true";

/** Refuses to start when contact matching is on without a usable key. Called from server/index.js. */
function assertPhoneKeyConfigured() {
  if (contactMatchEnabled() && !phoneKey())
    throw new Error(`FEATURE_CONTACT_MATCH=true requires PHONE_HASH_KEY of at least ${MIN_LEN} characters`);
}

module.exports = { phoneKey, assertPhoneKeyConfigured, MIN_LEN };
