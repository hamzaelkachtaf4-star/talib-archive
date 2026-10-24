// Legal knowledge graph: the per-student offline bundle and the admin auto-link proposer (utils/law/legalGraph.js).
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { compileLegalGraphBundle, bundleEtag, proposeAutoLinks } = require("../../utils/law/legalGraph");

function lawGraphEndpoints(router) {
  router.get(
    "/law/graph/bundle",
    auth,
    handle("graph_bundle", async (req, res) => {
      const bundle = await compileLegalGraphBundle();
      const etag = bundleEtag(bundle, res.locals.lawUser.id);
      res.set({ ETag: etag, "Cache-Control": "private, no-cache" });
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.json(bundle);
    })
  );

  // Propose only: LawLink rows are per student, so an admin-created row would be invisible to everyone else.
  router.post(
    "/law/graph/auto-link",
    admin,
    handle("graph_auto_link", async (req, res) => {
      res.json(await proposeAutoLinks({ limit: reqBody(req)?.limit }));
    })
  );
}

module.exports = { lawGraphEndpoints };
