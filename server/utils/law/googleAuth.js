// Google Sign-In for Qanouni (docs/plans/qanouni.md §2). The browser (Google Identity Services) or the
// Android app (Credential Manager) obtains an ID token; the server verifies its signature, audience and
// expiry with google-auth-library. Client ids come from env only, never from code:
//   GOOGLE_OAUTH_CLIENT_IDS=<web client id>[,<other accepted audiences>]
// The first id is the one the web button uses.

let verifier = null; // test seam: async (idToken) => payload

function googleClientIds() {
  return String(process.env.GOOGLE_OAUTH_CLIENT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function setGoogleVerifier(fn) {
  verifier = fn;
}

/**
 * @param {string} idToken
 * @returns {Promise<{sub: string, email: string, emailVerified: boolean, name: string|null}>}
 */
async function verifyGoogleIdToken(idToken) {
  const audience = googleClientIds();
  if (!audience.length) throw new Error("google_not_configured");
  let payload;
  if (verifier) payload = await verifier(idToken, audience);
  else {
    const { OAuth2Client } = require("google-auth-library");
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken,
      audience,
    });
    payload = ticket.getPayload();
  }
  if (!payload?.sub || !payload?.email) throw new Error("invalid_google_token");
  if (
    !["accounts.google.com", "https://accounts.google.com"].includes(
      payload.iss
    )
  )
    throw new Error("invalid_google_token");
  return {
    sub: String(payload.sub),
    email: String(payload.email),
    emailVerified: payload.email_verified === true,
    name: payload.name ? String(payload.name) : null,
  };
}

module.exports = { googleClientIds, setGoogleVerifier, verifyGoogleIdToken };
