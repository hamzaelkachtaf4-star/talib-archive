// RC3 Phase 7: the shareable friend code. Adding a friend by code stays on POST /api/law/friends (profile.js).
const { auth, handle } = require("./helpers");
const { LawProgress } = require("../../models/lawProgress");
const shareCode = require("../../utils/law/shareCode");

function lawFriendsEndpoints(router) {
  // The caller's XXXX-XXXX code and a WhatsApp URL for a message the client composes (it adds its own origin as the join link).
  router.get("/law/friends/code", auth, handle("friends_code", async (req, res) => {
    const code = await LawProgress.shareCode(res.locals.lawUser.id);
    if (!code) return res.status(404).json({ error: "not_found" });
    const message = typeof req.query.message === "string" ? req.query.message.slice(0, 500) : "";
    res.json({ shareCode: code, whatsappUrl: shareCode.whatsappUrl(message ? `${message} ${code}` : code) });
  }));
}

module.exports = { lawFriendsEndpoints };
