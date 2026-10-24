// Offline-first timetable: the merged week is cached in IndexedDB (meta "ttWeek:<monday>") and override writes
// made offline wait in the ttQueue store, then replay in order on reconnect. Each op has a clientOpId, so a
// replay whose response was lost never duplicates (the server returns the existing override). Per override id the
// last queued write wins (a newer PATCH/DELETE for the same id replaces the older one).
import Law from "@/models/law";
import * as idb from "./idb";

const listeners = new Set();
const notify = async () => { const n = await pendingTt(); listeners.forEach((f) => f(n)); };
export const onTtQueueChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
export async function pendingTt() { try { return await idb.count("ttQueue"); } catch { return 0; } }

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Fetch the week (and cache it); offline falls back to the cache. Returns { week, stale }. */
export async function loadWeek(weekStart) {
  const r = await Law.ttWeek(weekStart);
  if (r.ok) {
    await idb.setMeta(`ttWeek:${r.data.weekStart}`, r.data).catch(() => {});
    if (r.data.subscription) await idb.setMeta("ttCurrent", r.data.weekStart).catch(() => {});
    return { week: r.data, stale: false };
  }
  const cached = weekStart ? await idb.getMeta(`ttWeek:${weekStart}`).catch(() => null) : null;
  return { week: cached, stale: true, offline: r.offline };
}

/** Apply an override mutation online if possible, else queue it. Resolves { queued } or { ok, error }. */
export async function mutate(op) {
  // op: { kind: "create"|"update"|"delete", id?, body? }
  const clientOpId = newId();
  const full = { ...op, clientOpId, ts: Date.now() };
  if (navigator.onLine) {
    const r = await send(full);
    if (r.ok || (r.status && r.status < 500 && r.status !== 0)) return { ok: r.ok, error: r.ok ? null : r.data?.error };
  }
  await enqueue(full);
  return { queued: true };
}

async function enqueue(op) {
  if (op.kind === "create" && op.body?.type !== "ADD") {
    // one pending create per (type, session, date): tapping twice while offline must not queue two
    const all = await idb.getAll("ttQueue");
    const same = all.filter((x) => x.kind === "create" && x.body?.type === op.body.type && x.body?.sessionId === op.body.sessionId && (x.body?.date ?? null) === (op.body.date ?? null)).map((x) => x.clientOpId);
    if (same.length) await idb.deleteMany("ttQueue", same);
  }
  if (op.id) {
    // last write wins per override id: drop older queued writes for the same id
    const all = await idb.getAll("ttQueue");
    const stale = all.filter((x) => x.id === op.id).map((x) => x.clientOpId);
    if (stale.length) await idb.deleteMany("ttQueue", stale);
  }
  await idb.put("ttQueue", op);
  notify();
}

function send(op) {
  if (op.kind === "create") return Law.ttCreateOverride({ ...op.body, clientOpId: op.clientOpId });
  if (op.kind === "update") return Law.ttUpdateOverride(op.id, op.body);
  return Law.ttDeleteOverride(op.id);
}

let flushing = false;
/** Replay queued ops oldest-first; stop at the first network failure. 4xx ops are dropped (they can never succeed). */
export async function flushTtQueue() {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const ops = (await idb.getAll("ttQueue")).sort((a, b) => a.ts - b.ts);
    for (const op of ops) {
      const r = await send(op);
      // Keep the op and stop on anything that may succeed later: offline, server errors, expired session, throttling.
      if (r.offline || r.status >= 500 || [401, 403, 408, 429].includes(r.status)) break;
      await idb.deleteMany("ttQueue", [op.clientOpId]);
      sent++;
    }
  } finally {
    flushing = false;
    notify();
  }
  return sent;
}

let started = false;
export function startTtAutoSync() {
  if (started) return;
  started = true;
  window.addEventListener("online", () => flushTtQueue());
  flushTtQueue();
}

/** Shows queued (not yet synced) CANCEL / EDIT / MOVE / ADD ops on top of a cached week so the student sees their change at once. */
export async function overlayQueued(week) {
  if (!week) return week;
  const ops = (await idb.getAll("ttQueue").catch(() => [])).filter((o) => o.kind === "create").sort((a, b) => a.ts - b.ts);
  if (!ops.length) return week;
  const items = week.items.map((i) => ({ ...i }));
  for (const { body: b } of ops) {
    if (b.type === "ADD") {
      if (b.date && items.every((i) => i.date !== b.date || i.subject !== b.data.subject || i.startTime !== b.data.startTime))
        items.push({ id: `queued:${b.date}:${b.data.startTime}`, sessionId: null, date: b.date, startTime: b.data.startTime, endTime: b.data.endTime, subject: b.data.subject, room: b.data.room || null, source: "custom", queued: true });
      continue;
    }
    const it = items.find((i) => i.sessionId === b.sessionId && (!b.date || i.date === b.date));
    if (!it) continue;
    it.source = "override";
    it.queued = true;
    if (b.type === "CANCEL") it.cancelled = true;
    else if (b.type === "EDIT") Object.assign(it, b.data);
  }
  return { ...week, items };
}
