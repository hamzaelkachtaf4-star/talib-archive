// Qanouni profile: XP, level, streak, study hours, friend code and study buddies (models/lawProgress.js).
const { reqBody } = require("../../utils/http");
const { auth, handle, badRequest } = require("./helpers");
const { LawProgress } = require("../../models/lawProgress");
const { LawAccount } = require("../../models/lawAccount");
const { LawReferral } = require("../../models/lawReferral");
const { overLimit, recordHit } = require("./auth");

const STATUS = { invalid_friend_code: 404, cannot_add_self: 400, not_found: 404 };
const fail = (res, error) => res.status(STATUS[error] || 400).json({ error });

function lawProfileEndpoints(router) {
  router.get(
    "/law/profile",
    auth,
    handle("profile_get", async (_req, res) => {
      const userId = res.locals.lawUser.id;
      const [account, progress] = await Promise.all([
        LawAccount.get(userId),
        LawProgress.summary(userId),
      ]);
      res.json({ account, progress });
    })
  );

  // Phase C: my invite code and invitees (pending ones are re-checked for activation).
  router.get(
    "/law/referrals",
    auth,
    handle("referrals_mine", async (_req, res) => {
      res.json(await LawReferral.mine(res.locals.lawUser.id));
    })
  );

  router.get(
    "/law/friends",
    auth,
    handle("friends_list", async (_req, res) => {
      res.json(await LawProgress.friends(res.locals.lawUser.id));
    })
  );

  router.post(
    "/law/friends",
    auth,
    handle("friends_add", async (req, res) => {
      const userId = res.locals.lawUser.id;
      // Only misses count, so friend codes cannot be enumerated.
      if (overLimit("friend", null, `user:${userId}`))
        return res.status(429).json({ error: "too_many_attempts" });
      const r = await LawProgress.addFriend(userId, reqBody(req)?.code);
      if (r.error === "invalid_friend_code") recordHit("friend", null, `user:${userId}`);
      if (r.error) return fail(res, r.error);
      res.status(r.status === "pending" ? 201 : 200).json(r);
    })
  );

  router.post(
    "/law/friends/:id/respond",
    auth,
    handle("friends_respond", async (req, res) => {
      const r = await LawProgress.respond(
        res.locals.lawUser.id,
        req.params.id,
        reqBody(req)?.accept !== false
      );
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );

  router.delete(
    "/law/friends/:id",
    auth,
    handle("friends_remove", async (req, res) => {
      const r = await LawProgress.remove(res.locals.lawUser.id, req.params.id);
      if (r.error) return badRequest(res, r.error);
      res.json(r);
    })
  );
}

module.exports = { lawProfileEndpoints };
