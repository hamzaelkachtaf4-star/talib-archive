// Versioned prompt files (spec §7.3): utils/law/prompts/<id>.v<version>.md, Arabic body with an English
// HTML-comment header explaining intent. Never inline prompts in route handlers or jobs.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(__dirname, "prompts");
const cache = new Map();

/** @returns {{id:string, version:number, text:string, hash:string}} */
function loadPrompt(id, version = 1) {
  const key = `${id}.v${version}`;
  if (cache.has(key)) return cache.get(key);
  const raw = fs.readFileSync(path.join(DIR, `${key}.md`), "utf8");
  const text = raw.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
  if (!text) throw new Error(`prompt ${key} is empty`);
  const prompt = {
    id,
    version,
    text,
    hash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16),
  };
  cache.set(key, prompt);
  return prompt;
}

function listPrompts() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /\.v\d+\.md$/.test(f))
    .map((f) => {
      const [, id, v] = f.match(/^(.+)\.v(\d+)\.md$/);
      return { id, version: Number(v) };
    });
}

module.exports = { loadPrompt, listPrompts };
