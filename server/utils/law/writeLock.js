// Qanouni: serialises the writes LAW-OS makes on its own while a page loads (first-use friend / invite codes,
// streak refresh, referral activation). On SQLite, Prisma runs update/upsert as a short read-then-write
// transaction; two of them started together on different pool connections can block each other until the
// query timeout (seen when the Profile page loads /profile, /referrals and /friends at once). One server
// process (Docker, the dv6), so an in-process queue is enough. Re-entrant: a locked function may call another.
const { AsyncLocalStorage } = require("node:async_hooks");

const inside = new AsyncLocalStorage();
let tail = Promise.resolve();

/** Runs fn after every previously queued locked write has finished (or immediately when already inside). */
function serialWrite(fn) {
  if (inside.getStore()) return fn();
  const run = tail.then(() => inside.run(true, fn));
  tail = run.catch(() => {});
  return run;
}

module.exports = { serialWrite };
