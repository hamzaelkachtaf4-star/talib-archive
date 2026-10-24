// Qanouni Collab, Phase B: Faculty Hub (public master notes), forks, التوثيق and public profiles
// (models/lawHub.js). Same consent requirement as the squad routes.
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawHub } = require("../../models/lawHub");
const { consented } = require("./collab");

const STATUS = {
  not_found: 404,
  not_in_squad: 409,
  own_squad_note: 409,
  session_exists: 409,
  cannot_endorse_own: 400,
  forbidden: 403,
};
const hub = [...auth, consented];
const me = (res) => res.locals.lawUser.id;
const reply = (name, fn, okStatus = 200) =>
  handle(name, async (req, res) => {
    const r = await fn(req, res);
    if (r?.error) return res.status(STATUS[r.error] || 400).json({ error: r.error });
    res.status(okStatus).json(r);
  });
const str = (v) => (typeof v === "string" ? v.slice(0, 200) : undefined);

function lawHubEndpoints(router) {
  router.get(
    "/law/hub/notes",
    hub,
    reply("hub_list", (req, res) =>
      LawHub.list(me(res), {
        cohort: str(req.query.cohort),
        module: str(req.query.module),
        professor: str(req.query.professor),
        q: str(req.query.q),
        sort: str(req.query.sort),
        type: str(req.query.type),
      })
    )
  );
  router.get("/law/hub/projects", hub, reply("hub_projects", (_req, res) => LawHub.projects(me(res))));
  router.get(
    "/law/hub/facets",
    hub,
    reply("hub_facets", (req, res) => LawHub.facets(me(res), { cohort: str(req.query.cohort) }))
  );
  router.get("/law/hub/notes/:id", hub, reply("hub_note", (req, res) => LawHub.get(me(res), req.params.id)));
  router.post(
    "/law/notes/:id/fork",
    hub,
    reply("note_fork", (req, res) => LawHub.fork(me(res), req.params.id, { workspaceId: str(reqBody(req)?.workspaceId) }), 201)
  );
  router.post("/law/notes/:id/endorse", hub, reply("note_endorse", (req, res) => LawHub.endorse(me(res), req.params.id)));
  router.patch(
    "/law/profile/public",
    hub,
    reply("profile_public", (req, res) => LawHub.setPublicProfile(me(res), reqBody(req)?.publicProfile))
  );
  router.get("/law/students/:userId", hub, reply("student_profile", (req, res) => LawHub.profile(me(res), req.params.userId)));
}

module.exports = { lawHubEndpoints };
