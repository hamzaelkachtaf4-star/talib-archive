const { reqBody } = require("../../utils/http");
const { auth, admin, handle, badRequest } = require("./helpers");
const { LawCorpus } = require("../../models/lawCorpus");
const { LawDecision } = require("../../models/lawDecision");
const { LawDoctrine } = require("../../models/lawDoctrine");
const { LawLink } = require("../../models/lawLink");
const { LawJob } = require("../../models/lawJob");
const { searchArticles } = require("../../utils/law/corpusSearch"); // also registers FTS rebuild indexers
const { isDateStr } = require("../../utils/law/time");
const worker = require("../../utils/law/worker");
const catalog = require("../../utils/law/corpusCatalog");
const { LawCorpusUser } = require("../../models/lawCorpusUser");
const { provenanceBySlug } = require("../../utils/law/corpusIngest");
const { rawDb } = require("../../utils/law/dbClient");

/** ?at=YYYY-MM-DD → start of that day (UTC), default now. */
function atParam(req) {
  return isDateStr(req.query.at)
    ? new Date(`${req.query.at}T00:00:00Z`)
    : new Date();
}

function lawCorpusEndpoints(router) {
  // RC3 Phase 6: the Library's three categories, each entry joined to what has really been ingested (and where it came from).
  router.get(
    "/law/corpus/catalog",
    auth,
    handle("corpus_catalog", async (req, res) => {
      const codes = await LawCorpus.codes();
      const provenance = await provenanceBySlug(rawDb);
      const includeAll = req.query.all === "1" || req.query.all === "true" || req.query.full === "1";
      const built = catalog.build(codes, provenance, { includeAll });
      res.json({
        categories: built,
        levels: built,
        nonBindingReferences: catalog.load().nonBindingReferences || null,
        lastAudit: catalog.load().lastAudit || "2026-10-14",
      });
    })
  );

  router.get(
    "/law/corpus/codes",
    auth,
    handle("corpus_codes", async (_req, res) => {
      res.json({ codes: await LawCorpus.codes() });
    })
  );

  router.get(
    "/law/corpus/codes/:slug/export",
    auth,
    handle("corpus_export", async (req, res) => {
      const pack = await LawCorpus.exportCode(req.params.slug, atParam(req));
      if (!pack) return res.status(404).json({ error: "not_found" });
      res.json(pack);
    })
  );

  router.get("/law/corpus/codes/:slug/tree", auth, handle("corpus_tree", async (req, res) => {
    const r = await LawCorpusUser.codeTree(req.params.slug);
    if (r.error) return res.status(404).json({ error: r.error });
    res.json({ code: r.code, tree: r.tree });
  }));
  router.get("/law/corpus/bookmarks", auth, handle("corpus_bookmarks", async (_req, res) => res.json(await LawCorpusUser.bookmarks(res.locals.lawUser.id))));
  router.put("/law/corpus/bookmarks/:id", auth, handle("corpus_bookmark_add", async (req, res) => {
    const r = await LawCorpusUser.addBookmark(res.locals.lawUser.id, req.params.id);
    if (r.error) return res.status(r.status || 404).json({ error: r.error });
    res.json({ ok: true });
  }));
  router.delete("/law/corpus/bookmarks/:id", auth, handle("corpus_bookmark_remove", async (req, res) => { await LawCorpusUser.removeBookmark(res.locals.lawUser.id, req.params.id); res.json({ ok: true }); }));

  router.get(
    "/law/corpus/search",
    auth,
    handle("corpus_search", async (req, res) => {
      const at = atParam(req);
      const codes = await LawCorpus.resolveCodes(req.query.code || null, at);
      const q = String(req.query.q || "").slice(0, 500);
      res.json({
        at: at.toISOString().slice(0, 10),
        codes: codes.map((c) => c.slug),
        results: await searchArticles({ q, codes, at }),
      });
    })
  );

  router.get(
    "/law/corpus/articles/:canonicalId",
    auth,
    handle("corpus_article", async (req, res) => {
      const article = await LawCorpus.article(
        req.params.canonicalId,
        atParam(req)
      );
      if (!article) return res.status(404).json({ error: "not_found" });
      res.json({
        article,
        links: await LawLink.forEntity("article", article.id),
      });
    })
  );

  router.get(
    "/law/corpus/resolve",
    auth,
    handle("corpus_resolve", async (req, res) => {
      const ids = String(req.query.ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      res.json({ resolved: await LawCorpus.resolve(ids, atParam(req)) });
    })
  );

  router.get(
    "/law/corpus/import",
    admin,
    handle("corpus_imports", async (_req, res) => {
      res.json({ imports: await LawCorpus.listImports() });
    })
  );

  router.post(
    "/law/corpus/import",
    admin,
    handle("corpus_import_create", async (req, res) => {
      const r = await LawCorpus.createImport(reqBody(req) || {});
      if (r.error) return badRequest(res, r.error);
      if (r.needsJob) {
        await LawJob.enqueue(
          "parse_corpus_import",
          { importId: r.import.id },
          { priority: 1 }
        );
        worker.kick();
      }
      res.status(201).json({ import: r.import });
    })
  );

  router.get(
    "/law/corpus/import/:id",
    admin,
    handle("corpus_import_get", async (req, res) => {
      const imp = await LawCorpus.getImport(req.params.id);
      if (!imp) return res.status(404).json({ error: "not_found" });
      res.json({ import: imp });
    })
  );

  // PATCH { articles } saves review edits; { action: "commit" } writes the reviewed articles.
  router.patch(
    "/law/corpus/import/:id",
    admin,
    handle("corpus_import_update", async (req, res) => {
      const body = reqBody(req) || {};
      if (body.articles) {
        const r = await LawCorpus.updateImport(req.params.id, body);
        if (r.error) return badRequest(res, r.error);
        if (body.action !== "commit") return res.json({ import: r.import });
      }
      if (body.action === "commit") {
        const r = await LawCorpus.commitImport(req.params.id);
        if (r.error) return badRequest(res, r.error);
        return res.json({ import: r.import, summary: r.summary });
      }
      if (!body.articles) return badRequest(res, "nothing to do");
    })
  );

  router.get(
    "/law/sources",
    admin,
    handle("sources", async (_req, res) => {
      res.json({ sources: await LawCorpus.sources() });
    })
  );

  router.get(
    "/law/decisions",
    auth,
    handle("decisions_list", async (req, res) => {
      res.json({
        decisions: await LawDecision.list({ q: req.query.q || undefined }),
      });
    })
  );

  router.post(
    "/law/decisions",
    auth,
    handle("decisions_create", async (req, res) => {
      const r = await LawDecision.create(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ decision: r.decision });
    })
  );

  router.patch(
    "/law/decisions/:id",
    auth,
    handle("decisions_update", async (req, res) => {
      const r = await LawDecision.update(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ decision: r.decision });
    })
  );

  router.get(
    "/law/doctrine",
    auth,
    handle("doctrine_list", async (req, res) => {
      res.json({
        doctrine: await LawDoctrine.list({ q: req.query.q || undefined }),
      });
    })
  );

  router.post(
    "/law/doctrine",
    auth,
    handle("doctrine_create", async (req, res) => {
      const r = await LawDoctrine.create(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ doctrine: r.doctrine });
    })
  );

  router.patch(
    "/law/doctrine/:id",
    auth,
    handle("doctrine_update", async (req, res) => {
      const r = await LawDoctrine.update(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ doctrine: r.doctrine });
    })
  );

  router.post(
    "/law/links",
    auth,
    handle("links_create", async (req, res) => {
      const r = await LawLink.create(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ link: r.link });
    })
  );

  router.delete(
    "/law/links/:id",
    auth,
    handle("links_delete", async (req, res) => {
      if (!(await LawLink.remove(req.params.id)))
        return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    })
  );
}

module.exports = { lawCorpusEndpoints };
