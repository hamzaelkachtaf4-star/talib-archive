// Legislative radar scanner (spec §6.5). Listing pages only; new items become LawSourceDocument rows
// with parseStatus "new" and show up in the Inbox. NOTHING enters the corpus here: the student imports a
// document into a review session (Phase 3) or dismisses it.
const crypto = require("crypto");
const cheerio = require("cheerio");
const { db } = require("../dbClient");
const { politeFetch } = require("./politeFetch");
const { LawSetting } = require("../../../models/lawSetting");
const { lawConfig } = require("../config");

const MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_CONFIG = require("./sources.json");

let configOverride = null; // test seam
function setRadarConfig(cfg) {
  configOverride = cfg;
}
function radarConfig() {
  return configOverride || DEFAULT_CONFIG;
}

function decodeTitle(href, text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t && !/^(إقرأ الآن|اقرأ الآن|تحميل|télécharger|download)$/i.test(t))
    return t.slice(0, 300);
  try {
    return decodeURIComponent(
      href
        .split("/")
        .pop()
        .split("#")[0]
        .replace(/\.pdf$/i, "")
    )
      .replace(/[_-]+/g, " ")
      .slice(0, 300);
  } catch {
    return href.slice(-120);
  }
}

/** Absolute, fragment-free links matching the source pattern, deduplicated, with a title. */
function extractItems(html, source, ignorePatterns = []) {
  const $ = cheerio.load(html);
  const pattern = new RegExp(source.linkPattern, "i");
  const seen = new Map();
  $(source.linkSelector || "a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw) return;
    let url;
    try {
      url = new URL(raw, source.url);
    } catch {
      return;
    }
    url.hash = "";
    const href = url.toString();
    if (!pattern.test(decodeURIComponent(url.pathname)) && !pattern.test(href))
      return;
    const title = decodeTitle(href, $(el).text() || $(el).attr("title"));
    if (
      ignorePatterns.some((p) => title.toLowerCase().includes(p.toLowerCase()))
    )
      return;
    if (!seen.has(href)) seen.set(href, { url: href, title });
  });
  return [...seen.values()];
}

async function sourceState(id) {
  return (
    (await LawSetting.getMeta(`radar:${id}`)) || {
      failures: 0,
      disabled: false,
    }
  );
}

/**
 * Scan every enabled source once. Errors abort that source; after 3 consecutive failures the source is
 * disabled until the student re-enables it (spec §6.5 "stop on repeated errors").
 * @returns {Promise<{source:string, status:string, newItems?:number, error?:string}[]>}
 */
async function scanAll({ minIntervalMs } = {}) {
  const cfg = radarConfig();
  const interval =
    minIntervalMs ?? lawConfig().scraper.minIntervalSeconds * 1000;
  const report = [];
  for (const source of cfg.sources) {
    if (!source.enabled) {
      report.push({ source: source.id, status: "disabled_in_config" });
      continue;
    }
    const state = await sourceState(source.id);
    if (state.disabled) {
      report.push({ source: source.id, status: "disabled_after_errors" });
      continue;
    }
    try {
      const res = await politeFetch(source.url, {
        minIntervalMs: interval,
        etag: state.etag,
        lastModified: state.lastModified,
      });
      if (res.status === 304) {
        await LawSetting.setMeta(`radar:${source.id}`, {
          ...state,
          failures: 0,
          lastScanAt: new Date().toISOString(),
        });
        report.push({ source: source.id, status: "not_modified", newItems: 0 });
        continue;
      }
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      const hash = crypto.createHash("sha256").update(res.body).digest("hex");
      let newItems = 0;
      if (hash !== state.hash) {
        for (const item of extractItems(res.body, source, cfg.ignorePatterns)) {
          if (
            await db().lawSourceDocument.findFirst({ where: { url: item.url } })
          )
            continue;
          await db().lawSourceDocument.create({
            data: {
              origin: source.origin,
              url: item.url,
              title: item.title,
              parseStatus: "new",
              parseNotes: source.label,
            },
          });
          newItems++;
        }
      }
      await LawSetting.setMeta(`radar:${source.id}`, {
        failures: 0,
        disabled: false,
        hash,
        etag: res.etag,
        lastModified: res.lastModified,
        lastScanAt: new Date().toISOString(),
      });
      report.push({
        source: source.id,
        status: hash === state.hash ? "unchanged" : "scanned",
        newItems,
      });
    } catch (e) {
      const failures = (state.failures || 0) + 1;
      const disabled = failures >= MAX_CONSECUTIVE_FAILURES;
      await LawSetting.setMeta(`radar:${source.id}`, {
        ...state,
        failures,
        disabled,
        lastError: String(e.message).slice(0, 300),
        lastErrorAt: new Date().toISOString(),
      });
      report.push({
        source: source.id,
        status: disabled ? "disabled_after_errors" : "error",
        error: e.message,
      });
    }
  }
  return report;
}

async function sourcesStatus() {
  const cfg = radarConfig();
  const out = [];
  for (const s of cfg.sources)
    out.push({ ...s, state: await sourceState(s.id) });
  return out;
}

async function reenableSource(id) {
  const state = await sourceState(id);
  await LawSetting.setMeta(`radar:${id}`, {
    ...state,
    failures: 0,
    disabled: false,
  });
}

module.exports = {
  scanAll,
  extractItems,
  sourcesStatus,
  reenableSource,
  setRadarConfig,
  radarConfig,
  MAX_CONSECUTIVE_FAILURES,
};
