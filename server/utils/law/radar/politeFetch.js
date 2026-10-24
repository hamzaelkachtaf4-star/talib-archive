// Polite fetching for the legislative radar (spec §6.5): one clear user agent, at least
// SCRAPER_MIN_INTERVAL_SECONDS (never under 10 s in production) between ANY two requests to official
// sites, conditional GETs so unchanged pages cost nothing, and a hard timeout.
const UA =
  "LAW-OS/1.0 (personal study tool of one law student; low-frequency, cached; respects robots)";
const { safeFetch } = require("../safeFetch");
const sources = require("./sources.json");

// Exact-host allowlist (SSRF guard, RC2 1.5): the radar's own sources, plus RADAR_ALLOWED_HOSTS (comma list).
// RADAR_ALLOW_PRIVATE exists for the offline test server only and is ignored in production.
function allowedHosts() {
  const own = (sources.sources || []).map((s) => new URL(s.url).hostname);
  const extra = String(process.env.RADAR_ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
  return [...new Set([...own, ...extra])];
}
const allowPrivate = () => process.env.RADAR_ALLOW_PRIVATE === "true" && process.env.NODE_ENV !== "production";
const MAX_BYTES = 25 * 1024 * 1024; // official gazette PDFs are the largest thing fetched

let lastRequestAt = 0;
let chain = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} url
 * @param {{minIntervalMs:number, etag?:string, lastModified?:string, timeoutMs?:number, binary?:boolean}} opts
 * @returns {Promise<{status:number, body:string|Buffer|null, etag:string|null, lastModified:string|null, at:number}>}
 */
function politeFetch(
  url,
  { minIntervalMs, etag, lastModified, timeoutMs = 30000, binary = false }
) {
  // Serialize every request so the interval holds even when several callers race.
  const run = chain.then(async () => {
    const wait = lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const headers = {
      "User-Agent": UA,
      Accept: binary ? "application/pdf,*/*" : "text/html,*/*",
    };
    if (etag) headers["If-None-Match"] = etag;
    if (lastModified) headers["If-Modified-Since"] = lastModified;
    const res = await safeFetch(url, {
      headers,
      timeoutMs: Math.min(timeoutMs, 10000), // SSRF policy: never wait longer than 10 s on a third-party host
      maxBytes: MAX_BYTES,
      allowHosts: allowedHosts(),
      allowHttpHosts: allowPrivate() ? allowedHosts() : [],
      allowPrivate: allowPrivate(),
    });
    return {
      status: res.status,
      body: res.status === 304 ? null : binary ? res.body : res.body.toString("utf8"),
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      at: lastRequestAt,
    };
  });
  chain = run.catch(() => {});
  return run;
}

function resetPoliteFetch() {
  lastRequestAt = 0;
  chain = Promise.resolve();
}

module.exports = { politeFetch, resetPoliteFetch, UA };
