// Short-lived signed URLs for originals, so <img>/<audio> (which can't send an Authorization header)
// can stream assets with Range support. HMAC over "<assetId>:<exp>".
const crypto = require("crypto");

const TTL_SEC = 3600;
// Prefer a persistent secret; otherwise a per-process key (URLs simply expire on restart).
const KEY =
  process.env.SIG_KEY ||
  process.env.JWT_SECRET ||
  crypto.randomBytes(32).toString("hex");

function mac(assetId, exp) {
  return crypto
    .createHmac("sha256", KEY)
    .update(`lawos-asset:${assetId}:${exp}`)
    .digest("base64url");
}

function signAsset(assetId, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SEC;
  return { exp, sig: mac(assetId, exp) };
}

function verifyAsset(assetId, exp, sig, now = Date.now()) {
  const e = Number(exp);
  if (
    !Number.isInteger(e) ||
    e < Math.floor(now / 1000) ||
    typeof sig !== "string"
  )
    return false;
  const expected = Buffer.from(mac(assetId, e));
  const given = Buffer.from(sig);
  return (
    expected.length === given.length && crypto.timingSafeEqual(expected, given)
  );
}

module.exports = { signAsset, verifyAsset, TTL_SEC };
