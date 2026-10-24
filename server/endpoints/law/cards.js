const { reqBody } = require("../../utils/http");
const { auth, handle, badRequest } = require("./helpers");
const { LawFlashcard } = require("../../models/lawFlashcard");
const { LawReview } = require("../../models/lawReview");
const { LawReferral } = require("../../models/lawReferral");

function lawCardEndpoints(router) {
  router.get(
    "/law/cards/due",
    auth,
    handle("cards_due", async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      res.json(
        await LawFlashcard.dueQueue({
          subjectId: req.query.subjectId || undefined,
          limit,
        })
      );
    })
  );

  router.get(
    "/law/cards/offline-pack",
    auth,
    handle("cards_offline_pack", async (_req, res) => {
      res.json(await LawFlashcard.offlinePack());
    })
  );

  router.get(
    "/law/cards/stats",
    auth,
    handle("cards_stats", async (_req, res) => {
      res.json(await LawFlashcard.stats());
    })
  );

  router.get(
    "/law/cards",
    auth,
    handle("cards_browse", async (req, res) => {
      const take = Math.min(Math.max(Number(req.query.take) || 100, 1), 500);
      const skip = Math.max(Number(req.query.skip) || 0, 0);
      res.json(
        await LawFlashcard.browse({
          subjectId: req.query.subjectId || undefined,
          q: req.query.q || undefined,
          take,
          skip,
        })
      );
    })
  );

  router.post(
    "/law/cards",
    auth,
    handle("cards_create", async (req, res) => {
      const { card, error } = await LawFlashcard.create(reqBody(req));
      if (error) return badRequest(res, error);
      res.status(201).json({ card });
    })
  );

  router.patch(
    "/law/cards/:id",
    auth,
    handle("cards_update", async (req, res) => {
      const { card, error } = await LawFlashcard.update(
        req.params.id,
        reqBody(req)
      );
      if (error) return badRequest(res, error);
      res.json({ card });
    })
  );

  router.delete(
    "/law/cards/:id",
    auth,
    handle("cards_delete", async (req, res) => {
      if (!(await LawFlashcard.remove(req.params.id)))
        return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    })
  );

  // Idempotent by clientReviewId; returns recomputed card states (spec §9.6).
  router.post(
    "/law/reviews/batch",
    auth,
    handle("reviews_batch", async (req, res) => {
      const { logs, deviceId } = reqBody(req) || {};
      const result = await LawReview.submitBatch(logs, {
        deviceId: deviceId || null,
      });
      if (result.error) return badRequest(res, result.error);
      // Phase C: real study may activate this student's referral (never fails the sync).
      await LawReferral.checkActivation(res.locals.lawUser.id).catch(() => {});
      res.json(result);
    })
  );

  router.get(
    "/law/streak",
    auth,
    handle("streak", async (_req, res) => {
      res.json({ streak: await LawReview.streak() });
    })
  );
}

module.exports = { lawCardEndpoints };
