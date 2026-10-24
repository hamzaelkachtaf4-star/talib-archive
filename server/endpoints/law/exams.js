// RC3 Phase 4: /api/law/exam/* (exam dates, drills, readiness).
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawExam } = require("../../models/lawExam");
const { LawSharedExam } = require("../../models/lawSharedExam");
const { consented } = require("./collab");

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

function lawExamEndpoints(router) {
  // Talib v3: exams shared with the faculty (same notice requirement as the other student-to-student features).
  const shared = [...auth, consented];
  router.get("/law/exam/shared", shared, reply("exam_shared_list", (_req, res) => LawSharedExam.list(me(res))));
  router.post("/law/exam/shared", shared, reply("exam_shared_publish", (req, res) => LawSharedExam.publish(me(res), reqBody(req) || {}), 201));
  router.post("/law/exam/shared/:id/try", shared, reply("exam_shared_try", (req, res) => LawSharedExam.try(me(res), req.params.id, reqBody(req) || {}), 201));
  router.post("/law/exam/shared/:id/helpful", shared, reply("exam_shared_helpful", (req, res) => LawSharedExam.markHelpful(me(res), req.params.id)));
  router.delete("/law/exam/shared/:id", shared, reply("exam_shared_remove", (req, res) => LawSharedExam.remove(me(res), req.params.id)));

  router.get("/law/exam/dates", auth, reply("exam_dates", (_req, res) => LawExam.dates(me(res))));
  router.get("/law/exam/countdown", auth, reply("exam_countdown", (_req, res) => LawExam.countdown(me(res))));
  router.post("/law/exam/dates", auth, reply("exam_date_add", (req, res) => LawExam.addDate(me(res), reqBody(req)), 201));
  router.post("/law/exam/dates/import", auth, reply("exam_dates_import", (req, res) => LawExam.importDates(me(res), reqBody(req)), 201));
  router.patch("/law/exam/dates/:id", auth, reply("exam_date_edit", (req, res) => LawExam.updateDate(me(res), req.params.id, reqBody(req))));
  router.post("/law/exam/dates/:id/confirm", auth, reply("exam_date_confirm", (req, res) => LawExam.confirmDate(me(res), req.params.id, reqBody(req))));
  router.delete("/law/exam/dates/:id", auth, reply("exam_date_delete", (req, res) => LawExam.deleteDate(me(res), req.params.id)));

  router.get("/law/exam/readiness", auth, reply("exam_readiness", (req, res) => LawExam.readiness(me(res), req.query.semester ? String(req.query.semester).toUpperCase() : null)));
  router.get("/law/exam/modules/:moduleId/suggest", auth, reply("exam_suggest", (req, res) => LawExam.suggest(me(res), req.params.moduleId)));
  router.get("/law/exam/modules/:moduleId/drills", auth, reply("exam_drills", (req, res) => LawExam.listDrills(me(res), req.params.moduleId)));
  router.post("/law/exam/modules/:moduleId/drills", auth, reply("exam_drill_create", (req, res) => LawExam.createDrill(me(res), req.params.moduleId, reqBody(req)), 201));
  router.get("/law/exam/drills/:id", auth, reply("exam_drill_get", (req, res) => LawExam.getDrill(me(res), req.params.id)));
  router.post("/law/exam/drills/:id/check", auth, reply("exam_drill_check", (req, res) => LawExam.checkAnswer(me(res), req.params.id, reqBody(req))));
  router.post("/law/exam/drills/:id/submit", auth, reply("exam_drill_submit", (req, res) => LawExam.submitDrill(me(res), req.params.id, reqBody(req))));
  router.delete("/law/exam/drills/:id", auth, reply("exam_drill_delete", (req, res) => LawExam.deleteDrill(me(res), req.params.id)));
}

module.exports = { lawExamEndpoints };
