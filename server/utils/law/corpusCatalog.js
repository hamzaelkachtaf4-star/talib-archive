// The Library's catalog (server/data/law/corpus/catalog.json): 137 Moroccan legal texts across the 7 authentic
// constitutional hierarchy tiers (Kelsen's pyramid for Morocco).
// The catalog holds certified references, titles, numbers, Dahirs, and BO citations audited against official sources.
// Statute article text and full-text index enter through ingestion from official government portals.
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "../../data/law/corpus/catalog.json");
const TOP_FILE = path.resolve(__dirname, "../../data/law/corpus/top40.json");

/** The curated "texts to know first" list (slugs, in reading order). */
function topSlugs() {
  try {
    return JSON.parse(fs.readFileSync(TOP_FILE, "utf8")).slugs || [];
  } catch {
    return [];
  }
}

const LEVEL_IDS = Object.freeze([
  "constitution",
  "treaties",
  "organic-laws",
  "framework-laws",
  "ordinary-laws-codes",
  "decrees",
  "orders-regulatory-decisions",
]);

// CATEGORY_IDS alias for backward compatibility
const CATEGORY_IDS = LEVEL_IDS;

const FORBIDDEN_KEYS = ["text", "articles", "body", "content", "sourceUrl", "sha256"];

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,60}$/;

const normLevelFor = (levelSlug) => {
  if (levelSlug === "constitution") return "CONSTITUTION";
  if (levelSlug === "treaties") return "TREATY";
  if (levelSlug === "organic-laws") return "ORGANIC";
  if (levelSlug === "framework-laws") return "FRAMEWORK";
  if (levelSlug === "decrees") return "DECREE";
  if (levelSlug === "orders-regulatory-decisions") return "ORDER";
  return "ORDINARY";
};

/**
 * Traverses levels and groups to extract flat catalog entries.
 */
function extractFlatEntries(levels, onEntry, nonBinding = null) {
  const flat = [];
  levels.forEach((l) => {
    const levelSlug = l.slug || l.id;
    const processItems = (items, groupSlug = null) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (onEntry) onEntry(item, levelSlug, groupSlug);
        flat.push({
          ...item,
          levelSlug,
          groupSlug,
          normLevel: item.normLevel || normLevelFor(levelSlug),
          titleAr: item.title?.ar || item.titleAr,
          titleFr: item.title?.fr || item.titleFr,
          titleEn: item.title?.en || item.titleEn,
        });
      }
    };
    if (Array.isArray(l.items)) processItems(l.items);
    if (Array.isArray(l.entries)) processItems(l.entries);
    if (Array.isArray(l.groups)) {
      for (const g of l.groups) {
        processItems(g.items || g.entries, g.slug || g.id);
      }
    }
  });

  if (nonBinding && Array.isArray(nonBinding.items)) {
    for (const item of nonBinding.items) {
      if (onEntry) onEntry(item, "non-binding-references", null);
      flat.push({
        ...item,
        levelSlug: "non-binding-references",
        groupSlug: null,
        normLevel: "INTERNATIONAL_REFERENCE",
        titleAr: item.title?.ar || item.titleAr,
        titleFr: item.title?.fr || item.titleFr,
        titleEn: item.title?.en || item.titleEn,
      });
    }
  }

  return flat;
}

/**
 * Validates the 7-level Moroccan legal hierarchy catalog.
 */
