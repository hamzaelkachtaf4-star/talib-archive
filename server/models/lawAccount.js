// Qanouni accounts (docs/plans/qanouni.md §2): an upstream `users` row (bcrypt hash, role, suspended) plus a
// LawUserProfile (email, name, study profile, Google link). Uses the unscoped client: accounts are not
// LAW-OS content, and sign-in happens before there is a user context.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { rawDb } = require("../utils/law/dbClient");
const { passwordPolicyError } = require("../utils/law/passwordPolicy");

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("qanouni-timing-equalizer", BCRYPT_ROUNDS);

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

function present(user, profile) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role === "admin" ? "admin" : "default",
    suspended: !!user.suspended,
    email: profile?.email || null,
    fullName: profile?.fullName || user.username,
    university: profile?.university || null,
    section: profile?.section || null,
    googleLinked: !!profile?.googleSub,
    facebookLinked: !!profile?.facebookId,
    publicProfile: !!profile?.publicProfile,
    createdAt: user.createdAt,
  };
}

/** A free upstream username from the email's local part (upstream: ^[a-z][a-z0-9._@-]*$, 2-64 chars). */
async function deriveUsername(email) {
  let base = normalizeEmail(email)
    .split("@")[0]
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40);
  if (!/^[a-z]/.test(base)) base = `u${base}`;
  if (base.length < 2) base = `${base}x`;
  for (let i = 0; i < 20; i++) {
    const name = i ? `${base}-${crypto.randomInt(1000, 9999)}` : base;
    if (!(await rawDb().users.findUnique({ where: { username: name } })))
      return name;
  }
  return `u-${crypto.randomUUID().slice(0, 12)}`;
}

function passwordError(password) {
  return passwordPolicyError(password);
}

