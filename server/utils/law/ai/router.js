// The only path to AI providers (spec §12: "All AI calls go through the router").
// - Routing table (spec §7.1), overridable per purpose from settings (aiRouting).
// - Budget gate (spec §6.3): month-to-date estimated spend per provider is checked before every call.
// - Fallback provider on provider/network errors only, and only for text-only requests.
// - Every call is logged to LawAiCall with tokens, estimated cost and latency, never the content.
const crypto = require("crypto");
const { db, rawDb } = require("../dbClient");
const { lawConfig } = require("../config");
const { LawSetting } = require("../../../models/lawSetting");
const { geminiClient } = require("./gemini");
const { deepseekClient } = require("./deepseek");
const { BudgetError, PermanentError, ProviderError } = require("./errors");

// Multimodal purposes have no fallback provider, so a rate limit / 5xx gets one jittered retry instead.
const RETRY_PURPOSES = new Set(["ocr", "transcription", "pdf_vision"]);
const RETRY_CAP_MS = 30000;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

const retryable = (e) => e instanceof ProviderError && (e.status === 429 || e.status >= 500);

/** Retry-After when the provider sent one, else 2-4 s; plus up to 1 s jitter; never above 30 s. */
function retryDelayMs(e) {
  const base = e.retryAfterMs != null ? e.retryAfterMs : 2000 + Math.random() * 2000;
  return Math.min(RETRY_CAP_MS, Math.round(base + Math.random() * 1000));
}

// purpose → [primary, fallback|null]; tier picks the Gemini model.
const ROUTES = {
  ocr: { providers: ["gemini", null], tier: "multimodal" },
  transcription: { providers: ["gemini", null], tier: "multimodal" },
  pdf_vision: { providers: ["gemini", null], tier: "multimodal" },
  segmentation: { providers: ["gemini", "deepseek"], tier: "fast" },
  polycopie_alignment: { providers: ["gemini", "deepseek"], tier: "fast" },
  candidate_atoms: { providers: ["gemini", "deepseek"], tier: "fast" },
  case_critique: { providers: ["deepseek", "gemini"], tier: "fast" },
  dissertation_critique: { providers: ["deepseek", "gemini"], tier: "fast" },
  qualification_drill: { providers: ["deepseek", "gemini"], tier: "fast" },
  flashcard_draft: { providers: ["deepseek", "gemini"], tier: "fast" },
  model_answer: { providers: ["deepseek", "gemini"], tier: "fast" },
  weekly_recap: { providers: ["gemini", "deepseek"], tier: "fast" },
  timetable_parse: { providers: ["gemini", "deepseek"], tier: "multimodal" },
  brain_classify: { providers: ["deepseek", "gemini"], tier: "fast" },
  brain_drill: { providers: ["deepseek", "gemini"], tier: "fast" },
  legal_chat: { providers: ["deepseek", "gemini"], tier: "fast" },
  master_note_synthesis: { providers: ["deepseek", "gemini"], tier: "fast" },
  module_mentor: { providers: ["deepseek", "gemini"], tier: "fast" },
  exam_drill: { providers: ["deepseek", "gemini"], tier: "fast" },
  exam_critique: { providers: ["deepseek", "gemini"], tier: "fast" },
  exam_dates_parse: { providers: ["gemini", "deepseek"], tier: "multimodal" },
};

// Test seam: swap provider clients without touching fetch.
let clientFactory = {
  gemini: (cfg) => geminiClient(cfg.gemini),
  deepseek: (cfg) => deepseekClient(cfg.deepseek),
};
function setClientFactory(f) {
  clientFactory = f;
}

function modelFor(provider, tier, cfg) {
  if (provider === "deepseek") return cfg.deepseek.modelReasoning;
  return tier === "fast"
    ? cfg.gemini.modelFast || cfg.gemini.modelMultimodal
    : cfg.gemini.modelMultimodal;
}

