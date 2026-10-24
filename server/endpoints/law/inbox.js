const { reqBody } = require("../../utils/http");
const { auth, admin, handle, badRequest } = require("./helpers");
const { LawJob } = require("../../models/lawJob");
const { LawInbox } = require("../../models/lawInbox");
const { usage } = require("../../utils/law/ai/router");
const worker = require("../../utils/law/worker");

function lawInboxEndpoints(router) {
  router.get(
    "/law/inbox",
    auth,
    handle("inbox", async (_req, res) => {
      res.json(await LawInbox.items());
    })
  );

  router.get(
    "/law/jobs",
    auth,
    handle("jobs_list", async (req, res) => {
      res.json({
        jobs: await LawJob.list({ status: req.query.status || undefined }),
      });
    })
  );

  router.post(
    "/law/jobs/:id/retry",
    auth,
    handle("jobs_retry", async (req, res) => {
      const r = await LawJob.retry(req.params.id);
      if (r.error) return badRequest(res, r.error);
      worker.kick();
      res.json({ job: r.job });
    })
  );

  router.get(
    "/law/derivatives/:id",
    auth,
    handle("derivatives_get", async (req, res) => {
      const d = await LawInbox.derivative(req.params.id);
      if (!d) return res.status(404).json({ error: "not_found" });
      res.json({ derivative: d });
    })
  );

  router.patch(
    "/law/derivatives/:id",
    auth,
    handle("derivatives_update", async (req, res) => {
      const r = await LawInbox.updateDerivative(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ derivative: r.derivative });
    })
  );

  router.get(
    "/law/ai/usage",
    admin,
    handle("ai_usage", async (req, res) => {
      res.json(await usage(req.query.month));
    })
  );
}

module.exports = { lawInboxEndpoints };
