// Phase 8: change requests, revisions, reports and the moderation queue for the Faculty Hub.
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { consented } = require("./collab");
const { LawHubCollab } = require("../../models/lawHubCollab");

const hub = [...auth, consented];
const me = (res) => res.locals.lawUser.id;
const reply = (name, fn, okStatus = 200) =>
  handle(name, async (req, res) => {
    const r = await fn(req, res);
    if (r?.error) {
      const { error, status, ...rest } = r;
      return res.status(status || (error === "not_found" ? 404 : 400)).json({ error: { code: error, message: error, details: rest } });
    }
    res.status(okStatus).json(r);
  });

function lawHubCollabEndpoints(router) {
  router.get("/law/hub/notes/:id/revisions", hub, reply("hub_revisions", (req, res) => LawHubCollab.revisions(me(res), req.params.id)));
  router.post("/law/hub/notes/:id/change-requests", hub, reply("hub_cr_create", (req, res) => LawHubCollab.createCR(me(res), req.params.id, reqBody(req)), 201));
  router.get("/law/hub/change-requests", hub, reply("hub_cr_inbox", async (req, res) => ({ changeRequests: await LawHubCollab.inbox(me(res), req.query.role === "author" ? "author" : "owner") })));
  router.get("/law/hub/change-requests/:id", hub, reply("hub_cr_get", (req, res) => LawHubCollab.getCR(me(res), req.params.id)));
  router.post("/law/hub/change-requests/:id/merge", hub, reply("hub_cr_merge", (req, res) => LawHubCollab.merge(me(res), req.params.id)));
  router.post("/law/hub/change-requests/:id/reject", hub, reply("hub_cr_reject", (req, res) => LawHubCollab.reject(me(res), req.params.id, reqBody(req).reviewNote)));
  router.post("/law/hub/change-requests/:id/withdraw", hub, reply("hub_cr_withdraw", (req, res) => LawHubCollab.withdraw(me(res), req.params.id)));
  router.post("/law/hub/change-requests/:id/rebase", hub, reply("hub_cr_rebase", (req, res) => LawHubCollab.rebase(me(res), req.params.id, reqBody(req).content)));
  router.post("/law/hub/notes/:id/report", hub, reply("hub_report", (req, res) => LawHubCollab.report(me(res), req.params.id, reqBody(req)), 201));
  router.post("/law/hub/notes/:id/appeal", hub, reply("hub_appeal", (req, res) => LawHubCollab.appeal(me(res), req.params.id)));
  router.get("/law/admin/moderation/queue", admin, reply("mod_queue", async () => ({ queue: await LawHubCollab.queue() })));
  router.post("/law/admin/moderation/:id/decide", admin, reply("mod_decide", (req, res) => LawHubCollab.decide(me(res), req.params.id, reqBody(req).decision)));
}

module.exports = { lawHubCollabEndpoints };
