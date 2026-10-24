// Shared helpers for /api/law routes.
const { validatedRequest } = require("../../utils/middleware/validatedRequest");
const { rawDb } = require("../../utils/law/dbClient");
const { runAs, isAdmin } = require("../../utils/law/tenant");

// AI plumbing that students never see (docs/plans/qanouni.md §4): removed from every JSON response to a
// non-admin, wherever it appears (jobs, derivatives, critiques, usage).
const AI_FIELDS = new Set([
  "provider",
  "model",
  "tokensIn",
  "tokensOut",
  "estimatedCostUsd",
  "costUsd",
  "promptHash",
  "latencyMs",
  "lockedBy",
]);

function stripAiFields(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => stripAiFields(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value))
    if (!AI_FIELDS.has(k)) out[k] = stripAiFields(v, seen);
  return out;
}

/** The owner (first admin): the only user while multi-user mode is off. */
async function ownerUser() {
  return rawDb().users.findFirst({
    where: { role: "admin" },
    orderBy: { id: "asc" },
  });
}

/**
 * Resolves who is calling and runs the rest of the request as that user, so every LAW-OS query is
 * scoped to them (utils/law/tenant.js). Multi-user mode: the JWT user that validatedRequest loaded.
 * Single-user mode: the owner.
 */
async function lawUser(req, res, next) {
  try {
    const user = res.locals.multiUserMode ? res.locals.user : await ownerUser();
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.suspended) return res.status(403).json({ error: "suspended" });
    const role = user.role === "admin" ? "admin" : "default";
    res.locals.lawUser = { id: user.id, role };
    if (role !== "admin") {
      const json = res.json.bind(res);
      res.json = (body) => json(stripAiFields(body));
    }
    return runAs({ userId: user.id, role }, next);
  } catch (e) {
    console.error("[LAW-OS] user resolution failed:", e.message);
    return res.status(500).json({ error: "auth_failed" });
  }
}

function adminOnly(_req, res, next) {
  if (!isAdmin()) return res.status(403).json({ error: "admin_only" });
  return next();
}

const auth = [validatedRequest, lawUser];
const admin = [validatedRequest, lawUser, adminOnly];

/** Wraps an async handler: logs IDs/errors only (spec §12: never log content) and answers 500. */
function handle(name, fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e?.name === "LawTenantError")
        return !res.headersSent && res.status(404).json({ error: "not_found" });
      console.error(`[LAW-OS] ${name} failed:`, e.message);
      if (!res.headersSent) res.status(500).json({ error: `${name}_failed` });
    }
  };
}

function badRequest(res, error) {
  return res.status(error === "not_found" ? 404 : 400).json({ error });
}

module.exports = {
  auth,
  admin,
  lawUser,
  adminOnly,
  ownerUser,
  stripAiFields,
  handle,
  badRequest,
};
