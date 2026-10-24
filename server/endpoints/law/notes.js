const { reqBody } = require("../../utils/http");
const { auth, handle, badRequest } = require("./helpers");
const { LawAtom } = require("../../models/lawAtom");
const { LawLenses } = require("../../models/lawLenses");
const { LawInbox } = require("../../models/lawInbox");
const { LawLink } = require("../../models/lawLink");

function lawNotesEndpoints(router) {
  router.get(
    "/law/subjects/:id/content",
    auth,
    handle("subject_content", async (req, res) => {
      const content = await LawLenses.content(req.params.id, {
        mode: req.query.mode,
      });
      if (!content) return res.status(404).json({ error: "not_found" });
      res.json(content);
    })
  );

  router.get(
    "/law/atoms",
    auth,
    handle("atoms_list", async (req, res) => {
      const { subjectId, provenance, q } = req.query;
      res.json({ atoms: await LawAtom.list({ subjectId, provenance, q }) });
    })
  );

  router.post(
    "/law/atoms",
    auth,
    handle("atoms_create", async (req, res) => {
      const r = await LawAtom.create(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ atom: r.atom });
    })
  );

  router.patch(
    "/law/atoms/:id",
    auth,
    handle("atoms_update", async (req, res) => {
      const r = await LawAtom.update(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ atom: r.atom });
    })
  );

  router.delete(
    "/law/atoms/:id",
    auth,
    handle("atoms_delete", async (req, res) => {
      if (!(await LawAtom.remove(req.params.id)))
        return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    })
  );

  router.post(
    "/law/atoms/:id/links",
    auth,
    handle("atoms_link", async (req, res) => {
      if (!(await LawAtom.get(req.params.id)))
        return res.status(404).json({ error: "not_found" });
      const r = await LawLink.create({
        ...reqBody(req),
        fromType: "noteAtom",
        fromId: req.params.id,
      });
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ link: r.link });
    })
  );

  router.post(
    "/law/derivatives/:id/accept-atoms",
    auth,
    handle("accept_atoms", async (req, res) => {
      const { atoms, subjectId } = reqBody(req) || {};
      const r = await LawInbox.acceptAtoms(req.params.id, atoms, { subjectId });
      if (r.error) return badRequest(res, r.error);
      res.json({ created: r.created });
    })
  );
}

module.exports = { lawNotesEndpoints };
