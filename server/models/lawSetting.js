const { db } = require("../utils/law/dbClient");
const { currentUserId, isAdmin } = require("../utils/law/tenant");

// User-editable LAW-OS settings (spec §5.7). Values are JSON. Keys outside DEFAULTS are rejected
// so the settings screen cannot grow arbitrary rows. Env vars hold secrets/models; these hold preferences.
const DEFAULTS = {
  examLockdownDays: () => Number(process.env.EXAM_LOCKDOWN_DAYS) || 10,
  newCardsPerDay: () => Number(process.env.NEW_CARDS_PER_DAY) || 15,
  dailyGoalMinutes: () => 20,
  desiredRetention: () => 0.9,
  weeklyTargetMinutes: () => 140,
  // Monthly AI budgets (USD). Defaults come from env; 0 means "no spend allowed" (jobs pause visibly).
  aiBudgetGeminiUsd: () =>
    Number(process.env.AI_MONTHLY_BUDGET_USD_GEMINI) || 0,
  aiBudgetDeepseekUsd: () =>
    Number(process.env.AI_MONTHLY_BUDGET_USD_DEEPSEEK) || 0,
  // Per-purpose provider override, e.g. { "segmentation": "deepseek" } (spec §7.1: swappable rows).
  aiRouting: () => ({}),
  // Qanouni: whether new students may create accounts (email or Google).
  registrationOpen: () => process.env.QANOUNI_REGISTRATION_OPEN !== "false",
  // Fair-use quota: legal-chat turns per student per local day (admin-editable, per-student override on the profile).
  // Phase 10: classifier/drill-generation calls the Brain may make per day, all students together (they don't use the student quota).
  aiBrainDailyBudget: () => 300,
  aiDailyLimit: () => { const n = Number(process.env.AI_DAILY_LIMIT_DEFAULT); return process.env.AI_DAILY_LIMIT_DEFAULT !== undefined && Number.isInteger(n) && n >= 0 ? n : 25; },
};

// Admin-owned, shared by every user. Everything else is a per-user study preference, stored as
// "u:<userId>:<key>" (docs/plans/qanouni.md §3). Students never see or change the global keys.
const GLOBAL = new Set([
  "aiBudgetGeminiUsd",
  "aiBudgetDeepseekUsd",
  "aiRouting",
  "registrationOpen",
  "aiDailyLimit",
  "aiBrainDailyBudget",
]);

function storageKey(key) {
  return GLOBAL.has(key) ? key : `u:${currentUserId()}:${key}`;
}

const PROVIDERS = ["gemini", "deepseek"];

const VALIDATORS = {
  examLockdownDays: (v) => Number.isInteger(v) && v >= 0 && v <= 60,
  newCardsPerDay: (v) => Number.isInteger(v) && v >= 0 && v <= 200,
  dailyGoalMinutes: (v) => Number.isInteger(v) && v >= 1 && v <= 600,
  desiredRetention: (v) => typeof v === "number" && v >= 0.7 && v <= 0.99,
  weeklyTargetMinutes: (v) => Number.isInteger(v) && v >= 0 && v <= 5000,
  aiBudgetGeminiUsd: (v) => typeof v === "number" && v >= 0 && v <= 1000,
  aiBudgetDeepseekUsd: (v) => typeof v === "number" && v >= 0 && v <= 1000,
  aiRouting: (v) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.entries(v).every(
      ([k, p]) => /^[a-z_]{2,40}$/.test(k) && PROVIDERS.includes(p)
    ),
  registrationOpen: (v) => typeof v === "boolean",
  aiDailyLimit: (v) => Number.isInteger(v) && v >= 0 && v <= 1000,
  aiBrainDailyBudget: (v) => Number.isInteger(v) && v >= 0 && v <= 5000,
};

const LawSetting = {
  keys: Object.keys(DEFAULTS),

  GLOBAL,

  /** The context user's preferences, plus the global keys for admins only. */
  all: async function () {
    const keys = this.keys.filter((k) => !GLOBAL.has(k) || isAdmin());
    const rows = await db().lawSetting.findMany({
      where: { key: { in: keys.map(storageKey) } },
    });
    const stored = Object.fromEntries(
      rows.map((r) => [r.key, safeParse(r.value)])
    );
    const out = {};
    for (const key of keys)
      out[key] = stored[storageKey(key)] ?? DEFAULTS[key]();
    return out;
  },

  get: async function (key) {
    if (!DEFAULTS[key]) return null;
    const row = await db().lawSetting.findUnique({
      where: { key: storageKey(key) },
    });
    return row ? safeParse(row.value) ?? DEFAULTS[key]() : DEFAULTS[key]();
  },

  /**
   * @param {Object<string, any>} updates
   * @returns {Promise<{settings: Object|null, error: string|null}>}
   */
  update: async function (updates = {}) {
    const entries = Object.entries(updates);
    for (const [key, value] of entries) {
      if (!VALIDATORS[key])
        return { settings: null, error: `Unknown setting: ${key}` };
      if (!VALIDATORS[key](value))
        return { settings: null, error: `Invalid value for ${key}` };
      if (GLOBAL.has(key) && !isAdmin())
        return { settings: null, error: "forbidden" };
    }
    await db().$transaction(
      entries.map(([name, value]) => {
        const key = storageKey(name);
        return db().lawSetting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        });
      })
    );
    return { settings: await this.all(), error: null };
  },

  // Internal bookkeeping, stored as "meta:<key>". Never exposed by all()/update(). getMeta/setMeta are
  // global (scheduler, radar); getUserMeta/setUserMeta belong to the context user (e.g. "timetableSeeded").
  getMeta: async function (key) {
    const row = await db().lawSetting.findUnique({
      where: { key: `meta:${key}` },
    });
    return row ? safeParse(row.value) : null;
  },

  getUserMeta: async function (key) {
    return this.getMeta(`u:${currentUserId()}:${key}`);
  },

  setUserMeta: async function (key, value) {
    return this.setMeta(`u:${currentUserId()}:${key}`, value);
  },

  setMeta: async function (key, value) {
    const k = `meta:${key}`;
    await db().lawSetting.upsert({
      where: { key: k },
      create: { key: k, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  },
};

function safeParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

module.exports = { LawSetting };
