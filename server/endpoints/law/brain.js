// Phase 10: /api/law/brain/* (learner memory, drills), /api/law/ai/messages/:id/corrections and the admin taxonomy,
// corrections and aggregates. Admins never read an individual student's memories: only k>=20 aggregates.
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { aiGuard } = require("../../utils/law/aiGuard");
const { LawBrain } = require("../../models/lawBrain");
const { LawTutorBrain } = require("../../models/lawTutorBrain");

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

function lawBrainEndpoints(router) {
  router.get("/law/brain/me", auth, reply("brain_me", (req, res) => LawBrain.list(me(res))));
  router.get("/law/brain/me/export", auth, handle("brain_export", async (req, res) => {
    res.set({ "Content-Disposition": 'attachment; filename="my-memory.json"', "X-Content-Type-Options": "nosniff" });
    res.json(await LawBrain.exportAll(me(res)));
  }));
  router.patch("/law/brain/me/:id", auth, reply("brain_dismiss", (req, res) => (reqBody(req).status === "DISMISSED" ? LawBrain.dismiss(me(res), req.params.id) : { error: "invalid_status" })));
  router.delete("/law/brain/me/:id", auth, reply("brain_delete", (req, res) => LawBrain.remove(me(res), req.params.id)));
  router.delete("/law/brain/me", auth, reply("brain_reset", (req, res) => LawBrain.resetAll(me(res))));
  router.get("/law/brain/today", auth, reply("brain_today", (req, res) => LawBrain.todayPoint(me(res))));
  router.get("/law/brain/drills", auth, reply("brain_drills", async (req, res) => ({ drills: await LawBrain.drills(me(res), { limit: Math.min(10, Math.max(1, Number(req.query.limit) || 5)) }) })));
  router.post("/law/brain/drills/generate", auth, aiGuard, reply("brain_drill_generate", (req, res) => LawBrain.generateDrill(me(res), reqBody(req).pairId), 201));
  router.post("/law/brain/drills/:id/answer", auth, reply("brain_drill_answer", (req, res) => LawBrain.answerDrill(me(res), req.params.id, reqBody(req).optionIndex)));
  router.post("/law/brain/drills/:id/report", auth, reply("brain_drill_report", (req, res) => LawBrain.reportDrill(me(res), req.params.id)));
  router.get("/law/brain/taxonomy", auth, reply("brain_taxonomy", async () => { const t = await LawBrain.taxonomy(); return { pairs: t.pairs.map((p) => ({ id: p.id, labelAr: p.labelAr })) }; }));

  router.post("/law/ai/messages/:id/corrections", auth, aiGuard, reply("ai_correction", (req, res) => LawTutorBrain.report(me(res), req.params.id, reqBody(req)), 201));
  router.get("/law/ai/corrections", auth, reply("ai_corrections_mine", async (req, res) => ({ corrections: await LawTutorBrain.mine(me(res)) })));

  router.get("/law/admin/corrections", admin, reply("adm_corrections", async (req) => ({ corrections: await LawTutorBrain.list(req.query.status) })));
  router.post("/law/admin/corrections/:id/decide", admin, reply("adm_correction_decide", (req, res) => LawTutorBrain.decide(me(res), req.params.id, reqBody(req))));
  router.get("/law/admin/concepts", admin, reply("adm_concepts", async () => LawBrain.taxonomy()));
  router.post("/law/admin/concepts", admin, reply("adm_concept_create", (req) => LawBrain.createConcept(reqBody(req)), 201));
  router.patch("/law/admin/concepts/:id", admin, reply("adm_concept_update", (req) => LawBrain.updateConcept(req.params.id, reqBody(req))));
  router.post("/law/admin/confusion-pairs", admin, reply("adm_pair_create", (req) => LawBrain.createPair(reqBody(req)), 201));
  router.patch("/law/admin/confusion-pairs/:id", admin, reply("adm_pair_update", (req) => LawBrain.updatePair(req.params.id, reqBody(req))));
  router.post("/law/admin/drill-items", admin, reply("adm_drill_create", (req) => LawBrain.createDrillItem(reqBody(req), { source: "BANK", reviewed: !!reqBody(req).reviewed }), 201));
  router.get("/law/admin/drill-items", admin, reply("adm_drill_list", async () => ({ items: await LawBrain.listDrillItems() })));
  router.patch("/law/admin/drill-items/:id", admin, reply("adm_drill_update", (req) => LawBrain.updateDrillItem(req.params.id, reqBody(req))));
  router.get("/law/admin/brain/aggregates", admin, reply("adm_brain_aggregates", async (req) => LawBrain.aggregates(req.query.semester)));
}

module.exports = { lawBrainEndpoints };
