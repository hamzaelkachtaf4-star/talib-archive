// Atomic fixed-window counters (table LawRateCounter). hit() creates the row if needed, then increments with a
// single conditional UPDATE (`count < limit`), so parallel requests can never overshoot the limit.
const { rawDb } = require("./dbClient");
const { localDate } = require("./time");

/** key parts are joined with ":"; the day is appended (Africa/Casablanca) unless `window` is "none". */
async function hit(scope, id, limit, { now = new Date(), window = "day" } = {}) {
  const key = window === "none" ? `${scope}:${id}` : `${scope}:${id}:${localDate(now)}`;
  const db = rawDb();
  try {
    await db.lawRateCounter.create({ data: { key, count: 0 } });
  } catch (e) {
    if (e.code !== "P2002") throw e;
  }
  const r = await db.lawRateCounter.updateMany({ where: { key, count: { lt: limit } }, data: { count: { increment: 1 } } });
  return r.count === 1;
}

module.exports = { hit };
