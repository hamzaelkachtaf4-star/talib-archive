// Shared HTTP plumbing for the provider clients: every request is bounded, so a stalled connection
// becomes a retryable ProviderError instead of hanging the single background worker forever.
const { ProviderError } = require("./errors");

const DEFAULT_TIMEOUTS = { generateMs: 300000, uploadMs: 600000 };

function resolveTimeouts(overrides) {
  return { ...DEFAULT_TIMEOUTS, ...(overrides || {}) };
}

/** `Retry-After` (seconds or HTTP date) in ms, or null. */
function retryAfterMs(res) {
  const v = res?.headers?.get?.("retry-after");
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** fetch with a hard deadline. Network errors and timeouts surface as ProviderError. */
async function timedFetch(label, url, init, timeoutMs) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError")
      throw new ProviderError(`${label} request timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw new ProviderError(`${label} network error: ${e.message}`);
  }
}

/** Reads a response body; a deadline hit mid-body or a non-JSON body is a ProviderError, never a raw DOMException. */
async function readBody(label, res, kind = "json") {
  try {
    return await (kind === "json" ? res.json() : res.text());
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError")
      throw new ProviderError(`${label} response timed out while reading the body`);
    throw new ProviderError(`${label} returned an unreadable response: ${e.message}`);
  }
}

/**
 * Deadline for a generate call: the 300 s floor, longer for very large outputs (65k-token PDF jobs can need
 * more than 5 minutes). An explicit override always wins.
 */
function generateDeadlineMs(overrides, maxOutputTokens = 8192) {
  if (overrides?.generateMs != null) return overrides.generateMs;
  return Math.max(DEFAULT_TIMEOUTS.generateMs, 60000 + maxOutputTokens * 10);
}

module.exports = { DEFAULT_TIMEOUTS, resolveTimeouts, retryAfterMs, timedFetch, readBody, generateDeadlineMs };
