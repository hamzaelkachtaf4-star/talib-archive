// Abuse guard in front of every route that can reach the AI provider (RC2 1.1): a per-user cap on in-flight
// requests and a per-IP fixed-window rate limit. The user id always comes from the authenticated session
// (res.locals.lawUser), never from the body/query. Daily quota stays in aiQuota.js.
const MAX_IN_FLIGHT = () => Number(process.env.AI_MAX_IN_FLIGHT || 2);
const IP_PER_MINUTE = () => Number(process.env.AI_IP_PER_MINUTE || 60);

const inFlight = new Map(); // userId -> count
const windows = new Map(); // ip -> { start, n }

function ipHit(ip, now = Date.now()) {
  const w = windows.get(ip);
  if (!w || now - w.start >= 60000) {
    windows.set(ip, { start: now, n: 1 });
    if (windows.size > 5000) for (const [k, v] of windows) if (now - v.start >= 60000) windows.delete(k);
    return true;
  }
  w.n += 1;
  return w.n <= IP_PER_MINUTE();
}

function aiGuard(req, res, next) {
  const id = res.locals.lawUser?.id;
  if (id == null) return res.status(401).json({ error: "unauthorized" });
  if (!ipHit(req.ip || req.socket?.remoteAddress || "?")) {
    res.set("Retry-After", "60");
    return res.status(429).json({ error: { code: "rate_limited", message: "rate_limited" } });
  }
  const n = inFlight.get(id) || 0;
  if (n >= MAX_IN_FLIGHT()) {
    res.set("Retry-After", "5");
    return res.status(429).json({ error: { code: "too_many_in_flight", message: "too_many_in_flight" } });
  }
  inFlight.set(id, n + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const left = (inFlight.get(id) || 1) - 1;
    if (left <= 0) inFlight.delete(id); else inFlight.set(id, left);
  };
  res.on("finish", release);
  res.on("close", release);
  return next();
}

const resetAiGuard = () => { inFlight.clear(); windows.clear(); };

module.exports = { aiGuard, resetAiGuard };