function validate(c, file = "catalog") {
  const bad = (m) => {
    throw new Error(`${file}: ${m}`);
  };
  if (!c || typeof c !== "object") bad("not an object");

  const levels = Array.isArray(c.levels) ? c.levels : c.categories;
  if (!Array.isArray(levels) || levels.length !== 7) {
    bad(`exactly the 7 hierarchy levels are required (${LEVEL_IDS.join(", ")})`);
  }

  LEVEL_IDS.forEach((id, i) => {
    const l = levels[i];
    const levelSlug = l.slug || l.id;
    if (levelSlug !== id) bad(`level ${i + 1} must have slug '${id}', got '${levelSlug}'`);
    const titleAr = l.title?.ar || l.titleAr;
    const titleFr = l.title?.fr || l.titleFr;
    const titleEn = l.title?.en || l.titleEn;
    if (!titleAr || !titleFr || !titleEn) {
      bad(`level ${id} must have titles in ar, fr, en`);
    }
  });

  const seenSlugs = new Set();
  const keysMap = new Map(); // case-insensitive check across slugs and dbSlugs
  const replacementsToCheck = [];

  const flat = extractFlatEntries(levels, (item, levelSlug) => {
    if (!item || typeof item !== "object") bad("entry is not an object");
    for (const k of FORBIDDEN_KEYS) {
      if (k in item) bad(`${item.slug}: '${k}' must not be in catalog`);
    }
    if (typeof item.slug !== "string" || !SLUG_RE.test(item.slug)) {
      bad(`invalid slug '${item.slug}'`);
    }
    if (seenSlugs.has(item.slug)) {
      bad(`duplicate slug '${item.slug}'`);
    }
    seenSlugs.add(item.slug);

    for (const k of [item.slug, item.dbSlug].filter(Boolean)) {
      const low = k.toLowerCase();
      const owner = keysMap.get(low);
      if (owner && owner !== item.slug) {
        bad(`key '${k}' collides with entry '${owner}'`);
      }
      keysMap.set(low, item.slug);
    }

    if (item.replaced_by) {
      replacementsToCheck.push({ from: item.slug, to: item.replaced_by, fromDb: item.dbSlug });
    }

    const titleAr = item.title?.ar || item.titleAr;
    const titleFr = item.title?.fr || item.titleFr;
    if (!titleAr || !titleFr) {
      bad(`${item.slug}: titles in Arabic and French are required`);
    }
  }, c.non_binding_references);

  if (flat.length === 0) bad("no entries found across levels");

  for (const rep of replacementsToCheck) {
    if (!seenSlugs.has(rep.to)) {
      bad(`entry '${rep.from}' has replaced_by pointing to non-existent slug '${rep.to}'`);
    }
    const target = flat.find((e) => e.slug === rep.to);
    if (rep.fromDb && target?.dbSlug && rep.fromDb === target.dbSlug) {
      bad(`repealed text '${rep.from}' cannot share dbSlug '${rep.fromDb}' with its replacement '${rep.to}'`);
    }
  }

  return c;
}

let cache = null;
function load() {
  if (!cache) {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    validate(raw, "catalog.json");

    const levels = Array.isArray(raw.levels) ? raw.levels : raw.categories;
    const flat = extractFlatEntries(levels, null, raw.non_binding_references);

    cache = {
      ...raw,
      lastAudit: raw.last_audit || "2026-10-14",
      levels,
      categories: levels,
      entries: flat,
      nonBindingReferences: raw.non_binding_references || null,
    };
  }
  return cache;
}

const reset = () => {
  cache = null;
};

/**
 * Find entry by catalog slug or dbSlug (case-insensitive fallback).
 */
const entry = (slug) => {
  if (!slug) return null;
  const c = load();
  const lower = String(slug).toLowerCase();
  return (
    c.entries.find(
      (e) =>
        e.slug === slug ||
        e.dbSlug === slug ||
        (e.slug && e.slug.toLowerCase() === lower) ||
        (e.dbSlug && e.dbSlug.toLowerCase() === lower)
    ) || null
  );
};

/**
 * Fallback category for a code in DB by norm level.
 */
const categoryFor = (normLevel) => {
  const norm = String(normLevel || "").toUpperCase();
  if (norm === "CONSTITUTION") return "constitution";
  if (norm === "TREATY" || norm === "INTERNATIONAL" || norm === "INTERNATIONAL_REFERENCE") return "treaties";
  if (norm === "ORGANIC") return "organic-laws";
  if (norm === "FRAMEWORK") return "framework-laws";
  if (norm === "DECREE") return "decrees";
  if (norm === "ORDER" || norm === "ARRETE") return "orders-regulatory-decisions";
  if (norm === "REGULATORY") return "decrees";
  return "ordinary-laws-codes";
};

/**
 * Computes legal status cleanly separated from ingestion availability.
 */
function computeStatus(item, today = new Date().toISOString().slice(0, 10)) {
  if (["repealed", "reference", "validated_pending_publication"].includes(item.status)) {
    return item.status;
  }
  if (item.in_force_from && item.in_force_from > today) {
    return "in_force_pending";
  }
  return item.status || "in_force";
}

/**
 * Builds the 7-level Moroccan legal hierarchy with full metadata,
 * joining ingested codes (article count, reviewed state, and provenance).
 * When `includeAll` is false, entries list only texts that were ingested.
 */
