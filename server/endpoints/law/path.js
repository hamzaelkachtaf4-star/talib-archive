// Phase 9: /api/law/path/* (course path) and the admin editing routes.
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { LawPath } = require("../../models/lawPath");
const { LawCorpus } = require("../../models/lawCorpus");
const { rawDb } = require("../../utils/law/dbClient");
const { buildPathDocx } = require("../../utils/law/pathExport");
const { localDate } = require("../../utils/law/time");

const me = (res) => res.locals.lawUser.id;
const reply = (name, fn, okStatus = 200) =>
  handle(name, async (req, res) => {
    const r = await fn(req, res);
    if (r?.error) {
      const { error, status, ...rest } = r;
      return res.status(status || (error === "not_found" ? 404 : 400)).json({ error: { code: error, message: error, details: rest } });
    }
    if (r?.sent) return;
    res.status(okStatus).json(r);
  });

function lawPathEndpoints(router) {
  router.get("/law/path/semesters/:s/modules", auth, reply("path_modules", (req, res) => LawPath.modules(me(res), String(req.params.s).toUpperCase())));
  router.get("/law/path/modules/:id/graph", auth, reply("path_graph", (req, res) => LawPath.graph(me(res), req.params.id)));
  router.post("/law/path/nodes/:id/progress", auth, reply("path_progress", (req, res) => LawPath.setProgress(me(res), req.params.id, reqBody(req).state)));
  router.post("/law/path/nodes/:id/attach-hub-doc", auth, reply("path_pin", (req, res) => LawPath.attachHubDoc(me(res), req.params.id, reqBody(req).noteId), 201));
  router.delete("/law/path/nodes/:id/attach-hub-doc/:noteId", auth, reply("path_unpin", (req, res) => LawPath.detachHubDoc(me(res), req.params.id, req.params.noteId)));
  router.get("/law/path/modules/:id/export", auth, reply("path_export", async (req, res) => {
    const g = await LawPath.graph(me(res), req.params.id);
    if (g.error) return g;
    if (req.query.format === "pdf")
      return { error: "pdf_server_unavailable", status: 501, printUrl: `/law/path/modules/${g.module.id}/print`, hint: "use the print page (Arabic shaping needs the browser or headless Chromium)" };
    if (req.query.format && req.query.format !== "docx") return { error: "invalid_format" };
    const profile = await rawDb().lawUserProfile.findUnique({ where: { userId: me(res) }, select: { fullName: true } });
    const ids = [...new Set(g.nodes.flatMap((n) => n.legalRefs).filter((r) => r.exists).map((r) => r.canonicalId))];
    const resolved = ids.length ? await LawCorpus.resolve(ids) : {};
    const appendix = ids.map((id) => ({ canonicalId: id, text: resolved[id]?.text || "" })).filter((a) => a.text);
    const buf = await buildPathDocx({ student: profile?.fullName || "", module: g.module, nodes: g.nodes, appendix, date: localDate(new Date()) });
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="module-${g.module.semester}-${g.module.id.slice(-6)}.docx"`,
      "X-Content-Type-Options": "nosniff",
    });
    res.send(buf);
    return { sent: true };
  }));

  router.put("/law/admin/path/modules/:id/nodes", admin, reply("path_admin_nodes", (req) => LawPath.setNodes(req.params.id, reqBody(req).nodes)));
  router.put("/law/admin/path/modules/:id", admin, reply("path_admin_rename", (req) => LawPath.renameModule(req.params.id, reqBody(req).title)));
}

module.exports = { lawPathEndpoints };
