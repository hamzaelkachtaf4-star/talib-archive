// Phase 7: /api/law/social/* and /api/law/notifications.
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawSocial } = require("../../models/lawSocial");

const fail = (res, r) => {
  const { error, status } = r;
  return res.status(status || (error === "not_found" ? 404 : 400)).json({ error: { code: error, message: error } });
};
const uid = (req) => { const n = Number(req.params.userId); return Number.isInteger(n) && n > 0 ? n : null; };

function lawSocialEndpoints(router) {
  router.post("/law/social/follow/:userId", auth, handle("social_follow", async (req, res) => {
    const t = uid(req); if (!t) return fail(res, { error: "not_found" });
    const r = await LawSocial.follow(res.locals.lawUser.id, t);
    if (r.error) return fail(res, r);
    res.json({ status: r.status });
  }));
  router.delete("/law/social/follow/:userId", auth, handle("social_unfollow", async (req, res) => {
    const t = uid(req); if (!t) return fail(res, { error: "not_found" });
    res.json(await LawSocial.unfollow(res.locals.lawUser.id, t));
  }));
  router.get("/law/social/requests", auth, handle("social_requests", async (_req, res) => {
    res.json({ requests: await LawSocial.requests(res.locals.lawUser.id) });
  }));
  for (const [verb, accept] of [["accept", true], ["reject", false]])
    router.post(`/law/social/requests/:id/${verb}`, auth, handle(`social_${verb}`, async (req, res) => {
      const r = await LawSocial.decide(res.locals.lawUser.id, req.params.id, accept);
      if (r.error) return fail(res, r);
      res.json({ ok: true });
    }));
  router.post("/law/social/block/:userId", auth, handle("social_block", async (req, res) => {
    const t = uid(req); if (!t) return fail(res, { error: "not_found" });
    const r = await LawSocial.block(res.locals.lawUser.id, t);
    if (r.error) return fail(res, r);
    res.json({ ok: true });
  }));
  router.delete("/law/social/block/:userId", auth, handle("social_unblock", async (req, res) => {
    const t = uid(req); if (!t) return fail(res, { error: "not_found" });
    await LawSocial.unblock(res.locals.lawUser.id, t);
    res.json({ ok: true });
  }));
  router.get("/law/social/blocked", auth, handle("social_blocked", async (_req, res) => {
    res.json({ blocked: await LawSocial.blocked(res.locals.lawUser.id) });
  }));
  router.get("/law/social/friends", auth, handle("social_friends", async (_req, res) => {
    res.json({ friends: await LawSocial.friends(res.locals.lawUser.id) });
  }));
  router.get("/law/social/suggestions", auth, handle("social_suggestions", async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    res.json({ suggestions: await LawSocial.suggestions(res.locals.lawUser.id, { limit }) });
  }));
  router.get("/law/social/find", auth, handle("social_find", async (req, res) => {
    const r = await LawSocial.find(res.locals.lawUser.id, req.query.q);
    if (r?.error) return fail(res, r);
    res.json({ results: r });
  }));
  router.get("/law/social/config", auth, handle("social_config", async (_req, res) => {
    res.json({ contactMatch: LawSocial.flagOn(), hasPhone: await LawSocial.hasPhone(res.locals.lawUser.id) });
  }));
  router.post("/law/social/phone", auth, handle("social_phone", async (req, res) => {
    const r = await LawSocial.setPhone(res.locals.lawUser.id, reqBody(req).phone);
    if (r.error) return fail(res, r);
    res.json({ ok: true });
  }));
  router.delete("/law/social/phone", auth, handle("social_phone_del", async (_req, res) => {
    await LawSocial.removePhone(res.locals.lawUser.id);
    res.json({ ok: true });
  }));
  router.post("/law/social/contacts/match", auth, handle("social_contacts", async (req, res) => {
    const r = await LawSocial.matchContacts(res.locals.lawUser.id, reqBody(req).numbers);
    if (r.error) return fail(res, r);
    res.json({ matches: r.matches });
  }));
  router.get("/law/notifications", auth, handle("notifications", async (_req, res) => {
    res.json(await LawSocial.notifications(res.locals.lawUser.id));
  }));
  router.patch("/law/notifications/:id/read", auth, handle("notification_read", async (req, res) => {
    const r = await LawSocial.markOneRead(res.locals.lawUser.id, req.params.id);
    if (!r) return fail(res, { error: "not_found" });
    res.json(r);
  }));
  router.post("/law/notifications/read-all", auth, handle("notifications_read_all", async (_req, res) => {
    res.json(await LawSocial.markRead(res.locals.lawUser.id, null));
  }));
  router.post("/law/notifications/read", auth, handle("notifications_read", async (req, res) => {
    res.json(await LawSocial.markRead(res.locals.lawUser.id, reqBody(req).ids));
  }));
}

module.exports = { lawSocialEndpoints };
