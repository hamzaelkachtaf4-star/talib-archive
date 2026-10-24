// Qanouni QR quick login (models/lawQrLogin.js). The QR holds a link to /law/qr/<token>, so the in-app
// scanner and any phone camera both lead to the approval screen of a signed-in Qanouni.
const QRCode = require("qrcode");
const { reqBody } = require("../../utils/http");
const { auth, handle } = require("./helpers");
const { LawQrLogin } = require("../../models/lawQrLogin");
const { LawAccount } = require("../../models/lawAccount");
const { limited, session, ip } = require("./auth");

const STATUS = { qr_invalid: 404, suspended: 403, setup_required: 409 };
const fail = (res, error) => res.status(STATUS[error] || 400).json({ error });

/** The origin the QR link points at: the requesting page's own origin when it is a plain http(s) one. */
function linkOrigin(req) {
  const given = reqBody(req)?.origin;
  try {
    const u = new URL(String(given));
    if ((u.protocol === "https:" || u.protocol === "http:") && u.origin.length <= 200)
      return u.origin;
  } catch {}
  return `${req.protocol}://${req.get("host")}`;
}

function lawQrEndpoints(router) {
  router.post(
    "/law/auth/qr/generate",
    handle("qr_generate", async (req, res) => {
      if (limited("qr", ip(req))) return res.status(429).json({ error: "too_many_attempts" });
      if (!(await LawAccount.isMultiUserMode())) return fail(res, "setup_required");
      const { qrToken, pollSecret, expiresAt } = await LawQrLogin.create({
        userAgent: req.get("user-agent") || "",
      });
      const link = `${linkOrigin(req)}/law/qr/${qrToken}`;
      const svg = await QRCode.toString(link, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
      });
      res.status(201).json({ qrToken, pollSecret, link, svg, expiresAt });
    })
  );

  // Polled by the waiting device (every ~2 s). The poll secret travels in a header, never in the URL.
  router.get(
    "/law/auth/qr/status/:qrToken",
    handle("qr_status", async (req, res) => {
      const r = await LawQrLogin.poll(req.params.qrToken, req.get("x-qr-secret"));
      if (r.error) return fail(res, r.error);
      if (r.status !== "approved") return res.json({ status: r.status });
      const account = await LawAccount.get(r.userId);
      if (!account) return fail(res, "qr_invalid");
      if (account.suspended) return fail(res, "suspended");
      res.json({ status: "approved", ...session(account) });
    })
  );

  router.post(
    "/law/auth/qr/inspect",
    auth,
    handle("qr_inspect", async (req, res) => {
      const r = await LawQrLogin.inspect(reqBody(req)?.qrToken);
      if (r.error) return fail(res, r.error);
      res.json(r);
    })
  );

  router.post(
    "/law/auth/qr/authorize",
    auth,
    handle("qr_authorize", async (req, res) => {
      const { qrToken, approve = true } = reqBody(req) || {};
      if (limited("qr", null, `user:${res.locals.lawUser.id}`))
        return res.status(429).json({ error: "too_many_attempts" });
      const r = await LawQrLogin.decide(qrToken, res.locals.lawUser.id, approve !== false);
      if (r.error) return fail(res, r.error);
      res.json({ ok: true, approved: approve !== false });
    })
  );
}

module.exports = { lawQrEndpoints };