function estimateCost(provider, usage, cfg) {
  const p = cfg.prices[provider];
  const audio = usage.audioTokensIn || 0;
  const text = Math.max(0, (usage.tokensIn || 0) - audio);
  const audioPrice = p.audioInput ?? p.input;
  return (
    (text * p.input + audio * audioPrice + (usage.tokensOut || 0) * p.output) /
    1e6
  );
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// The keys and budgets are the admin's, so spend is counted across every user.
async function spentThisMonth(provider, now = new Date()) {
  const agg = await rawDb().lawAiCall.aggregate({
    where: { provider, createdAt: { gte: monthStart(now) } },
    _sum: { estimatedCostUsd: true },
  });
  return agg._sum.estimatedCostUsd || 0;
}

async function budgetFor(provider) {
  return LawSetting.get(
    provider === "gemini" ? "aiBudgetGeminiUsd" : "aiBudgetDeepseekUsd"
  );
}

async function checkBudget(provider, now) {
  const budget = await budgetFor(provider);
  if (!(budget > 0))
    throw new BudgetError(provider, `no monthly budget set for ${provider}`);
  const spent = await spentThisMonth(provider, now);
  if (spent >= budget)
    throw new BudgetError(
      provider,
      `${provider} monthly budget reached (${spent.toFixed(2)} / ${budget} USD)`
    );
}

function enabled(provider, cfg) {
  return provider === "gemini" ? cfg.ai.geminiEnabled : cfg.ai.deepseekEnabled;
}

async function log(entry) {
  try {
    return (await db().lawAiCall.create({ data: entry })).id;
  } catch (e) {
    console.error("[LAW-OS] ai call log failed:", e.message);
    return null;
  }
}

/** Store the grounding validation result on the call that produced the output (spec §7.2 step 5). */
async function recordValidation(aiCallId, validation) {
  if (!aiCallId) return;
  try {
    await db().lawAiCall.update({
      where: { id: aiCallId },
      data: { validation: JSON.stringify(validation) },
    });
  } catch (e) {
    console.error("[LAW-OS] validation log failed:", e.message);
  }
}

/**
 * @param {{purpose:string, prompt:{id:string,version:number,hash:string}, system?:string, parts:object[],
 *   schema?:object, temperature?:number, maxOutputTokens?:number, jobId?:string}} req
 * @returns {Promise<{text, json, provider, model, usage, costUsd}>}
 */
async function generate(req, { now = new Date(), sleep = defaultSleep } = {}) {
  const route = ROUTES[req.purpose];
  if (!route) throw new PermanentError(`unknown AI purpose ${req.purpose}`);
  const cfg = lawConfig();
  const overrides = (await LawSetting.get("aiRouting")) || {};
  const primary = overrides[req.purpose] || route.providers[0];
  const fallback =
    [route.providers[0], route.providers[1]].find((p) => p && p !== primary) ||
    null;
  const textOnly = req.parts.every((p) => "text" in p);
  const chain = [primary, ...(fallback && textOnly ? [fallback] : [])].filter(
    (p) => enabled(p, cfg)
  );
  if (!chain.length)
    throw new PermanentError(`no configured AI provider for ${req.purpose}`);

  const promptHash = crypto
    .createHash("sha256")
    .update(
      `${req.prompt?.id}:${req.prompt?.version}:${req.prompt?.hash}:${req.system || ""}`
    )
    .digest("hex")
    .slice(0, 16);

  let lastError = null;
  for (const provider of chain) {
    const model = modelFor(provider, route.tier, cfg);
    for (let attempt = 0; attempt < 2; attempt++) {
      await checkBudget(provider, now); // BudgetError propagates: the job pauses rather than spending on a fallback
      const started = Date.now();
      try {
        const out = await clientFactory[provider](cfg).generate({
          ...req,
          model,
        });
        const costUsd = estimateCost(provider, out.usage, cfg);
        const aiCallId = await log({
          provider,
          model: out.model || model,
          purpose: req.purpose,
          promptHash,
          tokensIn: out.usage.tokensIn,
          tokensOut: out.usage.tokensOut,
          estimatedCostUsd: costUsd,
          latencyMs: Date.now() - started,
          status: "ok",
          jobId: req.jobId || null,
        });
        return { ...out, provider, costUsd, aiCallId };
      } catch (e) {
        // A discarded answer (truncated, empty, bad JSON) was still billed: count it against the budget.
        const billed = e.usage
          ? {
              tokensIn: e.usage.tokensIn,
              tokensOut: e.usage.tokensOut,
              estimatedCostUsd: estimateCost(provider, e.usage, cfg),
            }
          : {};
        await log({
          provider,
          model: model || "unknown",
          purpose: req.purpose,
          promptHash,
          ...billed,
          latencyMs: Date.now() - started,
          status: e instanceof PermanentError ? "error_permanent" : "error",
          jobId: req.jobId || null,
        });
        lastError = e;
        if (!(e instanceof ProviderError)) throw e; // only transient provider failures fall back
        if (attempt === 0 && RETRY_PURPOSES.has(req.purpose) && retryable(e)) {
          await sleep(retryDelayMs(e));
          continue;
        }
        break;
      }
    }
  }
  throw lastError;
}

/** Spend per provider and purpose for a month (spec §9.8 /ai/usage). */
async function usage(month) {
  const [y, m] = (month || new Date().toISOString().slice(0, 7))
    .split("-")
    .map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const rows = await rawDb().lawAiCall.groupBy({
    by: ["provider", "purpose"],
    where: { createdAt: { gte: from, lt: to } },
    _sum: { estimatedCostUsd: true, tokensIn: true, tokensOut: true },
    _count: { _all: true },
  });
  const byProvider = {};
  for (const r of rows) {
    byProvider[r.provider] ||= { costUsd: 0, calls: 0, purposes: [] };
    byProvider[r.provider].costUsd += r._sum.estimatedCostUsd || 0;
    byProvider[r.provider].calls += r._count._all;
    byProvider[r.provider].purposes.push({
      purpose: r.purpose,
      calls: r._count._all,
      tokensIn: r._sum.tokensIn || 0,
      tokensOut: r._sum.tokensOut || 0,
      costUsd: r._sum.estimatedCostUsd || 0,
    });
  }
  return {
    month: `${y}-${String(m).padStart(2, "0")}`,
    budgets: {
      gemini: await budgetFor("gemini"),
      deepseek: await budgetFor("deepseek"),
    },
    byProvider,
    pausedJobs: await rawDb().lawJob.count({
      where: { status: "paused_budget" },
    }),
  };
}

module.exports = {
  recordValidation,
  ROUTES,
  generate,
  usage,
  estimateCost,
  spentThisMonth,
  setClientFactory,
  monthStart,
};
