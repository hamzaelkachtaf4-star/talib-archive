// Offline-first course path: modules/graph are cached in IndexedDB (meta) and node completions made offline wait in
// meta "pathQueue", replayed on reconnect. The server treats a repeated completion as a no-op, so replays are safe.
import Law from "@/models/law";
import * as idb from "./idb";

const QUEUE = "pathQueue";
const listeners = new Set();
export const onPathQueueChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
const emit = async () => { const n = (await queue()).length; listeners.forEach((f) => f(n)); };
const queue = async () => (await idb.getMeta(QUEUE).catch(() => null)) || [];

async function cached(key, fetcher) {
  const r = await fetcher();
  if (r.ok) { await idb.setMeta(key, r.data).catch(() => {}); return { data: r.data, stale: false }; }
  return { data: await idb.getMeta(key).catch(() => null), stale: true, status: r.status, error: r.data?.error?.code };
}

// "My modules": the official ones plus the student's own (default list or added by hand).
export const loadModules = (semester) => cached(`pathModules:${semester}`, () => Law.moduleList(semester));
export async function loadGraph(id) {
  const r = await cached(`pathGraph:${id}`, () => Law.pathGraph(id));
  if (r.data) r.data = await applyQueued(r.data);
  return r;
}

/** Shows queued completions on a cached graph and recomputes which nodes they unlock (linear prerequisites). */
async function applyQueued(g) {
  const q = (await queue()).map((x) => x.nodeId);
  if (!q.length || !g.nodes) return g;
  const done = new Set(g.nodes.filter((n) => n.state === "COMPLETED").map((n) => n.id));
  for (const id of q) if (g.nodes.some((n) => n.id === id)) done.add(id);
  const nodes = g.nodes.map((n) => ({ ...n, state: done.has(n.id) ? "COMPLETED" : n.prereqIds.every((p) => done.has(p)) ? (n.state === "IN_PROGRESS" ? "IN_PROGRESS" : "AVAILABLE") : "LOCKED", queued: q.includes(n.id) }));
  return { ...g, nodes, currentNodeId: nodes.find((n) => n.state === "AVAILABLE" || n.state === "IN_PROGRESS")?.id || null };
}

/** Completes a node: online -> server; offline (or server unreachable) -> queued. Resolves { ok, queued, error }. */
export async function completeNode(nodeId) {
  if (navigator.onLine) {
    const r = await Law.pathProgress(nodeId, "COMPLETED");
    if (r.ok) return { ok: true, data: r.data };
    if (!r.offline && r.status < 500) return { ok: false, error: r.data?.error?.code };
  }
  const q = await queue();
  if (!q.some((x) => x.nodeId === nodeId)) await idb.setMeta(QUEUE, [...q, { nodeId, ts: Date.now() }]);
  emit();
  return { ok: true, queued: true };
}

let flushing = false;
export async function flushPathQueue() {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    // Oldest first, one at a time, stopping at the first transient failure: a later node depends on an earlier one, so
    // sending it first would be refused as "locked" and then dropped. The queue is re-read so completions queued
    // while this runs are never overwritten.
    const done = new Set();
    for (const item of (await queue()).sort((a, b) => a.ts - b.ts)) {
      const r = await Law.pathProgress(item.nodeId, "COMPLETED");
      if (r.offline || r.status >= 500 || [401, 403, 408, 429].includes(r.status)) break;
      done.add(item.nodeId); // ok, or a permanent refusal (locked / not found / already done): it can never succeed later
      sent += r.ok ? 1 : 0;
    }
    if (done.size) await idb.setMeta(QUEUE, (await queue()).filter((x) => !done.has(x.nodeId)));
  } finally { flushing = false; emit(); }
  return sent;
}

let started = false;
export function startPathAutoSync() {
  if (started) return;
  started = true;
  window.addEventListener("online", flushPathQueue);
  flushPathQueue();
}