const LawAccount = {
  BCRYPT_ROUNDS,
  normalizeEmail,
  present,
  passwordError,

  hashPassword(password) {
    return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
  },

  emailTaken: async function (email) {
    return !!(await rawDb().lawUserProfile.findUnique({
      where: { email: normalizeEmail(email) },
    }));
  },

  isMultiUserMode: async function () {
    const row = await rawDb().system_settings.findUnique({
      where: { label: "multi_user_mode" },
    });
    return row?.value === "true";
  },

  enableMultiUserMode: async function () {
    await rawDb().system_settings.upsert({
      where: { label: "multi_user_mode" },
      create: { label: "multi_user_mode", value: "true" },
      update: { value: "true" },
    });
  },

  get: async function (userId) {
    const user = await rawDb().users.findUnique({ where: { id: userId } });
    if (!user) return null;
    const profile = await rawDb().lawUserProfile.findUnique({
      where: { userId },
    });
    return present(user, profile);
  },

  /** The owner: first admin, created by the tenancy migration. */
  owner: async function () {
    return rawDb().users.findFirst({
      where: { role: "admin" },
      orderBy: { id: "asc" },
    });
  },

  /**
   * First-run: the owner gets an identity and a password, then multi-user mode is switched on.
   * Only possible while multi-user mode is off (the endpoint checks too).
   */
  setupOwner: async function ({
    fullName,
    email,
    password,
    university,
    section,
  }) {
    if (await this.isMultiUserMode()) return { error: "already_set_up" };
    const pwErr = passwordError(password);
    if (pwErr) return { error: pwErr };
    const owner = await this.owner();
    if (!owner) return { error: "no_owner" };
    const em = normalizeEmail(email);
    if (await rawDb().lawUserProfile.findUnique({ where: { email: em } }))
      return { error: "email_taken" };
    const username = await deriveUsername(em);
    await rawDb().users.update({
      where: { id: owner.id },
      data: {
        username,
        password: bcrypt.hashSync(String(password), BCRYPT_ROUNDS),
        lastUpdatedAt: new Date(),
      },
    });
    await rawDb().lawUserProfile.create({
      data: {
        userId: owner.id,
        email: em,
        fullName,
        ...(university ? { university } : {}),
        ...(section ? { section } : {}),
      },
    });
    await this.enableMultiUserMode();
    return { account: await this.get(owner.id), error: null };
  },

  /** A new student account (role default). */
  register: async function (
    {
      fullName,
      email,
      password,
      passwordHash = null,
      university,
      section,
      googleSub = null,
      facebookId = null,
    },
    { role = "default" } = {}
  ) {
    const em = normalizeEmail(email);
    // passwordHash: an email-verified sign-up whose password was checked and hashed before the code was sent.
    if (password !== null && !passwordHash) {
      const pwErr = passwordError(password);
      if (pwErr) return { error: pwErr };
    }
    if (await rawDb().lawUserProfile.findUnique({ where: { email: em } }))
      return { error: "email_taken" };
    // Google/Facebook-only accounts get a random password nobody knows; they can set one later.
    const secret =
      password === null
        ? crypto.randomBytes(32).toString("base64url")
        : password;
    const user = await rawDb().users.create({
      data: {
        username: await deriveUsername(em),
        password: passwordHash || bcrypt.hashSync(String(secret), BCRYPT_ROUNDS),
        role: role === "admin" ? "admin" : "default",
      },
    });
    try {
      await rawDb().lawUserProfile.create({
        data: {
          userId: user.id,
          email: em,
          fullName,
          googleSub,
          facebookId,
          ...(university ? { university } : {}),
          ...(section ? { section } : {}),
        },
      });
    } catch (e) {
      await rawDb().users.delete({ where: { id: user.id } });
      if (e?.code === "P2002") return { error: "email_taken" };
      throw e;
    }
    return { account: await this.get(user.id), error: null };
  },

  /** Email + password. One generic error for unknown email and wrong password (no account probing). */
  authenticate: async function (email, password) {
    const profile = await rawDb().lawUserProfile.findUnique({
      where: { email: normalizeEmail(email) },
    });
    const user = profile
      ? await rawDb().users.findUnique({ where: { id: profile.userId } })
      : null;
    const ok = bcrypt.compareSync(
      String(password || ""),
      user?.password && user.password.length === 60 ? user.password : DUMMY_HASH
    );
    if (!user || !ok) return { error: "invalid_credentials" };
    if (user.suspended) return { error: "suspended" };
    return { account: present(user, profile), error: null };
  },

  /**
   * Google: an existing email signs in (and is linked to this Google account on first use); a new email
   * becomes a student account when registration is open.
   * @param {{sub, email, emailVerified, name}} g verified token payload
   */
  googleSignIn: async function (g, { registrationOpen = true } = {}) {
    if (!g.emailVerified) return { error: "email_not_verified" };
    const em = normalizeEmail(g.email);
    const bySub = await rawDb().lawUserProfile.findUnique({
      where: { googleSub: g.sub },
    });
    const byEmail = await rawDb().lawUserProfile.findUnique({
      where: { email: em },
    });
    let profile = bySub || byEmail;
    if (byEmail && byEmail.googleSub && byEmail.googleSub !== g.sub)
      return { error: "google_account_mismatch" };
    if (!profile) {
      if (!registrationOpen) return { error: "registration_closed" };
      const r = await this.register(
        {
          fullName: g.name || em.split("@")[0],
          email: em,
          password: null,
          googleSub: g.sub,
        },
        { role: "default" }
      );
      if (r.error) return r;
      return { account: r.account, created: true, error: null };
    }
    // A verified Google email proves ownership; a Facebook binding made under an unproven email does not.
    if (!profile.googleSub || profile.facebookId)
      profile = await rawDb().lawUserProfile.update({
        where: { id: profile.id },
        data: { googleSub: profile.googleSub || g.sub, ...(profile.facebookId ? { facebookId: null } : {}) },
      });
    const user = await rawDb().users.findUnique({
      where: { id: profile.userId },
    });
    if (!user) return { error: "invalid_credentials" };
    if (user.suspended) return { error: "suspended" };
    return { account: present(user, profile), created: false, error: null };
  },

  /**
   * Facebook sign-in. Only the Facebook id identifies a returning user. Facebook gives no proof that its
   * email is verified, so an email match NEVER links to an existing account (that would let anyone claim
   * a victim's address and take the account over): the owner must sign in and link explicitly with
   * linkFacebook. A brand-new email becomes a student account when registration is open.
   * @param {{id, email, name}} fb verified token payload
   */
  facebookSignIn: async function (fb, { registrationOpen = true } = {}) {
    if (!fb.id || !fb.email) return { error: "invalid_facebook_token" };
    const em = normalizeEmail(fb.email);
    let profile = await rawDb().lawUserProfile.findUnique({
      where: { facebookId: fb.id },
    });
    if (!profile) {
      const taken = await rawDb().lawUserProfile.findUnique({ where: { email: em } });
      if (taken) return { error: "facebook_link_required" };
      if (!registrationOpen) return { error: "registration_closed" };
      const r = await this.register(
        {
          fullName: fb.name || em.split("@")[0],
          email: em,
          password: null,
          facebookId: fb.id,
        },
        { role: "default" }
      );
      if (r.error) return r;
      return { account: r.account, created: true, error: null };
    }
    const user = await rawDb().users.findUnique({
      where: { id: profile.userId },
    });
    if (!user) return { error: "invalid_credentials" };
    if (user.suspended) return { error: "suspended" };
    return { account: present(user, profile), created: false, error: null };
  },

  /** A signed-in user binds a verified Facebook identity to their own account (one Facebook id, one account). */
  linkFacebook: async function (userId, fb) {
    if (!fb?.id) return { error: "invalid_facebook_token" };
    const owner = await rawDb().lawUserProfile.findUnique({ where: { facebookId: fb.id } });
    if (owner && owner.userId !== userId) return { error: "facebook_account_mismatch" };
    const mine = await rawDb().lawUserProfile.findUnique({ where: { userId } });
    if (!mine) return { error: "invalid_credentials" };
    if (mine.facebookId && mine.facebookId !== fb.id) return { error: "facebook_account_mismatch" };
    if (!mine.facebookId)
      await rawDb().lawUserProfile.update({ where: { userId }, data: { facebookId: fb.id } });
    return { account: await this.get(userId), error: null };
  },

  updateProfile: async function (userId, { fullName, university, section }) {
    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (university !== undefined) data.university = university;
    if (section !== undefined) data.section = section;
    if (Object.keys(data).length)
      await rawDb().lawUserProfile.update({ where: { userId }, data });
    return this.get(userId);
  },

  changePassword: async function (userId, currentPassword, newPassword) {
    const user = await rawDb().users.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.password.length !== 60 ||
      !bcrypt.compareSync(String(currentPassword || ""), user.password)
    )
      return { error: "invalid_credentials" };
    const pwErr = passwordError(newPassword);
    if (pwErr) return { error: pwErr };
    await rawDb().users.update({
      where: { id: userId },
      data: {
        password: bcrypt.hashSync(String(newPassword), BCRYPT_ROUNDS),
        lastUpdatedAt: new Date(),
      },
    });
    return { error: null };
  },

  /** Password reset after an emailed code was verified (the endpoint checks the code). */
  resetPassword: async function (email, newPassword) {
    const pwErr = passwordError(newPassword);
    if (pwErr) return { error: pwErr };
    let profile = await rawDb().lawUserProfile.findUnique({
      where: { email: normalizeEmail(email) },
    });
    if (!profile) return { error: "invalid_code" };
    const user = await rawDb().users.findUnique({ where: { id: profile.userId } });
    if (!user) return { error: "invalid_code" };
    if (user.suspended) return { error: "suspended" };
    await rawDb().users.update({
      where: { id: user.id },
      data: {
        password: bcrypt.hashSync(String(newPassword), BCRYPT_ROUNDS),
        lastUpdatedAt: new Date(),
      },
    });
    // The emailed code proves the owner; any Facebook binding made earlier under this email is untrusted.
    if (profile.facebookId)
      profile = await rawDb().lawUserProfile.update({ where: { id: profile.id }, data: { facebookId: null } });
    return { account: present(user, profile), error: null };
  },

  list: async function () {
    const users = await rawDb().users.findMany({ orderBy: { id: "asc" } });
    const profiles = await rawDb().lawUserProfile.findMany();
    const byUser = new Map(profiles.map((p) => [p.userId, p]));
    return users.map((u) => present(u, byUser.get(u.id)));
  },

  /** Admin: change a user's role or suspension. An admin cannot lock themselves out. */
  adminUpdate: async function (actorId, userId, { role, suspended }) {
    if (actorId === userId) return { error: "cannot_change_self" };
    const user = await rawDb().users.findUnique({ where: { id: userId } });
    if (!user) return { error: "not_found" };
    const data = {};
    if (role !== undefined) data.role = role === "admin" ? "admin" : "default";
    if (suspended !== undefined) data.suspended = suspended ? 1 : 0;
    await rawDb().users.update({ where: { id: userId }, data });
    return { account: await this.get(userId), error: null };
  },
};

module.exports = { LawAccount };
