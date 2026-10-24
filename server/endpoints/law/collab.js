// Qanouni Collab: the legal notice (Phase 0) and study squads, module workspaces, master notes and squad
// decks (Phase A). Every squad route requires the current consent version (server-side, not only the modal).
const { aiGuard } = require("../../utils/law/aiGuard");
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawConsent } = require("../../models/lawConsent");
const { LawSquad } = require("../../models/lawSquad");
const { overLimit, recordHit, ip, limited } = require("./auth");
const { LawSessionSource } = require("../../models/lawSessionSource");
const { BudgetError, PermanentError } = require("../../utils/law/ai/errors");

const STATUS = {
  not_found: 404,
  not_in_squad: 404,
  invalid_invite_code: 404,
  squad_full: 409,
  already_in_squad: 409,
  already_member: 409,
  session_exists: 409,
  edit_conflict: 409,
  owner_only: 403,
  forbidden: 403,
  consent_required: 403,
  creator_only: 403,
  has_contributors: 409,
  media_not_allowed: 422,
  too_many_sources: 409,
  need_two_sources: 409,
};
const fail = (res, r) => {
  const { error, current } = r;
  return res.status(STATUS[error] || 400).json({ error, ...(current ? { current } : {}) });
};

async function consented(_req, res, next) {
  const c = await LawConsent.get(res.locals.lawUser.id);
  if (!c.accepted) return res.status(403).json({ error: "consent_required", version: c.version });
  return next();
}

const squad = [...auth, consented];
const me = (res) => res.locals.lawUser.id;
/** Wraps a model call: errors → status, otherwise the result as JSON. */
const reply = (name, fn, okStatus = 200) =>
  handle(name, async (req, res) => {
    const r = await fn(req, res);
    if (r?.error) return fail(res, r);
    res.status(okStatus).json(r);
  });

