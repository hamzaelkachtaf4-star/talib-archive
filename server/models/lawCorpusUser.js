// What a student does with the legal corpus beyond reading it (RC4 Phase 7): the heading tree of a code, bookmarks, and linking
// an article to one of their modules. Everything here is private to the student; the corpus itself stays shared and read-only.
const { rawDb } = require("../utils/law/dbClient");
const { serialWrite } = require("../utils/law/writeLock");
const { LawModule } = require("./lawModule");

const MAX_BOOKMARKS = 2000;
const MAX_LINKS_PER_MODULE = 200;

/** "12", "12-3", "12 bis": natural order by the leading number, then the rest. */
const byNumber = (a, b) => {
  const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.number).localeCompare(String(b.number), "en", { numeric: true });
};
const parsePath = (v) => { try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } };

/** An article's identity for lists: code, number, heading path. No body text. */
async function describe(rows) {
  if (!rows.length) return [];
  const arts = await rawDb().lawArticle.findMany({ where: { canonicalId: { in: rows.map((r) => r.canonicalId) } }, include: { code: { select: { slug: true, titleAr: true, titleFr: true, numberingLabel: true } } } });
  const by = new Map(arts.map((a) => [a.canonicalId, a]));
  return rows.map((r) => {
    const a = by.get(r.canonicalId);
    return a ? { canonicalId: r.canonicalId, number: a.articleNumber, headingPath: parsePath(a.headingPath), code: a.code, createdAt: r.createdAt } : null;
  }).filter(Boolean);
}

const LawCorpusUser = {
  /** The headings of a code with its article numbers, in reading order. Never carries article text. */
  codeTree: async function (slug) {
    const code = await rawDb().lawCode.findUnique({ where: { slug: String(slug || "") }, select: { id: true, slug: true, titleAr: true, titleFr: true, numberingLabel: true, normLevel: true } });
    if (!code) return { error: "not_found" };
    const rows = await rawDb().lawArticle.findMany({ where: { codeId: code.id }, select: { canonicalId: true, articleNumber: true, headingPath: true } });
    const arts = rows.map((r) => ({ canonicalId: r.canonicalId, number: r.articleNumber, path: parsePath(r.headingPath) })).sort(byNumber);
    const root = { children: [], articles: [] };
    for (const a of arts) {
      let node = root;
      for (const title of a.path) {
        let next = node.children.find((c) => c.title === title);
        if (!next) { next = { title, children: [], articles: [] }; node.children.push(next); }
        node = next;
      }
      node.articles.push({ canonicalId: a.canonicalId, number: a.number });
    }
    return { code: { ...code, articleCount: arts.length }, tree: [...(root.articles.length ? [{ title: null, children: [], articles: root.articles }] : []), ...root.children], error: null };
  },

  bookmarks: async function (userId) {
    const rows = await rawDb().lawArticleBookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: MAX_BOOKMARKS });
    return { bookmarks: await describe(rows), error: null };
  },

  addBookmark: async function (userId, canonicalId) {
    const id = String(canonicalId || "");
    if (!(await rawDb().lawArticle.findUnique({ where: { canonicalId: id }, select: { id: true } }))) return { error: "not_found" };
    return serialWrite(async () => {
      if (!(await rawDb().lawArticleBookmark.findUnique({ where: { userId_canonicalId: { userId, canonicalId: id } } }))) {
        if ((await rawDb().lawArticleBookmark.count({ where: { userId } })) >= MAX_BOOKMARKS) return { error: "too_many_bookmarks", status: 409 };
        await rawDb().lawArticleBookmark.create({ data: { userId, canonicalId: id } });
      }
      return { ok: true, error: null };
    });
  },

  removeBookmark: async function (userId, canonicalId) {
    await rawDb().lawArticleBookmark.deleteMany({ where: { userId, canonicalId: String(canonicalId || "") } });
    return { ok: true, error: null };
  },

  moduleArticles: async function (userId, moduleId) {
    if (!(await LawModule.visible(userId, moduleId))) return { error: "not_found" };
    const rows = await rawDb().lawModuleArticle.findMany({ where: { userId, moduleId: String(moduleId) }, orderBy: { createdAt: "asc" } });
    return { articles: await describe(rows), error: null };
  },

  linkArticle: async function (userId, moduleId, canonicalId) {
    if (!(await LawModule.visible(userId, moduleId))) return { error: "not_found" };
    const id = String(canonicalId || "");
    if (!(await rawDb().lawArticle.findUnique({ where: { canonicalId: id }, select: { id: true } }))) return { error: "not_found" };
    return serialWrite(async () => {
      const where = { userId_moduleId_canonicalId: { userId, moduleId: String(moduleId), canonicalId: id } };
      if (!(await rawDb().lawModuleArticle.findUnique({ where }))) {
        if ((await rawDb().lawModuleArticle.count({ where: { userId, moduleId: String(moduleId) } })) >= MAX_LINKS_PER_MODULE) return { error: "too_many_links", status: 409 };
        await rawDb().lawModuleArticle.create({ data: { userId, moduleId: String(moduleId), canonicalId: id } });
      }
      return { ok: true, error: null };
    });
  },

  unlinkArticle: async function (userId, moduleId, canonicalId) {
    if (!(await LawModule.visible(userId, moduleId))) return { error: "not_found" };
    await rawDb().lawModuleArticle.deleteMany({ where: { userId, moduleId: String(moduleId), canonicalId: String(canonicalId || "") } });
    return { ok: true, error: null };
  },

  /** Pieces for the module's study material: the current text of every linked article, labelled with its code and number. */
  materialPieces: async function (userId, moduleId) {
    const links = await rawDb().lawModuleArticle.findMany({ where: { userId, moduleId: String(moduleId) }, orderBy: { createdAt: "asc" }, take: MAX_LINKS_PER_MODULE });
    if (!links.length) return [];
    const now = new Date();
    const arts = await rawDb().lawArticle.findMany({
      where: { canonicalId: { in: links.map((l) => l.canonicalId) } },
      include: { code: { select: { titleAr: true, numberingLabel: true } }, versions: { where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: { validFrom: "desc" }, take: 1 } },
    });
    return arts.filter((a) => a.versions[0]).map((a) => ({ ref: `a:${a.canonicalId}`, label: `${a.code.numberingLabel || "المادة"} ${a.articleNumber} — ${a.code.titleAr}`, text: a.versions[0].textAr.slice(0, 2400) }));
  },
};

module.exports = { LawCorpusUser };
