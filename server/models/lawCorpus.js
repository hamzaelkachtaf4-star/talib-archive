// Legal corpus (spec §3.2-3.3, §5.4, §6.5): code registry, import → review → commit, versioned articles.
// The AI is never a legal source: article text only enters through an import the student reviews, and
// `verifiedByUser` is set only for articles the student explicitly confirmed.
const crypto = require("crypto");
const { db } = require("../utils/law/dbClient");
const {
  normalize,
  normalizeCanonicalId,
  toWesternDigits,
} = require("../utils/law/arabic");
const { parseArticles } = require("../utils/law/corpusParser");
const { indexArticleVersion } = require("../utils/law/corpusSearch");
const { isDateStr } = require("../utils/law/time");

// Registry metadata only (no statute text). Facts per spec §3.3/§3.7; references to re-check against
// the BO are noted. Editable later; seeding never overwrites an existing row.
const CODE_REGISTRY = [
  {
    slug: "DOC",
    normLevel: "ORDINARY",
    domain: "CIVIL",
    family: "DOC",
    titleAr: "ظهير الالتزامات والعقود",
    titleFr: "Dahir des obligations et des contrats",
    dahirRef: "ظهير 9 رمضان 1331 (12 غشت 1913)",
    numberingLabel: "الفصل",
  },
  {
    slug: "CP",
    normLevel: "ORDINARY",
    domain: "CRIMINAL",
    family: "CP",
    titleAr: "مجموعة القانون الجنائي",
    titleFr: "Code pénal",
    dahirRef: "ظهير شريف رقم 1.59.413 (26 نونبر 1962)",
    numberingLabel: "الفصل",
  },
  {
    slug: "CPC-1974",
    normLevel: "ORDINARY",
    domain: "PROCEDURE_CIVIL",
    family: "CPC",
    titleAr: "قانون المسطرة المدنية (1974)",
    titleFr: "Code de procédure civile (1974)",
    dahirRef: "ظهير شريف بمثابة قانون رقم 1.74.447 (28 شتنبر 1974)",
    numberingLabel: "الفصل",
    status: "repealed",
    inForceTo: "2026-08-24",
    notes:
      "نُسخ بالقانون 58.25؛ يبقى مرجعا للقضايا الجارية وفق المقتضيات الانتقالية.",
  },
  {
    slug: "CPC-58.25",
    normLevel: "ORDINARY",
    domain: "PROCEDURE_CIVIL",
    family: "CPC",
    titleAr: "قانون المسطرة المدنية رقم 58.25",
    titleFr: "Code de procédure civile (loi 58.25)",
    lawNumber: "58.25",
    numberingLabel: "المادة",
    inForceFrom: "2026-08-24",
  },
  {
    slug: "MOUDAWANA",
    normLevel: "ORDINARY",
    domain: "FAMILY",
    family: "MOUDAWANA",
    titleAr: "مدونة الأسرة",
    titleFr: "Code de la famille",
    lawNumber: "70.03",
    numberingLabel: "المادة",
  },
  {
    slug: "CT",
    normLevel: "ORDINARY",
    domain: "LABOUR",
    family: "CT",
    titleAr: "مدونة الشغل",
    titleFr: "Code du travail",
    lawNumber: "65.99",
    numberingLabel: "المادة",
  },
  {
    slug: "CCOM",
    normLevel: "ORDINARY",
    domain: "COMMERCIAL",
    family: "CCOM",
    titleAr: "مدونة التجارة",
    titleFr: "Code de commerce",
    lawNumber: "15.95",
    numberingLabel: "المادة",
  },
  // Spec Phase 6: higher norms and the other texts of the curriculum. Registry shells only: the articles arrive through the
  // corpus import (official PDF from sgg.gov.ma / Bulletin Officiel), flagged reviewed=false until an admin checks them.
  {
    slug: "CONST-2011",
    family: "CONST",
    normLevel: "CONSTITUTION",
    titleAr: "دستور المملكة المغربية (2011)",
    titleFr: "Constitution du Royaume du Maroc (2011)",
    numberingLabel: "الفصل",
    reviewed: false,
  },
  {
    slug: "ORG-REGIONS",
    family: "ORG-REGIONS",
    normLevel: "ORGANIC",
    domain: "ADMIN",
    titleAr: "القانون التنظيمي المتعلق بالجهات",
    titleFr: "Loi organique relative aux régions",
    lawNumber: "111.14",
    numberingLabel: "المادة",
    reviewed: false,
  },
  {
    slug: "ORG-PREFECTURES",
    family: "ORG-PREFECTURES",
    normLevel: "ORGANIC",
    domain: "ADMIN",
    titleAr: "القانون التنظيمي المتعلق بالعمالات والأقاليم",
    titleFr: "Loi organique relative aux préfectures et provinces",
    lawNumber: "112.14",
    numberingLabel: "المادة",
    reviewed: false,
  },
  {
    slug: "ORG-COMMUNES",
    family: "ORG-COMMUNES",
    normLevel: "ORGANIC",
    domain: "ADMIN",
    titleAr: "القانون التنظيمي المتعلق بالجماعات",
    titleFr: "Loi organique relative aux communes",
    lawNumber: "113.14",
    numberingLabel: "المادة",
    reviewed: false,
  },
  {
    slug: "CPP",
    family: "CPP",
    normLevel: "ORDINARY",
    domain: "PROCEDURE_PENAL",
    titleAr: "قانون المسطرة الجنائية",
    titleFr: "Code de procédure pénale",
    lawNumber: "22.01",
    numberingLabel: "المادة",
    reviewed: false,
  },
  {
    slug: "ADMIN-COURTS",
    family: "ADMIN-COURTS",
    normLevel: "ORDINARY",
    domain: "ADMIN",
    titleAr: "القانون المحدث للمحاكم الإدارية",
    titleFr: "Loi instituant les tribunaux administratifs",
    lawNumber: "41.90",
    numberingLabel: "المادة",
    reviewed: false,
  },
];

