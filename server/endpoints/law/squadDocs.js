// RC3 Phase 7: squad work documents, change requests and roles. /api/law/squads/docs*, /api/law/squads/change-requests*.
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { consented } = require("./collab");
const { LawSquadDoc } = require("../../models/lawSquadDoc");

const squad = [...auth, consented];
const me = (res) => res.locals.lawUser.id;
const reply = (name, fn, okStatus = 200) =>
  handle(name, async (req, res) => {
    const r = await fn(req, res);
    if (r?.error) {
      const { error, status, ...rest } = r;
      return res.status(status || (error === "not_found" ? 404 : 400)).json({ error, ...rest });
    }
    res.status(okStatus).json(r);
  });

function lawSquadDocsEndpoints(router) {
  router.post("/law/squads/docs/extract", squad, reply("sqdoc_extract", async (req, res) => {
    if (!(await LawSquadDoc.isMember(me(res)))) return { error: "not_in_squad" };
    if (!(await require("../../utils/law/rateLimit").hit("squad-doc-extract", me(res), 30))) return { error: "rate_limited", status: 429 };
    return require("../../utils/law/docFile").pdfToText(reqBody(req).file);
  }));
  router.get("/law/squads/docs", squad, reply("sqdoc_list", (req, res) => LawSquadDoc.list(me(res), { type: req.query.type })));
  router.post("/law/squads/docs", squad, reply("sqdoc_create", (req, res) => LawSquadDoc.create(me(res), reqBody(req)), 201));
  router.get("/law/squads/docs/:id", squad, reply("sqdoc_get", (req, res) => LawSquadDoc.get(me(res), req.params.id)));
  router.patch("/law/squads/docs/:id", squad, reply("sqdoc_edit", (req, res) => LawSquadDoc.edit(me(res), req.params.id, reqBody(req))));
  router.delete("/law/squads/docs/:id", squad, reply("sqdoc_delete", (req, res) => LawSquadDoc.remove(me(res), req.params.id)));
  router.get("/law/squads/docs/:id/revisions", squad, reply("sqdoc_revisions", (req, res) => LawSquadDoc.revisions(me(res), req.params.id)));
  router.post("/law/squads/docs/:id/change-requests", squad, reply("sqcr_create", (req, res) => LawSquadDoc.createCR(me(res), req.params.id, reqBody(req)), 201));

  router.get("/law/squads/change-requests", squad, reply("sqcr_list", (req, res) => LawSquadDoc.listCR(me(res), { docId: req.query.docId, mine: req.query.mine === "1" })));
  router.get("/law/squads/change-requests/:id", squad, reply("sqcr_get", (req, res) => LawSquadDoc.getCR(me(res), req.params.id)));
  router.post("/law/squads/change-requests/:id/merge", squad, reply("sqcr_merge", (req, res) => LawSquadDoc.merge(me(res), req.params.id)));
  router.post("/law/squads/change-requests/:id/reject", squad, reply("sqcr_reject", (req, res) => LawSquadDoc.reject(me(res), req.params.id, reqBody(req).reviewNote)));
  router.post("/law/squads/change-requests/:id/withdraw", squad, reply("sqcr_withdraw", (req, res) => LawSquadDoc.withdraw(me(res), req.params.id)));
  router.post("/law/squads/change-requests/:id/rebase", squad, reply("sqcr_rebase", (req, res) => LawSquadDoc.rebase(me(res), req.params.id, reqBody(req).content)));

  router.patch("/law/squads/members/:userId/role", squad, reply("sq_role", (req, res) => LawSquadDoc.setRole(me(res), Number(req.params.userId), reqBody(req).role)));
  router.post("/law/squads/transfer/:userId", squad, reply("sq_transfer", (req, res) => LawSquadDoc.transferOwnership(me(res), Number(req.params.userId))));
}

module.exports = { lawSquadDocsEndpoints };
