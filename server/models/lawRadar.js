// Reform Radar (spec §3.7, §5.4) and scraped-source review (spec §6.5).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { db } = require("../utils/law/dbClient");
const { normalizeCanonicalId } = require("../utils/law/arabic");
const { commitToStore, assetRelPath } = require("../utils/law/assets");
const { politeFetch } = require("../utils/law/radar/politeFetch");
const { lawConfig } = require("../utils/law/config");
const { LawCorpus } = require("./lawCorpus");
const { LawJob } = require("./lawJob");

const STATUSES = [
  "watch",
  "draft",
  "bill_in_parliament",
  "adopted",
  "published",
  "in_force",
];
const day = (d) => (d ? new Date(`${d}T00:00:00Z`) : null);

// Seed data per spec §3.7: facts as of October 2026, NOT hardcoded logic. Summaries stay unverified until
// the student confirms them against the official text.
const SEED = [
  {
    seedKey: "law-58.25",
    title: "القانون رقم 58.25 المتعلق بالمسطرة المدنية",
    status: "in_force",
    lawNumber: "58.25",
    inForceAt: day("2026-08-24"),
  },
  {
    seedKey: "law-03.23",
    title: "القانون رقم 03.23 بتغيير وتتميم قانون المسطرة الجنائية",
    status: "in_force",
    lawNumber: "03.23",
  },
  {
    seedKey: "law-43.22",
    title: "القانون رقم 43.22 المتعلق بالعقوبات البديلة",
    status: "in_force",
    lawNumber: "43.22",
  },
  {
    seedKey: "law-66.23",
    title: "القانون رقم 66.23 المتعلق بتنظيم مهنة المحاماة",
    status: "in_force",
    lawNumber: "66.23",
    summary: "الولوج إلى معهد تكوين المحامين يشترط شهادة الماستر.",
  },
  // No bill before Parliament: a watch item with no content until a bill text exists.
  {
    seedKey: "moudawana-reform",
    title: "مراجعة مدونة الأسرة",
    status: "watch",
  },
];

const parse = (v, f) => {
  try {
    return JSON.parse(v);
  } catch {
    return f;
  }
};
const present = (e) => ({
  ...e,
  affectedArticleIds: parse(e.affectedArticleIds, []),
  sourceDocumentIds: parse(e.sourceDocumentIds, []),
});

async function sanitize(input = {}, existing = null) {
  const data = {};
  if ("jurisdiction" in input && input.jurisdiction !== "MA")
    return { error: "only Moroccan reforms are tracked" };
  if ("title" in input || !existing) {
    if (typeof input.title !== "string" || !input.title.trim())
      return { error: "title is required" };
    data.title = input.title.trim();
  }
  if ("status" in input || !existing) {
    if (!STATUSES.includes(input.status)) return { error: "invalid status" };
    data.status = input.status;
  }
  for (const k of ["lawNumber", "boRef"])
    if (k in input) data[k] = input[k] || null;
  for (const k of ["publishedAt", "inForceAt"])
    if (k in input) {
      if (input[k] && isNaN(Date.parse(input[k])))
        return { error: `invalid ${k}` };
      data[k] = input[k] ? new Date(input[k]) : null;
    }
  if ("summary" in input) {
    data.summary = input.summary || null;
    data.summaryVerified = input.summaryVerified === true;
  } else if ("summaryVerified" in input)
    data.summaryVerified = input.summaryVerified === true;
  if ("affectedArticleIds" in input) {
    const ids = (input.affectedArticleIds || []).map(normalizeCanonicalId);
    if (ids.some((x) => !x)) return { error: "invalid article id" };
    const found = await db().lawArticle.count({
      where: { canonicalId: { in: ids } },
    });
    if (found !== ids.length)
      return { error: "affected articles must exist in the corpus" };
    data.affectedArticleIds = JSON.stringify(ids);
  }
  const status = data.status || existing?.status;
  const summary = "summary" in data ? data.summary : existing?.summary;
  const affected = data.affectedArticleIds
    ? JSON.parse(data.affectedArticleIds)
    : parse(existing?.affectedArticleIds, []);
  if (status === "watch" && (summary || affected.length))
    return { error: "a watch item has no content until a bill text exists" };
  return { data, error: null };
}