const dayStart = (d) => new Date(`${d}T00:00:00Z`);

function checksum(text) {
  return crypto
    .createHash("sha256")
    .update(String(text).normalize("NFC").trim())
    .digest("hex");
}

function parseJson(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** A version is valid on day d when validFrom ≤ d < validTo. */
function validAt(at) {
  return {
    validFrom: { lte: at },
    OR: [{ validTo: null }, { validTo: { gt: at } }],
  };
}

/** Whether the work itself (the code) is in force on `at`. */
function codeInForce(code, at) {
  return (
    (!code.inForceFrom || code.inForceFrom <= at) &&
    (!code.inForceTo || at < code.inForceTo)
  );
}

function presentImport(imp) {
  return {
    ...imp,
    articles: parseJson(imp.articles, []),
    warnings: parseJson(imp.warnings, []),
    summary: parseJson(imp.summary, null),
  };
}

function sanitizeArticles(list) {
  if (!Array.isArray(list) || list.length > 5000)
    return { error: "invalid articles" };
  const out = [];
  for (const a of list) {
    if (!a || typeof a.text !== "string" || typeof a.number !== "string")
      return { error: "invalid article" };
    const number = toWesternDigits(a.number).trim().replace(/\s+/g, "-");
    if (!number || !/^[0-9A-Za-z؀-ۿ-]+$/.test(number))
      return { error: `invalid article number: ${a.number}` };
    out.push({
      number,
      headingPath: Array.isArray(a.headingPath)
        ? a.headingPath.map(String).slice(0, 8)
        : [],
      text: a.text,
      include: a.include !== false,
      confirmed: a.confirmed === true,
      warnings: Array.isArray(a.warnings) ? a.warnings : [],
    });
  }
  return { articles: out };
}

const LawCorpus = {
  CODE_REGISTRY,
  checksum,
  validAt,
  codeInForce,

  ensureCodesSeeded: async function () {
    for (const c of CODE_REGISTRY) {
      if (await db().lawCode.findUnique({ where: { slug: c.slug } })) continue;
      await db().lawCode.create({
        data: {
          ...c,
          inForceFrom: c.inForceFrom ? dayStart(c.inForceFrom) : null,
          inForceTo: c.inForceTo ? dayStart(c.inForceTo) : null,
        },
      });
    }
  },

  codes: async function () {
    await this.ensureCodesSeeded();
    const rows = await db().lawCode.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { articles: true } } },
    });
    return rows.map(({ _count, ...c }) => ({
      ...c,
      articleCount: _count.articles,
    }));
  },

  codeBySlug: async function (slug) {
    await this.ensureCodesSeeded();
    return db().lawCode.findUnique({ where: { slug } });
  },

  /** Codes to search for a slug-or-family at a date (see docs/plans/phase-3.md "Date semantics"). */
  resolveCodes: async function (codeParam, at) {
    await this.ensureCodesSeeded();
    const all = await db().lawCode.findMany();
    if (codeParam) {
      const exact = all.find((c) => c.slug === codeParam);
      if (exact) return [exact];
      const fam = all.filter((c) => c.family === codeParam);
      const live = fam.filter((c) => codeInForce(c, at));
      return live.length ? live : fam;
    }
    return all.filter((c) => codeInForce(c, at));
  },

  // ── imports ──

  /**
   * Start an import from pasted official text (parsed now) or an uploaded asset (parsed by a job).
   * @returns {{import, error, needsJob?}}
   */
  createImport: async function ({
    codeSlug,
    validFrom,
    amendedByLaw = null,
    amendedByBoRef = null,
    text,
    assetId,
    url = null,
    title = null,
    boNumber = null,
  } = {}) {
    const code = await this.codeBySlug(codeSlug);
    if (!code) return { error: "unknown code" };
    if (!isDateStr(validFrom)) return { error: "validFrom must be YYYY-MM-DD" };
    if (!text && !assetId) return { error: "text or assetId required" };

    let source;
    if (text) {
      if (typeof text !== "string" || text.length > 10_000_000)
        return { error: "invalid text" };
      source = await db().lawSourceDocument.create({
        data: {
          origin: "manual_text",
          sha256: checksum(text),
          url,
          title,
          boNumber,
          parseStatus: "parsed",
        },
      });
    } else {
      const asset = await db().lawAsset.findUnique({ where: { id: assetId } });
      if (!asset) return { error: "unknown asset" };
      source = await db().lawSourceDocument.create({
        data: {
          origin: "manual_upload",
          sha256: asset.sha256,
          storagePath: asset.storagePath,
          assetId,
          url,
          title: title || asset.originalFilename,
          boNumber,
        },
      });
    }

    const base = {
      codeId: code.id,
      sourceDocumentId: source.id,
      validFrom: dayStart(validFrom),
      amendedByLaw,
      amendedByBoRef,
    };
    if (text) {
      const parsed = parseArticles(text);
      const imp = await db().lawCorpusImport.create({
        data: {
          ...base,
          status: "review",
          rawText: text,
          articles: JSON.stringify(parsed.articles),
          warnings: JSON.stringify(parsed.warnings),
        },
      });
      return { import: presentImport(imp), error: null };
    }
    const imp = await db().lawCorpusImport.create({
      data: { ...base, status: "parsing" },
    });
    return { import: presentImport(imp), error: null, needsJob: true };
  },

  /** Called by the parse job once text is extracted. */
  finishParsing: async function (importId, rawText, extraWarnings = []) {
    const parsed = parseArticles(rawText);
    const imp = await db().lawCorpusImport.update({
      where: { id: importId },
      data: {
        status: "review",
        rawText,
        articles: JSON.stringify(parsed.articles),
        warnings: JSON.stringify([...extraWarnings, ...parsed.warnings]),
      },
    });
    if (imp.sourceDocumentId)
      await db().lawSourceDocument.update({
        where: { id: imp.sourceDocumentId },
        data: {
          parseStatus: "parsed",
          parseNotes: extraWarnings.join("; ") || null,
        },
      });
    return presentImport(imp);
  },

  getImport: async function (id) {
    const imp = await db().lawCorpusImport.findUnique({
      where: { id },
      include: { code: true, sourceDocument: true },
    });
    return imp ? presentImport(imp) : null;
  },

  listImports: async function () {
    const rows = await db().lawCorpusImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { code: { select: { slug: true, titleAr: true } } },
      // rawText/articles can be large: list view only needs the header
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      validFrom: r.validFrom,
      createdAt: r.createdAt,
      summary: parseJson(r.summary, null),
      articleCount: parseJson(r.articles, []).length,
    }));
  },

  /** Save the student's review edits (boundaries, numbers, text, confirmations). */
  updateImport: async function (id, { articles }) {
    const imp = await db().lawCorpusImport.findUnique({ where: { id } });
    if (!imp) return { error: "not_found" };
    if (imp.status !== "review") return { error: `import is ${imp.status}` };
    const clean = sanitizeArticles(articles);
    if (clean.error) return { error: clean.error };
    await db().lawCorpusImport.update({
      where: { id },
      data: { articles: JSON.stringify(clean.articles) },
    });
    return { import: await this.getImport(id), error: null };
  },

  /**
   * Commit the reviewed articles into the corpus. Versioning per article:
   *  - same text as the version covering validFrom → unchanged (a confirmation can still verify it);
   *  - same validFrom, different text → corrected in place;
   *  - later validFrom → previous version closed at validFrom, new version opened;
   *  - earlier validFrom (importing an older text) → inserted as history, closed at the next version.
   */
  commitImport: async function (id) {
    const imp = await db().lawCorpusImport.findUnique({
      where: { id },
      include: { code: true },
    });
    if (!imp) return { error: "not_found" };
    if (imp.status !== "review") return { error: `import is ${imp.status}` };
    const articles = parseJson(imp.articles, []).filter(
      (a) => a.include !== false && a.text.trim()
    );
    const numbers = articles.map((a) => a.number);
    if (new Set(numbers).size !== numbers.length)
      return { error: "duplicate article numbers: fix them in review" };

    const summary = {
      created: 0,
      versioned: 0,
      corrected: 0,
      unchanged: 0,
      verified: 0,
    };
    const now = new Date();
    for (const a of articles) {
      const canonicalId = normalizeCanonicalId(`${imp.code.slug}:${a.number}`);
      const text = a.text.trim();
      const sum = checksum(text);
      const verified = a.confirmed === true;
      let article = await db().lawArticle.findUnique({
        where: { canonicalId },
      });
      if (!article)
        article = await db().lawArticle.create({
          data: {
            codeId: imp.codeId,
            articleNumber: a.number,
            canonicalId,
            headingPath: JSON.stringify(a.headingPath || []),
          },
        });
      else if (a.headingPath?.length)
        await db().lawArticle.update({
          where: { id: article.id },
          data: { headingPath: JSON.stringify(a.headingPath) },
        });

      const versions = await db().lawArticleVersion.findMany({
        where: { articleId: article.id },
        orderBy: { validFrom: "asc" },
      });
      const covering = versions
        .filter((v) => v.validFrom <= imp.validFrom)
        .pop();
      const next = versions.find((v) => v.validFrom > imp.validFrom);
      const fields = {
        textAr: text,
        textNormalized: normalize(text),
        checksum: sum,
        amendedByLaw: imp.amendedByLaw,
        amendedByBoRef: imp.amendedByBoRef,
        sourceDocumentId: imp.sourceDocumentId,
        importId: imp.id,
        verifiedByUser: verified,
        verifiedAt: verified ? now : null,
      };

      let version;
      if (covering && covering.checksum === sum) {
        summary.unchanged++;
        version = covering;
        if (verified && !covering.verifiedByUser)
          version = await db().lawArticleVersion.update({
            where: { id: covering.id },
            data: { verifiedByUser: true, verifiedAt: now },
          });
      } else if (
        covering &&
        covering.validFrom.getTime() === imp.validFrom.getTime()
      ) {
        version = await db().lawArticleVersion.update({
          where: { id: covering.id },
          data: fields,
        });
        summary.corrected++;
      } else {
        if (covering && (!covering.validTo || covering.validTo > imp.validFrom))
          await db().lawArticleVersion.update({
            where: { id: covering.id },
            data: { validTo: imp.validFrom },
          });
        version = await db().lawArticleVersion.create({
          data: {
            articleId: article.id,
            validFrom: imp.validFrom,
            validTo: next ? next.validFrom : null,
            ...fields,
          },
        });
        if (versions.length) summary.versioned++;
        else summary.created++;
      }
      if (version.verifiedByUser) summary.verified++;
      indexArticleVersion(version, canonicalId);
    }
    await db().lawCorpusImport.update({
      where: { id },
      data: {
        status: "committed",
        committedAt: now,
        summary: JSON.stringify(summary),
      },
    });
    return { import: await this.getImport(id), summary, error: null };
  },

  // ── reading ──

  /** Article text at a date, its full version history and the code (with repeal info). */
  article: async function (canonicalIdRaw, at = new Date()) {
    const canonicalId = normalizeCanonicalId(canonicalIdRaw);
    if (!canonicalId) return null;
    const article = await db().lawArticle.findUnique({
      where: { canonicalId },
      include: {
        code: true,
        versions: {
          orderBy: { validFrom: "asc" },
          include: {
            sourceDocument: {
              select: {
                id: true,
                origin: true,
                title: true,
                url: true,
                boNumber: true,
              },
            },
          },
        },
      },
    });
    if (!article) return null;
    const current =
      article.versions
        .filter((v) => v.validFrom <= at && (!v.validTo || v.validTo > at))
        .pop() || null;
    return {
      ...article,
      headingPath: parseJson(article.headingPath, []),
      at: at.toISOString().slice(0, 10),
      current,
      codeInForceAtDate: codeInForce(article.code, at),
    };
  },

  /** Every article of a code with its text valid at `at` (the Library's "save offline" pack). */
  exportCode: async function (slug, at = new Date()) {
    const code = await db().lawCode.findUnique({ where: { slug } });
    if (!code) return null;
    const articles = await db().lawArticle.findMany({
      where: { codeId: code.id },
      include: { versions: { where: validAt(at), orderBy: { validFrom: "desc" }, take: 1 } },
    });
    // natural order (DOC:2 before DOC:10)
    articles.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId, "en", { numeric: true }));
    return {
      code: { slug: code.slug, titleAr: code.titleAr, titleFr: code.titleFr, numberingLabel: code.numberingLabel, normLevel: code.normLevel, reviewed: code.reviewed, sourceUrl: code.sourceUrl },
      at: at.toISOString().slice(0, 10),
      articles: articles
        .filter((a) => a.versions[0])
        .map((a) => ({ canonicalId: a.canonicalId, articleNumber: a.articleNumber, headingPath: parseJson(a.headingPath, []), text: a.versions[0].textAr, verifiedByUser: !!a.versions[0].verifiedByUser })),
    };
  },

  /**
   * Batch-resolve canonicalIds (spec §9.5; used by the Phase 5 citation validator and the UI).
   * Unknown ids resolve to { exists: false } and must be stripped by callers (spec §1.4).
   */
  resolve: async function (ids, at = new Date()) {
    const out = {};
    for (const raw of ids.slice(0, 200)) {
      const id = normalizeCanonicalId(raw);
      if (!id) {
        out[raw] = { exists: false, reason: "malformed" };
        continue;
      }
      const a = await db().lawArticle.findUnique({
        where: { canonicalId: id },
        include: { code: true },
      });
      if (!a) {
        out[raw] = { canonicalId: id, exists: false };
        continue;
      }
      const v = await db().lawArticleVersion.findFirst({
        where: { articleId: a.id, ...validAt(at) },
        orderBy: { validFrom: "desc" },
      });
      out[raw] = {
        canonicalId: id,
        exists: true,
        validAtDate: !!v,
        codeInForce: codeInForce(a.code, at),
        versionId: v?.id ?? null,
        verifiedByUser: !!v?.verifiedByUser,
        text: v?.textAr ?? null,
      };
    }
    return out;
  },

  sources: async function () {
    return db().lawSourceDocument.findMany({
      orderBy: { retrievedAt: "desc" },
      take: 100,
    });
  },
};

module.exports = { LawCorpus };
