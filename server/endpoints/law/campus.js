// RC3 Phase 7: the faculty wall and its moderation. /api/law/campus/*, /api/law/admin/campus/*.
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { consented } = require("./collab");
const { LawCampus } = require("../../models/lawCampus");

const member = [...auth, consented];
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

function lawCampusEndpoints(router) {
  router.get("/law/campus/posts", member, reply("campus_list", (req, res) => LawCampus.list(me(res), { kind: req.query.kind, before: req.query.before })));
  router.post("/law/campus/posts", member, reply("campus_post", (req, res) => LawCampus.create(me(res), res.locals.lawUser.role, reqBody(req)), 201));
  router.get("/law/campus/posts/:id", member, reply("campus_thread", (req, res) => LawCampus.thread(me(res), req.params.id)));
  router.delete("/law/campus/posts/:id", member, reply("campus_delete", (req, res) => LawCampus.remove(me(res), res.locals.lawUser.role, req.params.id)));
  router.post("/law/campus/posts/:id/report", member, reply("campus_report", (req, res) => LawCampus.report(me(res), req.params.id, reqBody(req).reason), 201));
  router.get("/law/admin/campus/queue", admin, reply("campus_queue", async () => ({ queue: await LawCampus.queue() })));
  router.post("/law/admin/campus/:id/decide", admin, reply("campus_decide", (req, res) => LawCampus.decide(me(res), req.params.id, reqBody(req).decision)));
}

module.exports = { lawCampusEndpoints };
