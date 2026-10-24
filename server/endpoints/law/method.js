const { reqBody } = require("../../utils/http");
const { auth, handle, badRequest } = require("./helpers");
const { aiGuard } = require("../../utils/law/aiGuard");
const { LawMethod } = require("../../models/lawMethod");
const { BudgetError, PermanentError } = require("../../utils/law/ai/errors");
const worker = require("../../utils/law/worker");

/** AI failures in synchronous calls → a clear status instead of a generic 500. */
function aiError(res, e) {
  if (e instanceof BudgetError)
    return res.status(402).json({ error: e.message, budget: true });
  if (e instanceof PermanentError)
    return res.status(503).json({ error: e.message });
  throw e;
}

function lawMethodEndpoints(router) {
  router.get(
    "/law/cases",
    auth,
    handle("cases_list", async (req, res) =>
      res.json({
        exercises: await LawMethod.listExercises({
          subjectId: req.query.subjectId,
        }),
      })
    )
  );

  router.post(
    "/law/cases",
    auth,
    handle("cases_create", async (req, res) => {
      const r = await LawMethod.createExercise(reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ exercise: r.exercise });
    })
  );

  router.get(
    "/law/cases/:id",
    auth,
    handle("cases_get", async (req, res) => {
      const e = await LawMethod.getExercise(req.params.id);
      if (!e) return res.status(404).json({ error: "not_found" });
      res.json({ exercise: e });
    })
  );

  router.post(
    "/law/cases/:id/attempts",
    auth,
    handle("attempt_start", async (req, res) => {
      const r = await LawMethod.startAttempt(req.params.id, reqBody(req) || {});
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ attempt: r.attempt });
    })
  );

  router.get(
    "/law/attempts/:id",
    auth,
    handle("attempt_get", async (req, res) => {
      const a = await LawMethod.getAttempt(req.params.id);
      if (!a) return res.status(404).json({ error: "not_found" });
      res.json({ attempt: a });
    })
  );

  router.patch(
    "/law/attempts/:id",
    auth,
    handle("attempt_save", async (req, res) => {
      const r = await LawMethod.savePhases(req.params.id, reqBody(req)?.phases);
      if (r.error) return badRequest(res, r.error);
      res.json({ attempt: r.attempt });
    })
  );

  router.post(
    "/law/attempts/:id/submit",
    auth,
    aiGuard,
    handle("attempt_submit", async (req, res) => {
      const r = await LawMethod.submit(req.params.id);
      if (r.error) return badRequest(res, r.error);
      worker.kick();
      res.json({ attempt: r.attempt, overtime: !!r.overtime });
    })
  );

  router.post(
    "/law/attempts/:id/model-answer",
    auth,
    aiGuard,
    handle("attempt_model_answer", async (req, res) => {
      try {
        const r = await LawMethod.modelAnswer(req.params.id);
        if (r.status === 409) return res.status(409).json({ error: r.error });
        if (r.error) return badRequest(res, r.error);
        res.json({ modelAnswer: r.modelAnswer });
      } catch (e) {
        aiError(res, e);
      }
    })
  );

  router.post(
    "/law/attempts/:id/cards",
    auth,
    handle("attempt_card", async (req, res) => {
      const r = await LawMethod.acceptSuggestedCard(
        req.params.id,
        Number(reqBody(req)?.index)
      );
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ card: r.card });
    })
  );

  router.get(
    "/law/dissertations",
    auth,
    handle("diss_list", async (_req, res) =>
      res.json({ dissertations: await LawMethod.listDissertations() })
    )
  );

  router.post(
    "/law/dissertations",
    auth,
    handle("diss_create", async (req, res) => {
      const r = await LawMethod.saveDissertation(null, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.status(201).json({ dissertation: r.dissertation });
    })
  );

  router.get(
    "/law/dissertations/:id",
    auth,
    handle("diss_get", async (req, res) => {
      const d = await LawMethod.getDissertation(req.params.id);
      if (!d) return res.status(404).json({ error: "not_found" });
      res.json({ dissertation: d });
    })
  );

  router.patch(
    "/law/dissertations/:id",
    auth,
    handle("diss_save", async (req, res) => {
      const r = await LawMethod.saveDissertation(req.params.id, reqBody(req));
      if (r.error) return badRequest(res, r.error);
      res.json({ dissertation: r.dissertation });
    })
  );

  router.post(
    "/law/dissertations/:id/check",
    auth,
    handle("diss_check", async (req, res) => {
      const r = await LawMethod.checkDissertation(req.params.id);
      if (r.error) return badRequest(res, r.error);
      res.json({ checklist: r.checklist });
    })
  );

  router.post(
    "/law/dissertations/:id/critique",
    auth,
    aiGuard,
    handle("diss_critique", async (req, res) => {
      const r = await LawMethod.requestDissertationCritique(req.params.id);
      if (r.status === 409) return res.status(409).json({ error: r.error });
      if (r.error) return badRequest(res, r.error);
      worker.kick();
      res.status(202).json({ job: r.job });
    })
  );

  router.get(
    "/law/drills/next",
    auth,
    handle("drills_next", async (req, res) =>
      res.json({
        cards: await LawMethod.nextDrills({ subjectId: req.query.subjectId }),
      })
    )
  );

  router.post(
    "/law/drills/:cardId/answer",
    auth,
    aiGuard,
    handle("drills_answer", async (req, res) => {
      try {
        const r = await LawMethod.judgeDrill(
          req.params.cardId,
          reqBody(req)?.answer
        );
        if (r.error) return badRequest(res, r.error);
        res.json(r.result);
      } catch (e) {
        aiError(res, e);
      }
    })
  );
}

module.exports = { lawMethodEndpoints };
