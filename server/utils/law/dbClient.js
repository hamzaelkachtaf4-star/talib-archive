// Single indirection for the Prisma client used by LAW-OS models. Production uses the shared upstream
// client; integration tests swap in a client pointed at a throwaway SQLite file (see __tests__/law/helpers).
// db() is scoped to the current user (utils/law/tenant.js); rawDb() is the unscoped client, for code that
// must see every user's rows on purpose (the worker's job claim, the global AI budget, signed URLs).
const { scopedExtension } = require("./tenant");

let current = null;
let scoped = null;

function rawDb() {
  if (!current) current = require("../prisma");
  return current;
}

function db() {
  const base = rawDb();
  // Unit tests may install a hand-written mock without $extends: it has no other users to leak.
  if (typeof base.$extends !== "function") return base;
  if (!scoped || scoped.base !== base)
    scoped = { base, client: base.$extends(scopedExtension(base)) };
  return scoped.client;
}

function setDb(client) {
  current = client;
  scoped = null;
}

module.exports = { db, rawDb, setDb };
