// Default module lists per semester / track / language, read from server/data/law/curricula/*.json.
// These are plumbing, not certified curricula: every entry is flagged `verified: false` until a human flips it, and the
// student sees a "default list, please check" badge on modules copied from it.
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../../data/law/curricula");
const SEMESTERS = new Set(["S1", "S2", "S3", "S4", "S5", "S6"]);
const TRACKS = new Set(["PRIVE", "PUBLIC"]);
const LANGS = new Set(["AR", "FR"]);
const MAX_MODULES = 30;

/** Validates one curriculum object; throws a readable error (a bad file must fail loudly at boot/test, not silently). */
function validate(c, file = "curriculum") {
  const bad = (m) => { throw new Error(`${file}: ${m}`); };
  if (!c || typeof c !== "object") bad("not an object");
  if (typeof c.key !== "string" || !/^[a-z0-9-]{3,40}$/.test(c.key)) bad("key must be a slug");
  if (!SEMESTERS.has(c.semester)) bad("semester");
  if (!TRACKS.has(c.track)) bad("track");
  if (!LANGS.has(c.language)) bad("language");
  if (c.facultyCodes != null && (!Array.isArray(c.facultyCodes) || c.facultyCodes.some((f) => typeof f !== "string"))) bad("facultyCodes");
  if (typeof c.verified !== "boolean") bad("verified must be explicit");
  if (typeof c.source !== "string" || !c.source.trim()) bad("source (who supplied the list) is required");
  if (!Array.isArray(c.modules) || c.modules.length > MAX_MODULES) bad("modules");
  const seen = new Set();
  for (const m of c.modules) {
    if (!m || typeof m.title !== "string" || !m.title.trim() || m.title.length > 120) bad("module title");
    if (seen.has(m.title.trim())) bad(`duplicate module ${m.title}`);
    seen.add(m.title.trim());
  }
  return c;
}

let cache = null;
function all() {
  if (cache) return cache;
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : [];
  const list = files.map((f) => validate(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")), f));
  const keys = new Set();
  for (const c of list) { if (keys.has(c.key)) throw new Error(`duplicate curriculum key ${c.key}`); keys.add(c.key); }
  cache = list;
  return cache;
}

/** The default list for a student's scope, or null. */
function find({ facultyCode, semester, track, language }) {
  return all().find((c) => c.semester === semester && c.track === track && c.language === language && (!c.facultyCodes || c.facultyCodes.includes(facultyCode))) || null;
}

const reset = () => { cache = null; };

module.exports = { all, find, validate, reset, DIR };