function build(codes = [], provenance = new Map(), { includeAll = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const cat = load();
  const bySlug = new Map(codes.map((c) => [c.slug, c]));
  const bySlugLower = new Map(codes.map((c) => [c.slug.toLowerCase(), c]));
  const catalogBySlug = new Map(cat.entries.map((e) => [e.slug, e]));
  const top = topSlugs();

  const findCode = (item) => {
    if (item.dbSlug && bySlug.has(item.dbSlug)) return bySlug.get(item.dbSlug);
    if (bySlug.has(item.slug)) return bySlug.get(item.slug);
    const lower = item.slug.toLowerCase();
    if (bySlugLower.has(lower)) return bySlugLower.get(lower);
    if (item.dbSlug && bySlugLower.has(item.dbSlug.toLowerCase())) {
      return bySlugLower.get(item.dbSlug.toLowerCase());
    }
    return null;
  };

  const transform = (item) => {
    const code = findCode(item);
    const p = code ? provenance.get(code.slug) : null;
    const count = code?.articleCount || 0;
    const status = computeStatus(item, today);

    let replacedByTitle = null;
    if (item.replaced_by) {
      const target = catalogBySlug.get(item.replaced_by);
      if (target) replacedByTitle = target.titleAr || target.title?.ar || null;
    }

    return {
      slug: code?.slug || item.slug,
      catalogSlug: item.slug,
      topRank: top.indexOf(item.slug), // -1 = not in the top-40 list
      dbSlug: item.dbSlug || null,
      ref: item.ref || null,
      dahir: item.dahir || null,
      date: item.date || null,
      bo: item.bo || null,
      titleAr: code?.titleAr || item.title?.ar || item.titleAr,
      titleFr: code?.titleFr || item.title?.fr || item.titleFr,
      titleEn: item.title?.en || item.titleEn || null,
      normLevel: item.normLevel || normLevelFor(item.levelSlug),
      status,
      originalStatus: item.status || null,
      verify: !!item.verify,
      watch: !!item.watch,
      note: item.note || null,
      implements: item.implements || null,
      verifiedSource: item.verified_source || null,
      amendedBy: item.amended_by || null,
      replacedBy: item.replaced_by || null,
      replacedByTitle,
      inForceFrom: item.in_force_from || null,
      articleCount: count,
      reviewed: code ? !!code.reviewed : false,
      sourceUrl: p?.sourceUrl || null,
      consolidatedAsOf: p?.consolidatedAsOf || null,
      sha256: p?.sha256 || null,
    };
  };

  const out = cat.levels.map((l) => {
    const id = l.slug || l.id;
    const titleAr = l.title?.ar || l.titleAr;
    const titleFr = l.title?.fr || l.titleFr;
    const titleEn = l.title?.en || l.titleEn;

    let entries = [];
    let groups = null;

    if (Array.isArray(l.groups) && l.groups.length > 0) {
      groups = l.groups.map((g) => {
        const transformedItems = (g.items || g.entries || []).map(transform);
        const filteredItems = includeAll ? transformedItems : transformedItems.filter((i) => i.articleCount > 0);
        entries.push(...filteredItems);
        return {
          id: g.slug || g.id,
          slug: g.slug || g.id,
          titleAr: g.title?.ar || g.titleAr,
          titleFr: g.title?.fr || g.titleFr,
          titleEn: g.title?.en || g.titleEn,
          entries: filteredItems,
          totalCatalogCount: transformedItems.length,
        };
      });
    } else {
      const transformedItems = (l.items || l.entries || []).map(transform);
      entries = includeAll ? transformedItems : transformedItems.filter((i) => i.articleCount > 0);
    }

    return {
      id,
      rank: l.rank,
      slug: id,
      titleAr,
      titleFr,
      titleEn,
      note: l.note || null,
      explainer: l.explainer || null,
      howToFind: l.how_to_find || null,
      groups,
      entries,
    };
  });

  const byId = new Map(out.map((k) => [k.id, k]));
  const seenCatalogSlugs = new Set(cat.entries.map((e) => e.slug));
  const seenDbSlugs = new Set(cat.entries.filter((e) => e.dbSlug).map((e) => e.dbSlug));

  for (const c of codes) {
    if (!seenCatalogSlugs.has(c.slug) && !seenDbSlugs.has(c.slug) && c.articleCount > 0) {
      const targetCatId = categoryFor(c.normLevel);
      const targetLevel = byId.get(targetCatId) || out[4];
      const p = provenance.get(c.slug);
      targetLevel.entries.push({
        slug: c.slug,
        catalogSlug: c.slug,
        dbSlug: c.slug,
        ref: null,
        dahir: null,
        date: null,
        bo: null,
        titleAr: c.titleAr,
        titleFr: c.titleFr,
        titleEn: c.titleFr,
        normLevel: c.normLevel,
        status: c.status || "in_force",
        originalStatus: c.status || "in_force",
        verify: false,
        watch: false,
        note: null,
        articleCount: c.articleCount,
        reviewed: !!c.reviewed,
        sourceUrl: p?.sourceUrl || null,
        consolidatedAsOf: p?.consolidatedAsOf || null,
        sha256: p?.sha256 || null,
      });
    }
  }

  return out;
}

module.exports = {
  topSlugs,
  LEVEL_IDS,
  CATEGORY_IDS,
  FILE,
  validate,
  load,
  reset,
  entry,
  build,
  categoryFor,
  computeStatus,
};
