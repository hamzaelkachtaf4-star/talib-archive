// Closed vocabulary shared with the server (server/models/lawPreferences.js: a test keeps both lists identical). All art is original.
// Moroccan legal attire is drawn as colour and shape only: no national emblem, no court coat of arms.
export const OPTIONS = {
  skinTone: ["#f1c9a5", "#e0a97f", "#c68642", "#8d5524", "#5c3a21"],
  face: ["oval", "round", "square"],
  expression: ["calm", "smile", "serious", "focused"],
  hair: ["short", "long", "curly", "none"],
  headwear: ["none", "tarboosh", "cap", "hijab", "rezza"],
  outfit: ["casual", "robe", "suit", "judge", "lawyer", "adoul", "professor", "student"],
  accessory: ["none", "glasses", "book", "gavel", "scales", "scroll"],
  eyes: ["round", "almond", "narrow"],
  brows: ["natural", "thick", "arched", "thin"],
  facialHair: ["none", "moustache", "beard", "goatee"],
  bg: ["#0b5d3b", "#b48a2c", "#1ca7ec", "#d7263d", "#5d6673"],
};
// Fields the stored config may carry that are not drawn options (kept for older profiles).
export const FREE_KEYS = ["base"];
export const DEFAULT_AVATAR = { base: "a", skinTone: "#e0a97f", face: "oval", expression: "calm", hair: "short", headwear: "none", outfit: "casual", accessory: "none", eyes: "round", brows: "natural", facialHair: "none", bg: "#0b5d3b" };

/** The five Moroccan legal sets (بذلة القاضي، روب المحاماة، عدل/موثق، أستاذ جامعي، طالب حقوق). */
export const LEGAL_SETS = [
  { id: "judge", config: { outfit: "judge", headwear: "none", accessory: "gavel", expression: "serious", bg: "#0b5d3b" } },
  { id: "lawyer", config: { outfit: "lawyer", headwear: "none", accessory: "scales", expression: "focused", bg: "#5d6673" } },
  { id: "adoul", config: { outfit: "adoul", headwear: "rezza", accessory: "scroll", expression: "calm", bg: "#b48a2c" } },
  { id: "professor", config: { outfit: "professor", headwear: "none", accessory: "book", expression: "smile", bg: "#1ca7ec" } },
  { id: "student", config: { outfit: "student", headwear: "none", accessory: "book", expression: "smile", bg: "#0b5d3b" } },
];

export const PRESETS = [
  { ...DEFAULT_AVATAR, headwear: "tarboosh", outfit: "robe" },
  { ...DEFAULT_AVATAR, skinTone: "#f1c9a5", hair: "long", outfit: "suit", accessory: "glasses", bg: "#1ca7ec" },
  { ...DEFAULT_AVATAR, skinTone: "#c68642", hair: "curly", accessory: "book", bg: "#b48a2c" },
  { ...DEFAULT_AVATAR, skinTone: "#8d5524", hair: "none", outfit: "suit", accessory: "gavel", bg: "#5d6673" },
  { ...DEFAULT_AVATAR, skinTone: "#f1c9a5", headwear: "hijab", outfit: "casual", bg: "#d7263d" },
  { ...DEFAULT_AVATAR, skinTone: "#5c3a21", hair: "curly", headwear: "cap", bg: "#0b5d3b" },
  { ...DEFAULT_AVATAR, skinTone: "#e0a97f", hair: "long", headwear: "hijab", outfit: "robe", accessory: "book", bg: "#b48a2c" },
  { ...DEFAULT_AVATAR, skinTone: "#c68642", outfit: "robe", headwear: "tarboosh", accessory: "gavel", bg: "#1ca7ec" },
];

/** Category tabs of the studio: which option keys each one edits. */
export const CATEGORIES = [
  { id: "sets", keys: [] },
  { id: "face", keys: ["skinTone", "face", "expression"] },
  { id: "eyes", keys: ["eyes", "brows"] },
  { id: "hair", keys: ["hair", "headwear", "facialHair"] },
  { id: "outfit", keys: ["outfit"] },
  { id: "accessory", keys: ["accessory"] },
  { id: "bg", keys: ["bg"] },
];

/** True when `config` only uses values of the closed vocabulary (unknown keys or values are refused). */
export function isValidAvatar(config) {
  if (config === null) return true;
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  return Object.entries(config).every(([k, v]) => (Object.hasOwn(OPTIONS, k) ? OPTIONS[k].includes(v) : FREE_KEYS.includes(k) && typeof v === "string" && /^[A-Za-z0-9_#-]{1,24}$/.test(v)));
}

/** A drawable config from anything stored: every option outside the vocabulary falls back to its default, so old or damaged data never breaks the art. */
export function sanitizeAvatar(config) {
  const src = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const out = { ...DEFAULT_AVATAR };
  for (const [k, list] of Object.entries(OPTIONS)) if (Object.hasOwn(src, k) && list.includes(src[k])) out[k] = src[k];
  if (typeof src.base === "string" && /^[A-Za-z0-9_#-]{1,24}$/.test(src.base)) out.base = src.base; // an older profile's base id survives a re-save
  return out;
}

/** A random valid config. `rng` returns [0,1) (injected so tests are deterministic). */
export function randomAvatar(rng = Math.random) {
  const out = { ...DEFAULT_AVATAR };
  for (const [k, list] of Object.entries(OPTIONS)) out[k] = list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  return out;
}

export const applySet = (config, id) => ({ ...sanitizeAvatar(config), ...(LEGAL_SETS.find((s) => s.id === id)?.config || {}) });
