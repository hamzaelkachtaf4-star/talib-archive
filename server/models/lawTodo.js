// The student's daily to-do list (RC3 Phase 2). Offline-first: devices create todos with a clientId and push batches;
// the server upserts by (userId, clientId) so a retried push never duplicates, and resolves conflicts last-write-wins
// on the client's edit time (`updatedAt`). Deletes are soft (deletedAt) so they reach the student's other devices.
const { rawDb } = require("../utils/law/dbClient");
const { serialWrite } = require("../utils/law/writeLock");
const { TODO_KINDS, TODO_REF_TYPES, TODO_PRIORITIES, isOneOf } = require("../utils/law/enums");

const MAX_BATCH = 200;
const MAX_TITLE = 300;
const MAX_ROWS = 3000; // stored todos per student (soft-deleted and archived ones do not count)
const ARCHIVE_MS = 90 * 24 * 3600 * 1000; // a finished todo older than this is removed
const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const PURGE_MS = 30 * 24 * 3600 * 1000; // soft-deleted rows older than this are removed for good

const present = (t) => ({
  clientId: t.clientId,
  title: t.title,
  kind: t.kind,
  refType: t.refType,
  refId: t.refId,
  dueDate: t.dueDate,
  priority: t.priority,
  done: t.done,
  doneAt: t.doneAt,
  sortOrder: t.sortOrder,
  deletedAt: t.deletedAt,
  updatedAt: t.updatedAt,
});

function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** null for absent, undefined for invalid. Only ISO-like strings count: numbers and booleans are not timestamps. */
const when = (v) => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Validates one pushed item. Returns { error } or { data } with only server-controlled fields. */
function clean(raw, now) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "bad_item" };
  if (typeof raw.clientId !== "string" || !CLIENT_ID.test(raw.clientId)) return { error: "bad_client_id" };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > MAX_TITLE) return { error: "bad_title" };
  const kind = raw.kind == null ? "custom" : raw.kind;
  if (!isOneOf(TODO_KINDS, kind)) return { error: "bad_kind" };
  if (raw.refType != null && !isOneOf(TODO_REF_TYPES, raw.refType)) return { error: "bad_ref" };
  if (raw.refId != null && (typeof raw.refId !== "string" || raw.refId.length > 64)) return { error: "bad_ref" };
  if (raw.dueDate != null && !validDate(raw.dueDate)) return { error: "bad_due_date" };
  const priority = raw.priority == null ? undefined : raw.priority; // absent (an older client): keep what is stored
  if (priority !== undefined && !isOneOf(TODO_PRIORITIES, priority)) return { error: "bad_priority" };
  const sortOrder = Number.isInteger(raw.sortOrder) ? Math.max(-1_000_000, Math.min(1_000_000, raw.sortOrder)) : 0;
  let updatedAt = when(raw.updatedAt);
  if (updatedAt === undefined) return { error: "bad_updated_at" };
  const ceiling = new Date(now.getTime() + FUTURE_SKEW_MS);
  if (!updatedAt || updatedAt > ceiling) updatedAt = now; // a wrong device clock cannot freeze an item
  let deletedAt = when(raw.deletedAt);
  if (deletedAt === undefined) return { error: "bad_deleted_at" };
  if (deletedAt && deletedAt > ceiling) deletedAt = now;
  const done = raw.done === true;
  return {
    data: {
      title, kind, refType: raw.refType ?? null, refId: raw.refId ?? null, dueDate: raw.dueDate ?? null, ...(priority !== undefined ? { priority } : {}),
      done, sortOrder, deletedAt, updatedAt,
    },
    clientId: raw.clientId,
  };
}

const LawTodo = {
  MAX_BATCH,

  list: async function (userId) {
    const rows = await rawDb().lawTodo.findMany({ where: { userId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    return rows.map(present);
  },

  /**
   * Applies a pushed batch, then returns what the device should hold: the whole list, soft-deleted rows included
   * for 30 days. There is no "changed since" filter on purpose: `updatedAt` holds the client's edit time, so a
   * row pushed late by an offline device can be older than a cursor another device already holds.
   * @returns {{error: string}|{applied: number, rejected: {index:number, clientId?:string, reason:string}[], items: object[], serverTime: string}}
   */
  sync: async function (userId, items, now = new Date()) {
    if (!Array.isArray(items)) return { error: "bad_items" };
    if (items.length > MAX_BATCH) return { error: "too_many" };

    const rejected = [];
    const accepted = new Map(); // clientId -> data; the latest updatedAt of a duplicated clientId wins
    items.forEach((raw, index) => {
      const c = clean(raw, now);
      if (c.error) return rejected.push({ index, ...(typeof raw?.clientId === "string" ? { clientId: raw.clientId.slice(0, 64) } : {}), reason: c.error });
      const prev = accepted.get(c.clientId);
      if (!prev || c.data.updatedAt >= prev.updatedAt) accepted.set(c.clientId, c.data);
    });

    let applied = 0;
    const purge = new Date(now.getTime() - PURGE_MS);
    const archive = new Date(now.getTime() - ARCHIVE_MS);
    if (accepted.size) {
      applied = await serialWrite(() =>
        rawDb().$transaction(async (tx) => {
          let n = 0;
          let live = await tx.lawTodo.count({ where: { userId, deletedAt: null } });
          for (const [clientId, d] of accepted) {
            const where = { userId_clientId: { userId, clientId } };
            const cur = await tx.lawTodo.findUnique({ where });
            const data = { ...d, doneAt: d.done ? (cur?.done && cur.doneAt ? cur.doneAt : d.updatedAt) : null };
            if (!cur) {
              if (!d.deletedAt && live >= MAX_ROWS) { rejected.push({ clientId, reason: "too_many_todos" }); continue; }
              await tx.lawTodo.create({ data: { userId, clientId, ...data } });
              if (!d.deletedAt) live++;
              n++;
            } else if (d.updatedAt > cur.updatedAt) {
              if (cur.deletedAt && !d.deletedAt) live++;
              if (!cur.deletedAt && d.deletedAt) live--;
              await tx.lawTodo.update({ where, data });
              n++;
            }
          }
          // Housekeeping keeps the list a device downloads small: long-deleted and long-finished todos go for good.
          await tx.lawTodo.deleteMany({ where: { userId, OR: [{ deletedAt: { lt: purge } }, { done: true, doneAt: { lt: archive } }] } });
          return n;
        }, { maxWait: 15000, timeout: 30000 })
      );
    }

    // The whole list, every time: `updatedAt` holds the client's edit time, so there is no safe "changed since" cursor.
    const rows = await rawDb().lawTodo.findMany({
      where: { userId, OR: [{ deletedAt: null }, { deletedAt: { gt: purge } }] },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return { applied, rejected, items: rows.map(present), serverTime: now.toISOString() };
  },
};

module.exports = { LawTodo };
