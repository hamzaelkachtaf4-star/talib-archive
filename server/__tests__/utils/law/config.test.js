const { lawConfig, publicLawConfig } = require("../../../utils/law/config");

const ORIGINAL_ENV = process.env;
const LAW_VARS = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL_MULTIMODAL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL_REASONING",
  "EXAM_LOCKDOWN_DAYS",
  "SCRAPER_MIN_INTERVAL_SECONDS",
  "LAWOS_HIDE_UPSTREAM",
];

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const v of LAW_VARS) delete process.env[v];
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("lawConfig", () => {
  test("boots with AI disabled when no keys are configured", () => {
    const cfg = lawConfig();
    expect(cfg.ai.geminiEnabled).toBe(false);
    expect(cfg.ai.deepseekEnabled).toBe(false);
    expect(cfg.examLockdownDays).toBe(10);
    expect(cfg.newCardsPerDay).toBe(15);
    expect(cfg.hideUpstream).toBe(true);
  });

  test("enables a provider only when key and model are both present", () => {
    process.env.GEMINI_API_KEY = "k";
    expect(lawConfig().ai.geminiEnabled).toBe(false);
    process.env.GEMINI_MODEL_MULTIMODAL = "some-model";
    expect(lawConfig().ai.geminiEnabled).toBe(true);
  });

  test("deepseek needs key, base url and model", () => {
    process.env.DEEPSEEK_API_KEY = "k";
    process.env.DEEPSEEK_MODEL_REASONING = "m";
    expect(lawConfig().ai.deepseekEnabled).toBe(false);
    process.env.DEEPSEEK_BASE_URL = "https://example.invalid/v1";
    expect(lawConfig().ai.deepseekEnabled).toBe(true);
  });

  test("scraper interval can never go below 10 seconds", () => {
    process.env.SCRAPER_MIN_INTERVAL_SECONDS = "2";
    expect(lawConfig().scraper.minIntervalSeconds).toBe(10);
  });

  test("ignores non-numeric overrides", () => {
    process.env.EXAM_LOCKDOWN_DAYS = "soon";
    expect(lawConfig().examLockdownDays).toBe(10);
  });

  test("public config never exposes secrets", () => {
    process.env.GEMINI_API_KEY = "secret-gemini";
    process.env.DEEPSEEK_API_KEY = "secret-deepseek";
    const json = JSON.stringify(publicLawConfig());
    expect(json).not.toContain("secret-gemini");
    expect(json).not.toContain("secret-deepseek");
  });
});
