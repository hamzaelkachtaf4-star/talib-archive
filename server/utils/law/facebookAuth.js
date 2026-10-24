// Facebook Sign-In for Qanouni.
// Client obtains an access token (or auth code) via Facebook Login SDK;
// the server verifies the token against the Facebook Graph API:
//   /debug_token (token belongs to our app, still valid) then /me with appsecret_proof
// App ID and secret come from env:
//   FACEBOOK_APP_ID
//   FACEBOOK_APP_SECRET

let verifier = null; // test seam: async (accessToken) => payload

function facebookAppId() {
  return String(process.env.FACEBOOK_APP_ID || process.env.VITE_FACEBOOK_APP_ID || "").trim() || null;
}

function setFacebookVerifier(fn) {
  verifier = fn;
}

/**
 * @param {string} accessToken
 * @returns {Promise<{id: string, email: string, name: string|null}>}
 */
async function verifyFacebookToken(accessToken) {
  if (!accessToken || typeof accessToken !== "string" || accessToken.length < 10) {
    throw new Error("invalid_facebook_token");
  }
  if (verifier) return verifier(accessToken);

  const appId = facebookAppId();
  const secret = String(process.env.FACEBOOK_APP_SECRET || "").trim();
  if (!appId || !secret) throw new Error("facebook_not_configured");

  // 1. The token must have been issued to OUR app and still be valid. Without this check a token minted
  //    for any other Facebook app would sign its owner in here (confused deputy / account takeover).
  //    The app secret travels in a header, never in a URL.
  const graph = async (path, headers = {}) => {
    const res = await fetch(`https://graph.facebook.com/v19.0${path}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("invalid_facebook_token");
    return res.json();
  };
  let debug;
  try {
    debug = (
      await graph(`/debug_token?input_token=${encodeURIComponent(accessToken)}`, {
        Authorization: `Bearer ${appId}|${secret}`,
      })
    )?.data;
  } catch {
    throw new Error("invalid_facebook_token");
  }
  if (!debug?.is_valid || String(debug.app_id) !== appId || !debug.user_id)
    throw new Error("invalid_facebook_token");

  // 2. appsecret_proof proves the call comes from our server.
  const proof = require("crypto").createHmac("sha256", secret).update(accessToken).digest("hex");
  let payload;
  try {
    payload = await graph(
      `/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}&appsecret_proof=${proof}`
    );
  } catch {
    throw new Error("invalid_facebook_token");
  }
  if (!payload?.id || String(payload.id) !== String(debug.user_id))
    throw new Error("invalid_facebook_token");

  // Facebook accounts without an email address (e.g. phone-only signup) fallback to a unique identifier
  const email = payload.email
    ? String(payload.email)
    : `fb_${payload.id}@facebook.qanouni.local`;

  return {
    id: String(payload.id),
    email,
    name: payload.name ? String(payload.name) : null,
  };
}

module.exports = {
  facebookAppId,
  setFacebookVerifier,
  verifyFacebookToken,
};
