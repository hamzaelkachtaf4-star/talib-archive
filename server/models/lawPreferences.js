// Phase 3: per-student preferences (synced across devices) and the public identity / privacy fields of
// LawUserProfile (handle, avatar, private account, discoverability). Validation is closed-vocabulary.
const { rawDb } = require("../utils/law/dbClient");

const THEMES = ["light", "dark", "system"];
const LOCALES = ["ar", "ary", "fr", "en"];
const GOALS = [15, 20, 30];
const HANDLE_RE = /^[a-z0-9_.]{3,20}$/;
// Closed vocabulary; frontend/src/components/LawOS/avatar/avatarConfig.js lists the same values (a test keeps both identical).
const AVATAR = {
  skinTone: ["#f1c9a5", "#e0a97f", "#c68642", "#8d5524", "#5c3a21"],
  hair: ["short", "long", "curly", "none"],
  bg: ["#0b5d3b", "#b48a2c", "#1ca7ec", "#d7263d", "#5d6673"],
  face: ["oval", "round", "square"],
  expression: ["calm", "smile", "serious", "focused"],
  headwear: ["none", "tarboosh", "cap", "hijab", "rezza"],
  outfit: ["casual", "robe", "suit", "judge", "lawyer", "adoul", "professor", "student"],
  accessory: ["none", "glasses", "book", "gavel", "scales", "scroll"],
  eyes: ["round", "almond", "narrow"],
  brows: ["natural", "thick", "arched", "thin"],
  facialHair: ["none", "moustache", "beard", "goatee"],
};
const AVATAR_FREE = ["base"]; // a short legacy id, validated by length/charset only
const FREE_RE = /^[A-Za-z0-9_#-]{1,24}$/;
const isBool = (v) => typeof v === "boolean";

function validatePrefs(b) {
  const out = {};
  if (b.theme !== undefined) { if (!THEMES.includes(b.theme)) return { error: "invalid_theme" }; out.theme = b.theme; }
  if (b.locale !== undefined) { if (!LOCALES.includes(b.locale)) return { error: "invalid_locale" }; out.locale = b.locale; }
  if (b.dailyGoalMin !== undefined) { if (!GOALS.includes(b.dailyGoalMin)) return { error: "invalid_goal" }; out.dailyGoalMin = b.dailyGoalMin; }
  for (const k of ["soundEnabled", "animationsOn", "notifyFriends", "notifyHub", "notifyForum", "notifyReminders", "memoryEnabled"])
    if (b[k] !== undefined) { if (!isBool(b[k])) return { error: `invalid_${k}` }; out[k] = b[k]; }
  if (b.reminderTime !== undefined) {
    if (b.reminderTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.reminderTime)) return { error: "invalid_reminder_time" };
    out.reminderTime = b.reminderTime;
  }
  return Object.keys(out).length ? { data: out } : { error: "nothing_to_update" };
}

function validateAvatar(a) {
  if (a === null) return { value: null };
  if (typeof a !== "object" || Array.isArray(a)) return { error: "invalid_avatar" };
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    if (Object.hasOwn(AVATAR, k)) { if (!AVATAR[k].includes(v)) return { error: "invalid_avatar" }; }
    else if (AVATAR_FREE.includes(k)) { if (typeof v !== "string" || !FREE_RE.test(v)) return { error: "invalid_avatar" }; }
    else return { error: "invalid_avatar" };
    out[k] = v;
  }
  return { value: out };
}

function shapeProfile(p) {
  let avatarConfig = null;
  try { avatarConfig = p.avatarConfig ? JSON.parse(p.avatarConfig) : null; } catch {}
  return { handle: p.handle, avatarConfig, isPrivate: p.isPrivate, discoverable: p.discoverable, onboardingCompletedAt: p.onboardingCompletedAt };
}

const LawPreferences = {
  THEMES, LOCALES, GOALS, AVATAR, AVATAR_FREE,
  validateAvatar: async (a) => validateAvatar(a),

  get: async function (userId) {
    const row = await rawDb().lawUserPreferences.findUnique({ where: { userId } });
    return row || { userId, theme: "system", locale: "ar", soundEnabled: true, animationsOn: true, notifyFriends: true, notifyHub: true, notifyForum: true, notifyReminders: true, reminderTime: null, dailyGoalMin: 20 };
  },

  update: async function (userId, body) {
    const v = validatePrefs(body || {});
    if (v.error) return { error: v.error };
    await rawDb().lawUserPreferences.upsert({ where: { userId }, create: { userId, ...v.data }, update: v.data });
    return { preferences: await this.get(userId), error: null };
  },

  getProfile: async function (userId) {
    const p = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    return p ? shapeProfile(p) : null;
  },

  updateProfile: async function (userId, body = {}) {
    const data = {};
    if (body.handle !== undefined) {
      if (body.handle === null) data.handle = null;
      else {
        const h = String(body.handle).toLowerCase();
        if (!HANDLE_RE.test(h)) return { error: "invalid_handle" };
        const taken = await rawDb().lawUserProfile.findUnique({ where: { handle: h } });
        if (taken && taken.userId !== userId) return { error: "handle_taken" };
        data.handle = h;
      }
    }
    if (body.avatarConfig !== undefined) {
      const a = validateAvatar(body.avatarConfig);
      if (a.error) return { error: a.error };
      data.avatarConfig = a.value === null ? null : JSON.stringify(a.value);
    }
    for (const k of ["isPrivate", "discoverable"])
      if (body[k] !== undefined) { if (!isBool(body[k])) return { error: `invalid_${k}` }; data[k] = body[k]; }
    if (!Object.keys(data).length) return { error: "nothing_to_update" };
    try {
      await rawDb().lawUserProfile.update({ where: { userId }, data });
    } catch (e) {
      if (e.code === "P2002") return { error: "handle_taken" }; // lost a race against another student
      if (e.code === "P2025") return { error: "not_found" };
      throw e;
    }
    return { profile: await this.getProfile(userId), error: null };
  },
};

module.exports = { LawPreferences };
