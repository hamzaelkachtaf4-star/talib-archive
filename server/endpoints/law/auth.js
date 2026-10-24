// Qanouni sign-in (docs/plans/qanouni.md §2): email + password, Google, first-run owner setup, profile,
// and admin user management. Tokens are upstream's JWT ({ id, username }), so upstream's validatedRequest
// accepts them in multi-user mode. No response ever contains a password hash.
const Joi = require("joi");
const { reqBody, makeJWT } = require("../../utils/http");
const { validatedRequest } = require("../../utils/middleware/validatedRequest");
const { auth, admin, handle } = require("./helpers");
const { LawAccount } = require("../../models/lawAccount");
const { LawSetting } = require("../../models/lawSetting");
const {
  googleClientIds,
  verifyGoogleIdToken,
} = require("../../utils/law/googleAuth");
const {
  facebookAppId,
  verifyFacebookToken,
} = require("../../utils/law/facebookAuth");
const { asSystem } = require("../../utils/law/tenant");
const { LawEmailCode } = require("../../models/lawEmailCode");
const { LawReferral } = require("../../models/lawReferral");
const { sendCode, mailConfigured, supportEmail } = require("../../utils/law/mailer");

// ---- rate limiting (in memory; one process) --------------------------------------------------------
// Per account (email/user) the limits are strict. Per IP they are 5× looser: behind Tailscale Serve many
// students can share one address, and a class signing up together must not lock itself out.
const WINDOW_MS = 15 * 60 * 1000;
// otp: codes sent per email (registration + resend + reset); verify: code checks per IP (each code also
// locks itself after 5 wrong guesses, see models/lawEmailCode.js).
const LIMITS = {
  login: 10,
  register: 6,
  google: 20,
  facebook: 20,
  setup: 10,
  password: 10,
  otp: 5,
  verify: 10,
  qr: 12,
  friend: 10,
  squadJoin: 10,
  synth: 10,
};
const IP_FACTOR = 5;
const hits = new Map();

function keysFor(kind, ipKey, accountKey) {
  return [
    [ipKey && `${kind}:ip:${ipKey}`, LIMITS[kind] * IP_FACTOR],
    [accountKey && `${kind}:acct:${accountKey}`, LIMITS[kind]],
  ].filter(([k]) => k);
}

