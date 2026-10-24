# Security notes (rc2)

## Phone discovery key
Contact matching stores `HMAC-SHA256(PHONE_HASH_KEY, E.164)`; never the number. One server-side key (a per-record salt would make matching impossible), >= 32 chars, from the environment only (`openssl rand -hex 32`). With `FEATURE_CONTACT_MATCH=true` the server **refuses to start** without it. The legacy name `PHONE_HASH_PEPPER` is still read so existing hashes stay valid.

**Rotation:** the old key cannot be derived back to numbers, so hashes cannot be re-keyed server-side. To rotate: set the new key, truncate `LawPhoneHash`, and ask students to re-enter their number (opt-in consent is re-collected). Matching is unavailable until they do.

## Outbound fetches (SSRF)
`utils/law/safeFetch.js` is the only way server code fetches an operator/third-party URL: exact-host allowlist, https only, DNS resolved and every address checked (loopback, RFC1918, link-local, metadata, ULA), the validated address is the one connected to, redirects followed manually and re-validated, 10 s timeout, size cap. Radar hosts come from `radar/sources.json` + `RADAR_ALLOWED_HOSTS`; timetable hosts are `www.fdc.ma` + `FDC_ALLOWED_HOSTS`. `RADAR_ALLOW_PRIVATE=true` exists for the offline test server and is ignored in production.

## AI routes
`utils/law/aiGuard.js` (per-user in-flight cap `AI_MAX_IN_FLIGHT`=2, per-IP `AI_IP_PER_MINUTE`=60) sits in front of every route that reaches the provider; the daily quota (`aiQuota.js`) is one conditional UPDATE, refunded on provider failure.

## Profile privacy
`utils/law/privacy.js#canViewProfile` returns `FULL | PUBLIC_CARD | NONE`. Blocked or not opted in = `NONE` (same 404 as "doesn't exist").

## Content
User Markdown goes through `lib/mdPolicy.js` (no raw HTML, http/https/mailto links only, `rel=noopener noreferrer nofollow`) then DOMPurify. The served index page carries a CSP without `unsafe-inline`.
