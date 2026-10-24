// Error types the worker treats differently (spec §6.3).
class BudgetError extends Error {
  constructor(provider, message) {
    super(message || `monthly AI budget reached for ${provider}`);
    this.name = "BudgetError";
    this.provider = provider;
  }
}

/** Not worth retrying: bad input, missing configuration, content refused. */
class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentError";
  }
}

/** Provider/network failure: retry with backoff, or try the fallback provider. */
class ProviderError extends Error {
  /**
   * @param {{usage?: {tokensIn:number, audioTokensIn?:number, tokensOut:number}, retryAfterMs?: number|null}} [meta]
   *   usage: tokens the provider billed for an answer we discarded (truncated, empty, invalid JSON).
   *   retryAfterMs: the provider's Retry-After hint on 429/5xx.
   */
  constructor(message, status = 0, { usage, retryAfterMs } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    if (usage) this.usage = usage;
    if (retryAfterMs != null) this.retryAfterMs = retryAfterMs;
  }
}

module.exports = { BudgetError, PermanentError, ProviderError };
