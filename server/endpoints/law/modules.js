// RC3 Phase 3: /api/law/modules/* (a student's module workspace). The semester list itself is /api/law/path/semesters/:s/modules.
const { LawConsent } = require("../../models/lawConsent");
const { LawMentorMemory } = require("../../models/lawMentorMemory");
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { rawDb } = require("../../utils/law/dbClient");
const { LawModule } = require("../../models/lawModule");
const { LawModuleMentor } = require("../../models/lawModuleMentor");
const { LawCorpusUser } = require("../../models/lawCorpusUser");

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

async function scopeOf(userId) {
  const p = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { facultyCode: true, track: true, studyLang: true } });
  return p?.facultyCode && p.track && p.studyLang ? { facultyCode: p.facultyCode, track: p.track, language: p.studyLang } : null;
}

function lawModuleEndpoints(router) {
  router.get("/law/modules", auth, reply("module_list", (req, res) => LawModule.listFor(me(res), String(req.query.semester || "").toUpperCase())));
  router.post("/law/modules", auth, reply("module_add", async (req, res) => {
    const scope = await scopeOf(me(res));
    if (!scope) return { error: "academic_profile_required", status: 409 };
    const b = reqBody(req);
    return LawModule.addCustom(me(res), scope, String(b.semester || "").toUpperCase(), b.title);
  }, 201));
  router.patch("/law/modules/:id", auth, reply("module_edit", async (req, res) => {
    const b = reqBody(req);
    if (b.confirm === true) return LawModule.confirm(me(res), req.params.id);
    return LawModule.rename(me(res), req.params.id, b.title);
  }));
  router.delete("/law/modules/:id", auth, reply("module_delete", (req, res) => LawModule.remove(me(res), req.params.id)));
  router.get("/law/modules/:id/profile", auth, reply("module_profile", (req, res) => LawModule.getProfile(me(res), req.params.id)));
  router.put("/law/modules/:id/profile", auth, reply("module_profile_save", async (req, res) => {
    const b = reqBody(req);
    // Making a subject public exposes the student to the faculty: the same legal notice as the other shared features applies.
    if (b && b.isPublic === true && !(await LawConsent.get(me(res))).accepted) return { error: "consent_required", status: 403 };
    return LawModule.saveProfile(me(res), req.params.id, b);
  }));
  router.get("/law/modules/:id/professor", auth, reply("module_professor", (req, res) => LawModule.getProfessor(me(res), req.params.id)));
  router.put("/law/modules/:id/professor", auth, reply("module_professor_save", (req, res) => LawModule.saveProfessor(me(res), req.params.id, reqBody(req))));
  router.get("/law/modules/:id/tree", auth, reply("module_tree", (req, res) => LawModule.tree(me(res), req.params.id)));
  router.post("/law/modules/:id/nodes", auth, reply("module_node_add", (req, res) => LawModule.addNode(me(res), req.params.id, reqBody(req)), 201));
  router.patch("/law/modules/:id/nodes/:nodeId", auth, reply("module_node_edit", (req, res) => LawModule.updateNode(me(res), req.params.id, req.params.nodeId, reqBody(req))));
  router.post("/law/modules/:id/nodes/:nodeId/report", auth, reply("module_node_report", (req, res) => LawModule.reportNode(me(res), req.params.id, req.params.nodeId, reqBody(req)), 201));
  router.delete("/law/modules/:id/nodes/:nodeId", auth, reply("module_node_delete", (req, res) => LawModule.deleteNode(me(res), req.params.id, req.params.nodeId)));
  router.get("/law/modules/:id/sources", auth, reply("module_sources", (req, res) => LawModule.sources(me(res), req.params.id)));
  router.post("/law/modules/:id/sources", auth, reply("module_source_add", (req, res) => LawModule.addSource(me(res), req.params.id, reqBody(req)), 201));
  router.get("/law/modules/:id/sources/:sid", auth, reply("module_source_get", (req, res) => LawModule.sourceText(me(res), req.params.id, req.params.sid)));
  router.patch("/law/modules/:id/sources/:sid", auth, reply("module_source_edit", (req, res) => LawModule.editSource(me(res), req.params.id, req.params.sid, reqBody(req))));
  router.delete("/law/modules/:id/sources/:sid", auth, reply("module_source_delete", (req, res) => LawModule.deleteSource(me(res), req.params.id, req.params.sid)));
  router.get("/law/modules/:id/memory", auth, reply("module_memory", (req, res) => LawMentorMemory.list(me(res), req.params.id)));
  router.post("/law/modules/:id/memory", auth, reply("module_memory_add", (req, res) => LawMentorMemory.add(me(res), req.params.id, reqBody(req), reqBody(req)?.source), 201));
  router.delete("/law/modules/:id/memory/:noteId", auth, reply("module_memory_delete", (req, res) => LawMentorMemory.remove(me(res), req.params.id, req.params.noteId)));
  router.post("/law/modules/:id/mentor", auth, reply("module_mentor", (req, res) => LawModuleMentor.ask(me(res), req.params.id, reqBody(req))));
  router.get("/law/modules/:id/proposals", auth, reply("module_proposals", (req, res) => LawModuleMentor.proposals(me(res), req.params.id, req.query.status)));
  router.post("/law/modules/:id/proposals/:pid/accept", auth, reply("module_proposal_accept", (req, res) => LawModuleMentor.accept(me(res), req.params.id, req.params.pid)));
  router.post("/law/modules/:id/proposals/:pid/reject", auth, reply("module_proposal_reject", (req, res) => LawModuleMentor.reject(me(res), req.params.id, req.params.pid)));
  router.get("/law/modules/:id/articles", auth, reply("module_articles", (req, res) => LawCorpusUser.moduleArticles(me(res), req.params.id)));
  router.put("/law/modules/:id/articles/:canonicalId", auth, reply("module_article_link", (req, res) => LawCorpusUser.linkArticle(me(res), req.params.id, req.params.canonicalId)));
  router.delete("/law/modules/:id/articles/:canonicalId", auth, reply("module_article_unlink", (req, res) => LawCorpusUser.unlinkArticle(me(res), req.params.id, req.params.canonicalId)));
  router.get("/law/modules/:id/recap", auth, reply("module_recap", (req, res) => LawModule.recap(me(res), req.params.id)));
}

module.exports = { lawModuleEndpoints };