function recent(key, now = Date.now()) {
  return (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
}

/** True when any key is already over its limit (does not count this attempt). */
function overLimit(kind, ipKey, accountKey = null) {
  return keysFor(kind, ipKey, accountKey).some(
    ([k, max]) => recent(k).length >= max
  );
}

function recordHit(kind, ipKey, accountKey = null) {
  const now = Date.now();
  for (const [k] of keysFor(kind, ipKey, accountKey))
    hits.set(k, [...recent(k, now), now]);
  if (hits.size > 10000) hits.clear(); // bounded memory under abuse
}

/** Counts this attempt, then answers whether the caller is over the limit. */
function limited(kind, ipKey, accountKey = null) {
  const blocked = overLimit(kind, ipKey, accountKey);
  recordHit(kind, ipKey, accountKey);
  return blocked;
}

function resetRateLimits() {
  hits.clear();
}

// ---- validation -----------------------------------------------------------------------------------
const text = (max) => Joi.string().trim().min(1).max(max);
const schemas = {
  setup: Joi.object({
    fullName: text(120).required(),
    email: Joi.string().trim().email().max(254).required(),
    password: Joi.string().min(1).max(250).required(), // policy: utils/law/passwordPolicy.js
    university: text(160),
    section: text(160),
  }),
  register: Joi.object({
    fullName: text(120).required(),
    email: Joi.string().trim().email().max(254).required(),
    password: Joi.string().min(1).max(250).required(), // policy: utils/law/passwordPolicy.js
    university: text(160),
    section: text(160),
    referralCode: Joi.string().trim().max(20).allow(""), // Phase C invite code (ignored if unknown)
  }),
  verify: Joi.object({
    email: Joi.string().trim().email().max(254).required(),
    code: Joi.string().trim().pattern(/^\d{6}$/).required(),
  }),
  email: Joi.object({
    email: Joi.string().trim().email().max(254).required(),
  }),
  reset: Joi.object({
    email: Joi.string().trim().email().max(254).required(),
    code: Joi.string().trim().pattern(/^\d{6}$/).required(),
    newPassword: Joi.string().min(1).max(250).required(),
  }),
  login: Joi.object({
    email: Joi.string().trim().email().max(254).required(),
    password: Joi.string().max(250).required(),
  }),
  google: Joi.object({
    credential: Joi.string().min(20).max(8192).required(),
    referralCode: Joi.string().trim().max(20).allow(""),
  }),
  facebook: Joi.object({
    accessToken: Joi.string().min(10).max(8192).required(),
    referralCode: Joi.string().trim().max(20).allow(""),
  }),
  profile: Joi.object({
    fullName: text(120),
    university: text(160),
    section: text(160),
  }),
  password: Joi.object({
    currentPassword: Joi.string().max(250).required(),
    newPassword: Joi.string().min(1).max(250).required(),
  }),
  adminUpdate: Joi.object({
    role: Joi.string().valid("admin", "default"),
    suspended: Joi.boolean(),
  }),
};

function validate(name, body) {
  const { value, error } = schemas[name].validate(body || {}, {
    abortEarly: true,
    stripUnknown: true,
  });
  return error ? { error: error.details[0].message } : { value };
}

function session(account) {
  return {
    token: makeJWT(
      { id: account.id, username: account.username },
      process.env.JWT_EXPIRY || "30d"
    ),
    user: account,
  };
}

const ip = (req) => req.ip || req.socket?.remoteAddress || "unknown";

const STATUS = {
  invalid_credentials: 401,
  suspended: 403,
  email_taken: 409,
  already_set_up: 409,
  registration_closed: 403,
  google_not_configured: 501,
  google_account_mismatch: 409,
  email_not_verified: 403,
  facebook_link_required: 409,
  facebook_account_mismatch: 409,
  not_found: 404,
  cannot_change_self: 400,
  weak_password: 400,
  invalid_code: 400,
  code_expired: 410,
  locked: 423,
  cooldown: 429,
};
const fail = (res, error) => res.status(STATUS[error] || 400).json({ error });

/** Sends a code; the body tells the screen when "resend" unlocks. devCode only in local development. */
async function deliverCode(res, { email, purpose, issued, status = 202 }) {
  const minutes = Math.round(LawEmailCode.CODE_TTL_MS / 60000);
  let delivered = false;
  try {
    delivered = (await sendCode({ to: email, code: issued.code, purpose, minutes })).delivered;
  } catch (e) {
    console.error(`[LAW-OS] ${purpose} code email failed:`, e.message);
    return res.status(502).json({ error: "mail_failed" });
  }
  res.status(status).json({
    verification: "email",
    email,
    expiresInSec: minutes * 60,
    resendInSec: issued.resendInSec,
    delivered,
    // Local development and e2e test servers only (no mail transport configured): show the code on screen.
    ...(!delivered &&
    (process.env.NODE_ENV === "development" || process.env.QANOUNI_DEV_CODES === "true")
      ? { devCode: issued.code }
      : {}),
  });
}

const codeFail = (res, r) =>
  res.status(STATUS[r.error] || 400).json({
    error: r.error,
    ...(r.attemptsLeft !== undefined ? { attemptsLeft: r.attemptsLeft } : {}),
    ...(r.retryAfterSec !== undefined ? { retryAfterSec: r.retryAfterSec } : {}),
  });

async function registrationOpen() {
  return asSystem(() => LawSetting.get("registrationOpen"));
}

function lawAuthEndpoints(router) {
  // Public: what the sign-in screen should offer.
  router.get(
    "/law/auth/config",
    handle("auth_config", async (_req, res) => {
      const multiUser = await LawAccount.isMultiUserMode();
      res.json({
        multiUser,
        setupRequired: !multiUser,
        registrationOpen: multiUser && (await registrationOpen()),
        googleClientId: multiUser ? googleClientIds()[0] || null : null,
        facebookAppId: multiUser && process.env.FACEBOOK_APP_SECRET ? facebookAppId() : null,
        emailVerification: true,
        mailConfigured: mailConfigured(),
        supportEmail: supportEmail(),
      });
    })
  );

  // First run: the owner names themselves and sets a password; multi-user mode turns on. While the app
  // is still single-user, upstream's validatedRequest guards this (open only if no instance password).
  router.post(
    "/law/auth/setup",
    [validatedRequest],
    handle("auth_setup", async (req, res) => {
      if (limited("setup", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      if (await LawAccount.isMultiUserMode())
        return fail(res, "already_set_up");
      const v = validate("setup", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      if (!process.env.JWT_SECRET)
        return res.status(500).json({ error: "jwt_secret_missing" });
      const r = await LawAccount.setupOwner(v.value);
      if (r.error) return fail(res, r.error);
      res.json(session(r.account));
    })
  );

  // Sign-up, step 1: nothing is created yet. The checked, hashed sign-up waits with an emailed code.
  router.post(
    "/law/auth/register",
    handle("auth_register", async (req, res) => {
      const v = validate("register", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      const email = LawAccount.normalizeEmail(v.value.email);
      if (limited("register", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      if (!(await LawAccount.isMultiUserMode()))
        return res.status(409).json({ error: "setup_required" });
      if (!(await registrationOpen())) return fail(res, "registration_closed");
      const pwErr = LawAccount.passwordError(v.value.password);
      if (pwErr) return fail(res, pwErr);
      if (await LawAccount.emailTaken(email)) return fail(res, "email_taken");
      if (limited("otp", ip(req), email))
        return res.status(429).json({ error: "too_many_attempts" });
      const payload = {
        fullName: v.value.fullName,
        passwordHash: LawAccount.hashPassword(v.value.password),
        ...(v.value.university ? { university: v.value.university } : {}),
        ...(v.value.section ? { section: v.value.section } : {}),
        ...(v.value.referralCode ? { referralCode: v.value.referralCode } : {}),
      };
      const issued = await LawEmailCode.issue({ purpose: "register", email, payload });
      if (issued.error) return codeFail(res, issued);
      await deliverCode(res, { email, purpose: "register", issued });
    })
  );

  // Sign-up, step 2: the code creates the account and signs in.
  router.post(
    "/law/auth/register/verify",
    handle("auth_register_verify", async (req, res) => {
      const v = validate("verify", reqBody(req));
      if (v.error) return fail(res, "invalid_code");
      const email = LawAccount.normalizeEmail(v.value.email);
      if (limited("verify", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      const r = await LawEmailCode.verify({ purpose: "register", email, code: v.value.code });
      if (r.error) return codeFail(res, r);
      if (!r.payload?.passwordHash) return fail(res, "invalid_code");
      if (!(await registrationOpen())) return fail(res, "registration_closed");
      const { referralCode, ...signup } = r.payload;
      const created = await LawAccount.register({
        ...signup,
        email,
        password: undefined,
      });
      if (created.error) return fail(res, created.error);
      if (referralCode) await LawReferral.attach(created.account.id, referralCode).catch(() => {});
      res.status(201).json(session(created.account));
    })
  );

  router.post(
    "/law/auth/register/resend",
    handle("auth_register_resend", async (req, res) => {
      const v = validate("email", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      const email = LawAccount.normalizeEmail(v.value.email);
      if (limited("otp", ip(req), email))
        return res.status(429).json({ error: "too_many_attempts" });
      if (!(await LawEmailCode.pending({ purpose: "register", email })))
        return fail(res, "invalid_code");
      const issued = await LawEmailCode.issue({ purpose: "register", email });
      if (issued.error) return codeFail(res, issued);
      await deliverCode(res, { email, purpose: "register", issued });
    })
  );

  // Forgotten password: always the same answer, so the form never reveals which emails have accounts.
  router.post(
    "/law/auth/password/forgot",
    handle("auth_password_forgot", async (req, res) => {
      const v = validate("email", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      const email = LawAccount.normalizeEmail(v.value.email);
      if (limited("otp", ip(req), email))
        return res.status(429).json({ error: "too_many_attempts" });
      const generic = {
        verification: "email",
        email,
        expiresInSec: LawEmailCode.CODE_TTL_MS / 1000,
        resendInSec: LawEmailCode.RESEND_COOLDOWN_MS / 1000,
      };
      if (!(await LawAccount.emailTaken(email))) return res.status(202).json(generic);
      const issued = await LawEmailCode.issue({ purpose: "reset", email });
      if (issued.error === "locked") return codeFail(res, issued);
      if (issued.error) return res.status(202).json(generic); // cooldown: the last code is still valid
      await deliverCode(res, { email, purpose: "reset", issued });
    })
  );

  router.post(
    "/law/auth/password/reset",
    handle("auth_password_reset", async (req, res) => {
      const v = validate("reset", reqBody(req));
      if (v.error) return fail(res, "invalid_code");
      const email = LawAccount.normalizeEmail(v.value.email);
      // Checked first, so a weak new password does not burn one of the code's attempts.
      const pwErr = LawAccount.passwordError(v.value.newPassword);
      if (pwErr) return fail(res, pwErr);
      if (limited("verify", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      const r = await LawEmailCode.verify({ purpose: "reset", email, code: v.value.code });
      if (r.error) return codeFail(res, r);
      const done = await LawAccount.resetPassword(email, v.value.newPassword);
      if (done.error) return fail(res, done.error);
      res.json(session(done.account));
    })
  );

  router.post(
    "/law/auth/login",
    handle("auth_login", async (req, res) => {
      const v = validate("login", reqBody(req));
      if (v.error) return fail(res, "invalid_credentials");
      // Only failed sign-ins count, so a student who signs in often is never locked out.
      const email = LawAccount.normalizeEmail(v.value.email);
      if (overLimit("login", ip(req), email))
        return res.status(429).json({ error: "too_many_attempts" });
      if (!(await LawAccount.isMultiUserMode()))
        return res.status(409).json({ error: "setup_required" });
      const r = await LawAccount.authenticate(v.value.email, v.value.password);
      if (r.error === "invalid_credentials") recordHit("login", ip(req), email);
      if (r.error) return fail(res, r.error);
      res.json(session(r.account));
    })
  );

  router.post(
    "/law/auth/google",
    handle("auth_google", async (req, res) => {
      const v = validate("google", reqBody(req));
      if (v.error)
        return res.status(400).json({ error: "invalid_google_token" });
      if (limited("google", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      if (!(await LawAccount.isMultiUserMode()))
        return res.status(409).json({ error: "setup_required" });
      if (!googleClientIds().length) return fail(res, "google_not_configured");
      let g;
      try {
        g = await verifyGoogleIdToken(v.value.credential);
      } catch (e) {
        if (e.message === "google_not_configured")
          return fail(res, "google_not_configured");
        return res.status(401).json({ error: "invalid_google_token" });
      }
      const r = await LawAccount.googleSignIn(g, {
        registrationOpen: await registrationOpen(),
      });
      if (r.error) return fail(res, r.error);
      if (r.created && v.value.referralCode)
        await LawReferral.attach(r.account.id, v.value.referralCode).catch(() => {});
      res.status(r.created ? 201 : 200).json({
        ...session(r.account),
        created: r.created,
      });
    })
  );

  router.post(
    "/law/auth/facebook",
    handle("auth_facebook", async (req, res) => {
      const v = validate("facebook", reqBody(req));
      if (v.error)
        return res.status(400).json({ error: "invalid_facebook_token" });
      if (limited("facebook", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      if (!(await LawAccount.isMultiUserMode()))
        return res.status(409).json({ error: "setup_required" });
      let fb;
      try {
        fb = await verifyFacebookToken(v.value.accessToken);
      } catch (e) {
        return res.status(401).json({ error: "invalid_facebook_token" });
      }
      const r = await LawAccount.facebookSignIn(fb, {
        registrationOpen: await registrationOpen(),
      });
      if (r.error) return fail(res, r.error);
      if (r.created && v.value.referralCode)
        await LawReferral.attach(r.account.id, v.value.referralCode).catch(() => {});
      res.status(r.created ? 201 : 200).json({
        ...session(r.account),
        created: r.created,
      });
    })
  );

  router.post(
    "/law/auth/facebook/link",
    auth,
    handle("auth_facebook_link", async (req, res) => {
      const v = validate("facebook", reqBody(req));
      if (v.error) return res.status(400).json({ error: "invalid_facebook_token" });
      if (limited("facebook", ip(req)))
        return res.status(429).json({ error: "too_many_attempts" });
      let fb;
      try {
        fb = await verifyFacebookToken(v.value.accessToken);
      } catch {
        return res.status(401).json({ error: "invalid_facebook_token" });
      }
      const r = await LawAccount.linkFacebook(res.locals.lawUser.id, fb);
      if (r.error) return fail(res, r.error);
      res.json({ user: r.account });
    })
  );

  router.get(
    "/law/auth/me",
    auth,
    handle("auth_me", async (_req, res) => {
      res.json({ user: await LawAccount.get(res.locals.lawUser.id) });
    })
  );

  router.patch(
    "/law/auth/me",
    auth,
    handle("auth_me_update", async (req, res) => {
      const v = validate("profile", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      res.json({
        user: await LawAccount.updateProfile(res.locals.lawUser.id, v.value),
      });
    })
  );

  router.post(
    "/law/auth/password",
    auth,
    handle("auth_password", async (req, res) => {
      const v = validate("password", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      if (limited("password", null, `user:${res.locals.lawUser.id}`))
        return res.status(429).json({ error: "too_many_attempts" });
      const r = await LawAccount.changePassword(
        res.locals.lawUser.id,
        v.value.currentPassword,
        v.value.newPassword
      );
      if (r.error) return fail(res, r.error);
      res.json({ ok: true });
    })
  );

  router.get(
    "/law/admin/users",
    admin,
    handle("admin_users", async (_req, res) => {
      res.json({ users: await LawAccount.list() });
    })
  );

  router.patch(
    "/law/admin/users/:id",
    admin,
    handle("admin_user_update", async (req, res) => {
      const v = validate("adminUpdate", reqBody(req));
      if (v.error) return res.status(400).json({ error: v.error });
      const r = await LawAccount.adminUpdate(
        res.locals.lawUser.id,
        Number(req.params.id),
        v.value
      );
      if (r.error) return fail(res, r.error);
      res.json({ user: r.account });
    })
  );
}

module.exports = {
  lawAuthEndpoints,
  resetRateLimits,
  limited,
  overLimit,
  recordHit,
  session,
  ip,
};