const LawRadar = {
  SEED,
  STATUSES,

  ensureSeeded: async function () {
    for (const s of SEED)
      if (
        !(await db().lawReformEvent.findUnique({
          where: { seedKey: s.seedKey },
        }))
      )
        await db().lawReformEvent.create({ data: s });
  },

  reforms: async function () {
    await this.ensureSeeded();
    const rows = await db().lawReformEvent.findMany({
      orderBy: [{ updatedAt: "desc" }],
    });
    return rows.map(present);
  },

  createReform: async function (input) {
    const { data, error } = await sanitize(input);
    if (error) return { error };
    return {
      reform: present(
        await db().lawReformEvent.create({
          data: { ...data, jurisdiction: "MA" },
        })
      ),
      error: null,
    };
  },

  updateReform: async function (id, input) {
    const existing = await db().lawReformEvent.findUnique({ where: { id } });
    if (!existing) return { error: "not_found" };
    const { data, error } = await sanitize(input, existing);
    if (error) return { error };
    return {
      reform: present(
        await db().lawReformEvent.update({ where: { id }, data })
      ),
      error: null,
    };
  },

  newSources: async function () {
    return db().lawSourceDocument.findMany({
      where: { parseStatus: "new" },
      orderBy: { retrievedAt: "desc" },
      take: 100,
    });
  },

  dismissSource: async function (id) {
    const r = await db().lawSourceDocument.updateMany({
      where: { id, parseStatus: "new" },
      data: { parseStatus: "dismissed" },
    });
    return r.count === 1;
  },

  /**
   * Import a scraped document into a corpus REVIEW session (never straight into the corpus). The PDF is
   * downloaded politely once; identical bytes already stored are reused (hash check).
   */
  importSource: async function (
    id,
    { codeSlug, validFrom, amendedByLaw = null, amendedByBoRef = null } = {}
  ) {
    const src = await db().lawSourceDocument.findUnique({ where: { id } });
    if (!src || !src.url) return { error: "not_found" };
    let asset = src.assetId
      ? await db().lawAsset.findUnique({ where: { id: src.assetId } })
      : null;
    if (!asset) {
      const res = await politeFetch(src.url, {
        minIntervalMs: lawConfig().scraper.minIntervalSeconds * 1000,
        binary: true,
      });
      if (res.status >= 400 || !res.body?.length)
        return { error: `download failed: HTTP ${res.status}` };
      const sha256 = crypto.createHash("sha256").update(res.body).digest("hex");
      asset = await db().lawAsset.findFirst({ where: { sha256 } });
      if (!asset) {
        const tmp = path.join(
          os.tmpdir(),
          `lawos-src-${crypto.randomBytes(6).toString("hex")}`
        );
        fs.writeFileSync(tmp, res.body);
        const storagePath = commitToStore(tmp, sha256, "application/pdf");
        asset = await db().lawAsset.create({
          data: {
            sha256,
            kind: "pdf",
            mime: "application/pdf",
            bytes: res.body.length,
            storagePath: storagePath || assetRelPath(sha256, "application/pdf"),
            originalFilename: src.title,
            clientCaptureId: `source:${src.id}`,
          },
        });
      }
      await db().lawSourceDocument.update({
        where: { id },
        data: {
          sha256: asset.sha256,
          storagePath: asset.storagePath,
          assetId: asset.id,
        },
      });
    }
    const r = await LawCorpus.createImport({
      codeSlug,
      validFrom,
      amendedByLaw,
      amendedByBoRef,
      assetId: asset.id,
      url: src.url,
      title: src.title,
      boNumber: src.boNumber,
    });
    if (r.error) return { error: r.error };
    await LawJob.enqueue(
      "parse_corpus_import",
      { importId: r.import.id },
      { priority: 1 }
    );
    await db().lawSourceDocument.update({
      where: { id },
      data: { parseStatus: "imported", parseNotes: `import ${r.import.id}` },
    });
    return { import: r.import, error: null };
  },
};

module.exports = { LawRadar };
