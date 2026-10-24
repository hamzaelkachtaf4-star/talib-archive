// Fair-use quota for the legal chat (spec Phase 6.5). One counter row per student per local day
// (Africa/Casablanca, never a fixed offset). reserve() is a single conditional UPDATE (`count < limit`), so
// concurrent requests can never exceed the limit; refund() gives the turn back when OUR side failed.
const { rawDb } = require("./dbClient");
const { localDate, localTime, addDays } = require("./time");
const { LawSetting } = require("../../models/lawSetting");

class QuotaError extends Error {
  constructor(resetAt, limit) {
    super("AI_QUOTA_EXCEEDED");
    this.name = "QuotaError";
    this.code = "AI_QUOTA_EXCEEDED";
    this.resetAt = resetAt;
    this.limit = limit;
  }
}

/** The instant the next local day starts (zone-rule agnostic: scans a ±14h window for local 00:00). */
function nextLocalMidnight(now = new Date()) {
  const next = addDays(localDate(now), 1);
  const base = new Date(`${next}T00:00:00Z`).getTime();
  for (let h = -14; h <= 14; h++) {
    const t = new Date(base + h * 3600000);
    if (localDate(t) === next && localTime(t) === "00:00") return t;
  }
  return new Date(now.getTime() + 24 * 3600000);
}

/** per-student override, else the global setting (which falls back to AI_DAILY_LIMIT_DEFAULT, 25). */
async function limitFor(userId) {
  const p = await rawDb().lawUserProfile.findUnique({ where: { userId }, select: { aiDailyLimitOverride: true } });
  if (p?.aiDailyLimitOverride != null) return p.aiDailyLimitOverride;
  return Number(await LawSetting.get("aiDailyLimit"));
}

const adminsExempt = () => process.env.AI_QUOTA_ADMIN_EXEMPT !== "false";

async function isExempt(userId) {
  if (!adminsExempt()) return false;
  const u = await rawDb().users.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === "admin";
}

async function status(userId, now = new Date()) {
  const day = localDate(now);
  const limit = await limitFor(userId);
  const exempt = await isExempt(userId);
  const row = await rawDb().lawAiUsage.findUnique({ where: { userId_day: { userId, day } } });
  const used = row?.count || 0;
  return { used, limit, remaining: exempt ? null : Math.max(0, limit - used), unlimited: exempt, resetAt: nextLocalMidnight(now) };
}

/** Takes one turn or throws QuotaError. Returns a receipt for refund(). */
async function reserve(userId, now = new Date()) {
  const day = localDate(now);
  if (await isExempt(userId)) return { userId, day, exempt: true };
  const limit = await limitFor(userId);
  const db = rawDb();
  // Create today's row if missing (a concurrent creator losing the race is fine), then claim atomically.
  try {
    await db.lawAiUsage.create({ data: { userId, day, count: 0 } });
  } catch (e) {
    if (e.code !== "P2002") throw e;
  }
  const r = await db.lawAiUsage.updateMany({ where: { userId, day, count: { lt: limit } }, data: { count: { increment: 1 } } });
  if (r.count !== 1) throw new QuotaError(nextLocalMidnight(now), limit);
  return { userId, day, exempt: false };
}

/** Gives a turn back (only ever for our errors: provider down, budget). Never goes below zero. */
async function refund(receipt) {
  if (!receipt || receipt.exempt || receipt.refunded) return; // a receipt can be refunded once
  receipt.refunded = true;
  await rawDb().lawAiUsage.updateMany({ where: { userId: receipt.userId, day: receipt.day, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
}

/** Admin view: today's heaviest users. */
async function topUsage(now = new Date(), take = 10) {
  const rows = await rawDb().lawAiUsage.findMany({ where: { day: localDate(now) }, orderBy: { count: "desc" }, take });
  const profiles = await rawDb().lawUserProfile.findMany({ where: { userId: { in: rows.map((r) => r.userId) } }, select: { userId: true, fullName: true, email: true } });
  const by = new Map(profiles.map((p) => [p.userId, p]));
  return rows.map((r) => ({ userId: r.userId, count: r.count, name: by.get(r.userId)?.fullName || null, email: by.get(r.userId)?.email || null }));
}

module.exports = { QuotaError, nextLocalMidnight, limitFor, status, reserve, refund, topUsage };