function lawCollabEndpoints(router) {
  // ---- Phase 0: legal notice ---------------------------------------------------------------------------
  router.get("/law/auth/consent", auth, reply("consent_get", (_req, res) => LawConsent.get(me(res))));
  router.post(
    "/law/auth/consent",
    auth,
    reply("consent_accept", (req, res) =>
      LawConsent.accept(me(res), reqBody(req) || {}, { ip: ip(req), userAgent: req.get("user-agent") })
    )
  );

  // ---- squads --------------------------------------------------------------------------------------------
  router.get(
    "/law/squads/my",
    squad,
    reply("squads_my", async (_req, res) => ({ ...((await LawSquad.my(me(res))) || { squad: null }) }))
  );
  router.post(
    "/law/squads/create",
    squad,
    reply("squads_create", async (req, res) => {
      const r = await LawSquad.create(me(res), reqBody(req) || {});
      return r.error ? r : LawSquad.my(me(res));
    }, 201)
  );
  router.patch(
    "/law/squads/settings",
    squad,
    reply("squads_settings", async (req, res) => {
      const r = await LawSquad.setSettings(me(res), reqBody(req) || {});
      return r.error ? r : { squad: (await LawSquad.my(me(res))).squad };
    })
  );
  router.get("/law/squads/public", squad, reply("squads_public", (req, res) => LawSquad.listPublic(me(res), req.query.q)));
  router.post(
    "/law/squads/public/:id/join",
    squad,
    reply("squads_public_join", async (req, res) => {
      const r = await LawSquad.joinPublic(me(res), req.params.id);
      return r.error ? r : LawSquad.my(me(res));
    })
  );
  router.post(
    "/law/squads/join",
    squad,
    handle("squads_join", async (req, res) => {
      // Only wrong codes count, so invite codes cannot be guessed.
      if (overLimit("squadJoin", ip(req), `user:${me(res)}`))
        return res.status(429).json({ error: "too_many_attempts" });
      const r = await LawSquad.join(me(res), reqBody(req)?.code);
      if (r.error === "invalid_invite_code") recordHit("squadJoin", ip(req), `user:${me(res)}`);
      if (r.error) return fail(res, r);
      res.json(await LawSquad.my(me(res)));
    })
  );
  router.post("/law/squads/leave", squad, reply("squads_leave", (_req, res) => LawSquad.leave(me(res))));
  router.delete(
    "/law/squads/members/:userId",
    squad,
    reply("squads_kick", (req, res) => LawSquad.removeMember(me(res), Number(req.params.userId)))
  );

  // ---- module workspaces ---------------------------------------------------------------------------------
  router.get(
    "/law/squads/workspaces",
    squad,
    reply("ws_list", async (_req, res) => ({ workspaces: await LawSquad.listWorkspaces(me(res)) }))
  );
  router.post(
    "/law/squads/workspaces",
    squad,
    reply("ws_create", (req, res) => LawSquad.createWorkspace(me(res), reqBody(req) || {}), 201)
  );
  router.delete(
    "/law/squads/workspaces/:id",
    squad,
    reply("ws_delete", (req, res) => LawSquad.deleteWorkspace(me(res), req.params.id))
  );

  // ---- master notes --------------------------------------------------------------------------------------
  router.get(
    "/law/squads/workspaces/:id/notes",
    squad,
    reply("notes_list", (req, res) => LawSquad.listNotes(me(res), req.params.id))
  );
  router.post(
    "/law/squads/workspaces/:id/notes",
    squad,
    reply("notes_create", (req, res) => LawSquad.createNote(me(res), req.params.id, reqBody(req) || {}), 201)
  );
  router.get("/law/squads/notes/:id", squad, reply("notes_get", (req, res) => LawSquad.getNote(me(res), req.params.id)));
  router.patch(
    "/law/squads/notes/:id",
    squad,
    reply("notes_update", (req, res) => LawSquad.updateNote(me(res), req.params.id, reqBody(req) || {}))
  );
  router.delete(
    "/law/squads/notes/:id",
    squad,
    reply("notes_delete", (req, res) => LawSquad.deleteNote(me(res), req.params.id))
  );

  // ---- Phase C: multi-source synthesis of one session ------------------------------------------------------
  router.get(
    "/law/squads/workspaces/:id/sessions/:n/sources",
    squad,
    reply("sources_list", (req, res) => LawSessionSource.list(me(res), req.params.id, req.params.n))
  );
  router.post(
    "/law/squads/workspaces/:id/sessions/:n/sources",
    squad,
    reply("sources_add", (req, res) => LawSessionSource.add(me(res), req.params.id, req.params.n, reqBody(req) || {}), 201)
  );
  router.delete("/law/squads/sources/:id", squad, reply("sources_delete", (req, res) => LawSessionSource.remove(me(res), req.params.id)));
  router.post(
    "/law/squads/workspaces/:id/sessions/:n/synthesize",
    squad,
    aiGuard,
    handle("sources_synthesize", async (req, res) => {
      if (limited("synth", null, `user:${me(res)}`)) return res.status(429).json({ error: "too_many_attempts" });
      let r;
      try {
        r = await LawSessionSource.synthesize(me(res), req.params.id, req.params.n);
      } catch (e) {
        if (e instanceof BudgetError) return res.status(402).json({ error: "ai_budget_reached", budget: true });
        if (e instanceof PermanentError) return res.status(503).json({ error: "ai_unavailable" });
        if (e?.name === "ProviderError") return res.status(502).json({ error: "ai_failed" });
        throw e;
      }
      if (r.error) return fail(res, r);
      res.json(r);
    })
  );

  // ---- squad decks ---------------------------------------------------------------------------------------
  router.get(
    "/law/squads/workspaces/:id/cards",
    squad,
    reply("cards_list", (req, res) => LawSquad.listCards(me(res), req.params.id))
  );
  router.post(
    "/law/squads/workspaces/:id/cards",
    squad,
    reply("cards_create", (req, res) => LawSquad.createCard(me(res), req.params.id, reqBody(req) || {}), 201)
  );
  router.post(
    "/law/squads/workspaces/:id/cards/subscribe",
    squad,
    reply("cards_subscribe", (req, res) => LawSquad.subscribe(me(res), req.params.id))
  );
  router.patch(
    "/law/squads/cards/:id",
    squad,
    reply("cards_update", (req, res) => LawSquad.updateCard(me(res), req.params.id, reqBody(req) || {}))
  );
  router.delete(
    "/law/squads/cards/:id",
    squad,
    reply("cards_delete", (req, res) => LawSquad.deleteCard(me(res), req.params.id))
  );
}

module.exports = { lawCollabEndpoints, consented };
