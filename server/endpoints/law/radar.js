const { reqBody } = require("../../utils/http");
const { auth, admin, handle, badRequest } = require("./helpers");
const { LawRadar } = require("../../models/lawRadar");
const { LawRecap } = require("../../models/lawRecap");
const { LawJob } = require("../../models/lawJob");
const {
  sourcesStatus,
  reenableSource,
} = require("../../utils/law/radar/scraper");
const push = require("../../utils/law/push");
const worker = require("../../utils/law/worker");

function lawRadarEndpoints(router) {
  router.get(
    "/law/reforms",
    auth,
    handle("reforms", async (_req, res) =>
      res.json({ reforms: await LawRadar.reforms() })
    )
  );

  router.post(
    "/law/reforms",
    admin,
    handle("reforms_create", async (req, res) => {
      const r = await LawRadar.createReform(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ reform: r.reform });
    })
  );

  router.patch(
    "/law/reforms/:id",
    admin,
    handle("reforms_update", async (req, res) => {
      const r = await LawRadar.updateReform(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ reform: r.reform });
    })
  );

  router.get(
    "/law/sources/status",
    admin,
    handle("sources_status", async (_req, res) =>
      res.json({ sources: await sourcesStatus() })
    )
  );

  // Manual scan: same polite engine and interval as the daily schedule.
  router.post(
    "/law/sources/scan",
    admin,
    handle("sources_scan", async (_req, res) => {
      const job = await LawJob.enqueue("scrape_source", { manual: true });
      worker.kick();
      res.status(202).json({ job });
    })
  );

  router.post(
    "/law/sources/config/:sourceId/enable",
    admin,
    handle("sources_enable", async (req, res) => {
      await reenableSource(req.params.sourceId);
      res.json({ ok: true });
    })
  );

  router.post(
    "/law/sources/:id/import",
    admin,
    handle("sources_import", async (req, res) => {
      const r = await LawRadar.importSource(req.params.id, reqBody(req) || {});
      if (r.error) return badRequest(res, r.error);
      worker.kick();
      res.status(201).json({ import: r.import });
    })
  );

  router.post(
    "/law/sources/:id/dismiss",
    admin,
    handle("sources_dismiss", async (req, res) => {
      if (!(await LawRadar.dismissSource(req.params.id)))
        return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    })
  );

  router.get(
    "/law/recaps/latest",
    auth,
    handle("recap_latest", async (_req, res) =>
      res.json({ recap: await LawRecap.latest() })
    )
  );

  router.get(
    "/law/recaps",
    auth,
    handle("recap_week", async (req, res) => {
      const r = await LawRecap.byWeek(String(req.query.weekStart || ""));
      if (!r) return res.status(404).json({ error: "not_found" });
      res.json({ recap: r });
    })
  );

  router.post(
    "/law/recaps/:id/viewed",
    auth,
    handle("recap_viewed", async (req, res) => {
      await LawRecap.markViewed(req.params.id);
      res.json({ ok: true });
    })
  );

  router.get(
    "/law/push/key",
    auth,
    handle("push_key", async (_req, res) =>
      res.json({ publicKey: push.vapidKeys().publicKey })
    )
  );

  router.post(
    "/law/push/subscribe",
    auth,
    handle("push_subscribe", async (req, res) => {
      const r = await push.subscribe(reqBody(req) || {});
      if (r.error) return badRequest(res, r.error);
      res.status(201).json(r.subscription);
    })
  );

  router.post(
    "/law/push/unsubscribe",
    auth,
    handle("push_unsubscribe", async (req, res) => {
      res.json({ removed: await push.unsubscribe(reqBody(req)?.endpoint) });
    })
  );
}

module.exports = { lawRadarEndpoints };
