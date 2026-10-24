// Phase 3: /api/law/me/* (preferences + public profile / privacy).
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawPreferences } = require("../../models/lawPreferences");
const { LawOnboarding } = require("../../models/lawOnboarding");

const STATUS = { handle_taken: 409, not_found: 404 };
const fail = (res, error) => res.status(STATUS[error] || 400).json({ error });

function lawMeEndpoints(router) {
  router.get("/law/me/preferences", auth, handle("prefs_get", async (_req, res) => {
    res.json({ preferences: await LawPreferences.get(res.locals.lawUser.id) });
  }));
  router.patch("/law/me/preferences", auth, handle("prefs_update", async (req, res) => {
    const r = await LawPreferences.update(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.json({ preferences: r.preferences });
  }));
  router.get("/law/me/profile", auth, handle("me_profile_get", async (_req, res) => {
    const profile = await LawPreferences.getProfile(res.locals.lawUser.id);
    if (!profile) return fail(res, "not_found");
    res.json({ profile });
  }));
  router.patch("/law/me/profile", auth, handle("me_profile_update", async (req, res) => {
    const r = await LawPreferences.updateProfile(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.json({ profile: r.profile });
  }));

  // Phase 4: faculties, academic profile, onboarding wizard.
  router.get("/law/faculties", auth, handle("faculties_list", async (_req, res) => {
    res.json({ faculties: await LawOnboarding.faculties() });
  }));
  router.get("/law/me/academic", auth, handle("academic_get", async (_req, res) => {
    const academic = await LawOnboarding.getAcademic(res.locals.lawUser.id);
    if (!academic) return fail(res, "not_found");
    res.json({ academic });
  }));
  router.patch("/law/me/academic", auth, handle("academic_update", async (req, res) => {
    const r = await LawOnboarding.updateAcademic(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r.error);
    res.json({ academic: r.academic });
  }));
  router.get("/law/onboarding", auth, handle("onboarding_get", async (_req, res) => {
    const st = await LawOnboarding.state(res.locals.lawUser.id);
    if (!st) return fail(res, "not_found");
    res.json(st);
  }));
  router.post("/law/onboarding/step", auth, handle("onboarding_step", async (req, res) => {
    const b = reqBody(req);
    const r = await LawOnboarding.saveStep(res.locals.lawUser.id, b.step, b.data);
    if (r.error) return fail(res, r.error);
    res.json(r.state);
  }));
  router.post("/law/onboarding/complete", auth, handle("onboarding_complete", async (_req, res) => {
    const r = await LawOnboarding.complete(res.locals.lawUser.id);
    if (r.error) return res.status(r.error === "not_found" ? 404 : 400).json({ error: r.error, missing: r.missing });
    res.json({ completed: true });
  }));
}

module.exports = { lawMeEndpoints };
