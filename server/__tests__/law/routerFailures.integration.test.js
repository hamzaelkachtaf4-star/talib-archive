// Router behaviour around failed provider calls: billed-but-discarded output still counts against the
// budget, and rate-limited / 5xx multimodal calls (no fallback exists) get exactly one jittered retry.
const { createTempDb } = require("../../utils/law/testing/tempDb");
const { db } = require("../../utils/law/dbClient");
const { LawSetting } = require("../../models/lawSetting");
const router = require("../../utils/law/ai/router");
const { BudgetError, PermanentError, ProviderError } = require("../../utils/law/ai/errors");

jest.setTimeout(30000);

let tmp;
const ENV = process.env;
const prompt = { id: "t", version: 1, hash: "h" };
const media = { inlineData: { mimeType: "audio/webm", data: "" } };

beforeEach(async () => {
  process.env = {
    ...ENV,
    GEMINI_API_KEY: "k",
    GEMINI_MODEL_MULTIMODAL: "gm-multi",
    GEMINI_MODEL_FAST: "gm-fast",
    DEEPSEEK_API_KEY: "k",
    DEEPSEEK_BASE_URL: "http://deepseek.invalid",
    DEEPSEEK_MODEL_REASONING: "ds-r",
  };
  tmp = await createTempDb();
  await LawSetting.update({ aiBudgetGeminiUsd: 5, aiBudgetDeepseekUsd: 5 });
});
afterEach(async () => {
  router.setClientFactory({ gemini: () => null, deepseek: () => null });
  await tmp.cleanup();
  process.env = ENV;
});

function fake(behaviour) {
  router.setClientFactory({
    gemini: () => ({ generate: async (r) => behaviour("gemini", r) }),
    deepseek: () => ({ generate: async (r) => behaviour("deepseek", r) }),
  });
}
const okOut = (r) => ({ text: "{}", json: {}, model: r.model, usage: { tokensIn: 10, tokensOut: 5 } });
const httpError = (status, extra = {}) => Object.assign(new ProviderError(`http ${status}`, status), extra);

describe("billed failures", () => {
  test("a truncated answer is logged with its tokens and cost, then falls back", async () => {
    fake((p, r) => {
      if (p === "gemini")
        throw Object.assign(new ProviderError("gemini output truncated (MAX_TOKENS)"), {
          usage: { tokensIn: 1_000_000, audioTokensIn: 0, tokensOut: 0 },
        });
      return okOut(r);
    });
    const out = await router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] });
    expect(out.provider).toBe("deepseek");
    const failed = await db().lawAiCall.findFirst({ where: { provider: "gemini" } });
    expect(failed.status).toBe("error");
    expect(failed.tokensIn).toBe(1_000_000);
    expect(failed.estimatedCostUsd).toBeCloseTo(0.3); // 1M input × default 0.30
    expect(await router.spentThisMonth("gemini")).toBeCloseTo(0.3);
  });

  test("discarded outputs can exhaust the budget", async () => {
    await LawSetting.update({ aiBudgetGeminiUsd: 0.25 });
    fake(() => {
      throw Object.assign(new ProviderError("empty"), { usage: { tokensIn: 1_000_000, tokensOut: 0 } });
    });
    await expect(router.generate({ purpose: "ocr", prompt, parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
    await expect(router.generate({ purpose: "ocr", prompt, parts: [{ text: "x" }] })).rejects.toBeInstanceOf(BudgetError);
  });

  test("failures without usage still log, with zero cost", async () => {
    fake(() => {
      throw new ProviderError("network");
    });
    await expect(router.generate({ purpose: "ocr", prompt, parts: [{ text: "x" }] })).rejects.toBeInstanceOf(ProviderError);
    const row = await db().lawAiCall.findFirst();
    expect(row.status).toBe("error");
    expect(row.estimatedCostUsd || 0).toBe(0);
  });
});

describe("single retry for rate limits and 5xx on ocr / transcription", () => {
  test("429 then success: one retry, waits Retry-After, both attempts logged", async () => {
    const sleeps = [];
    let n = 0;
    fake((p, r) => {
      if (++n === 1) throw httpError(429, { retryAfterMs: 4000 });
      return okOut(r);
    });
    const out = await router.generate(
      { purpose: "transcription", prompt, parts: [media] },
      { sleep: async (ms) => sleeps.push(ms) }
    );
    expect(out.provider).toBe("gemini");
    expect(n).toBe(2);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(4000);
    expect(sleeps[0]).toBeLessThanOrEqual(30000);
    expect(await db().lawAiCall.count()).toBe(2);
  });

  test("503 without Retry-After uses a jittered delay between 2s and 5s", async () => {
    const sleeps = [];
    let n = 0;
    fake((p, r) => {
      if (++n === 1) throw httpError(503);
      return okOut(r);
    });
    await router.generate({ purpose: "ocr", prompt, parts: [media] }, { sleep: async (ms) => sleeps.push(ms) });
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
    expect(sleeps[0]).toBeLessThanOrEqual(5000);
  });

  test("a huge Retry-After is capped at 30s", async () => {
    const sleeps = [];
    let n = 0;
    fake((p, r) => {
      if (++n === 1) throw httpError(429, { retryAfterMs: 600000 });
      return okOut(r);
    });
    await router.generate({ purpose: "ocr", prompt, parts: [media] }, { sleep: async (ms) => sleeps.push(ms) });
    expect(sleeps).toEqual([30000]);
  });

  test("only one retry: a second failure propagates", async () => {
    let n = 0;
    fake(() => {
      n++;
      throw httpError(500);
    });
    await expect(
      router.generate({ purpose: "transcription", prompt, parts: [media] }, { sleep: async () => {} })
    ).rejects.toBeInstanceOf(ProviderError);
    expect(n).toBe(2);
  });

  test.each([
    ["400 permanent", () => new PermanentError("bad request")],
    ["timeout / network (status 0)", () => new ProviderError("timed out after 300s")],
    ["truncation (status 0)", () => new ProviderError("gemini output truncated (MAX_TOKENS)")],
  ])("%s is not retried", async (_n, make) => {
    let n = 0;
    fake(() => {
      n++;
      throw make();
    });
    await expect(
      router.generate({ purpose: "ocr", prompt, parts: [media] }, { sleep: async () => {} })
    ).rejects.toBeTruthy();
    expect(n).toBe(1);
  });

  test("purposes with a fallback go to the fallback instead of retrying", async () => {
    const seen = [];
    fake((p, r) => {
      seen.push(p);
      if (p === "gemini") throw httpError(429);
      return okOut(r);
    });
    const out = await router.generate({ purpose: "segmentation", prompt, parts: [{ text: "x" }] }, { sleep: async () => {} });
    expect(out.provider).toBe("deepseek");
    expect(seen).toEqual(["gemini", "deepseek"]);
  });

  test("the budget is re-checked before the retry", async () => {
    await LawSetting.update({ aiBudgetGeminiUsd: 0.25 });
    let n = 0;
    fake(() => {
      n++;
      throw Object.assign(httpError(429), { usage: { tokensIn: 1_000_000, tokensOut: 0 } });
    });
    await expect(
      router.generate({ purpose: "ocr", prompt, parts: [media] }, { sleep: async () => {} })
    ).rejects.toBeInstanceOf(BudgetError);
    expect(n).toBe(1);
  });
});
