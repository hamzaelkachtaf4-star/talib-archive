// LAW-OS runtime configuration. Every model name, key and URL comes from env (spec §1.8, §4.4).
// Missing AI keys never prevent boot: the matching features report as disabled.

function str(name, fallback = null) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : String(v);
}

function num(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== "" ? n : fallback;
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function lawConfig() {
  const gemini = {
    apiKey: str("GEMINI_API_KEY"),
    baseUrl: str(
      "GEMINI_BASE_URL",
      "https://generativelanguage.googleapis.com"
    ),
    modelMultimodal: str("GEMINI_MODEL_MULTIMODAL"),
    modelFast: str("GEMINI_MODEL_FAST"),
    embeddingModel: str("GEMINI_EMBEDDING_MODEL"),
    monthlyBudgetUsd: num("AI_MONTHLY_BUDGET_USD_GEMINI", 0),
  };
  const deepseek = {
    apiKey: str("DEEPSEEK_API_KEY"),
    baseUrl: str("DEEPSEEK_BASE_URL"),
    modelReasoning: str("DEEPSEEK_MODEL_REASONING"),
    monthlyBudgetUsd: num("AI_MONTHLY_BUDGET_USD_DEEPSEEK", 0),
  };

  // USD per 1M tokens. Estimates for the budget gate only (spec §6.3); set real prices for your models.
  const prices = {
    gemini: {
      input: num("AI_PRICE_GEMINI_INPUT_PER_MTOK", 0.3),
      audioInput: num("AI_PRICE_GEMINI_AUDIO_INPUT_PER_MTOK", 1.0),
      output: num("AI_PRICE_GEMINI_OUTPUT_PER_MTOK", 2.5),
    },
    deepseek: {
      input: num("AI_PRICE_DEEPSEEK_INPUT_PER_MTOK", 0.28),
      output: num("AI_PRICE_DEEPSEEK_OUTPUT_PER_MTOK", 0.42),
    },
  };

  return {
    baseUrl: str("LAWOS_BASE_URL"),
    worker: str("LAWOS_WORKER", "on") !== "off",
    ffmpegPath: str("FFMPEG_PATH", "ffmpeg"),
    ffprobePath: str("FFPROBE_PATH", "ffprobe"),
    prices,
    port: num("LAWOS_PORT", 3005),
    timezone: str("TZ", "Africa/Casablanca"),
    hideUpstream: bool("LAWOS_HIDE_UPSTREAM", true),
    examLockdownDays: num("EXAM_LOCKDOWN_DAYS", 10),
    newCardsPerDay: num("NEW_CARDS_PER_DAY", 15),
    scraper: {
      enabled: bool("SCRAPER_ENABLED", false),
      minIntervalSeconds: Math.max(10, num("SCRAPER_MIN_INTERVAL_SECONDS", 10)),
    },
    vapid: {
      publicKey: str("VAPID_PUBLIC_KEY"),
      privateKey: str("VAPID_PRIVATE_KEY"),
    },
    gemini,
    deepseek,
    ai: {
      geminiEnabled: !!(gemini.apiKey && gemini.modelMultimodal),
      deepseekEnabled: !!(
        deepseek.apiKey &&
        deepseek.baseUrl &&
        deepseek.modelReasoning
      ),
    },
  };
}

/**
 * Config safe to send to the client: no secrets, only presence flags.
 */
function publicLawConfig(cfg = lawConfig()) {
  return {
    baseUrl: cfg.baseUrl,
    timezone: cfg.timezone,
    hideUpstream: cfg.hideUpstream,
    examLockdownDays: cfg.examLockdownDays,
    newCardsPerDay: cfg.newCardsPerDay,
    scraper: cfg.scraper,
    vapidPublicKey: cfg.vapid.publicKey,
    ai: {
      geminiEnabled: cfg.ai.geminiEnabled,
      deepseekEnabled: cfg.ai.deepseekEnabled,
      geminiModels: {
        multimodal: cfg.gemini.modelMultimodal,
        fast: cfg.gemini.modelFast,
        embedding: cfg.gemini.embeddingModel,
      },
      deepseekModel: cfg.deepseek.modelReasoning,
      budgetsUsd: {
        gemini: cfg.gemini.monthlyBudgetUsd,
        deepseek: cfg.deepseek.monthlyBudgetUsd,
      },
    },
  };
}

module.exports = { lawConfig, publicLawConfig };
