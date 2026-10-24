// Offline-first review queue (spec §6.2, §9.6).
// Ratings are written to IndexedDB first and applied to the local card (preview). sync() sends the
// queue to /reviews/batch; logs are deleted only once the server has acknowledged them (accepted,
// duplicate, or permanently rejected), and the server's replayed card states replace local previews.
import Law from "@/models/law";
import * as idb from "./idb";
import { rateLocally } from "./fsrs";
import { deviceId } from "./device";

const BATCH = 200;
const listeners = new Set();
let syncing = null;

const packListeners = new Set();

/** Called after a new offline pack has been stored (e.g. the first download after opening the app). */
export function onPackChange(fn) {
  packListeners.add(fn);
  return () => packListeners.delete(fn);
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  const pending = await idb.count("reviewQueue");
  for (const fn of listeners) fn(pending);
}

export async function pendingCount() {
  return idb.count("reviewQueue");
}

export async function packInfo() {
  return (await idb.getMeta("pack")) || null;
}

/** Download the offline pack. Never overwrites a card that still has unsynced reviews. */
export async function refreshPack() {
  const res = await Law.offlinePack();
  if (!res.ok) return false;
  const queued = new Set(
    (await idb.getAll("reviewQueue")).map((l) => l.cardId)
  );
  const local = new Map((await idb.getAll("cards")).map((c) => [c.id, c]));
  const cards = res.data.cards.map((c) =>
    queued.has(c.id) && local.has(c.id) ? local.get(c.id) : c
  );
  await idb.replaceAll("cards", cards);
  await idb.setMeta("examAtoms", res.data.atoms || []); // Exam Mode offline (spec §1.9)
  await idb.setMeta("pack", {
    generatedAt: res.data.generatedAt,
    settings: res.data.settings,
    subjects: res.data.subjects,
    newAllowance: res.data.newAllowance,
    newAllowanceDate: new Date().toDateString(),
  });
  for (const fn of packListeners) fn();
  return true;
}

/** Record a rating locally. Returns the updated local card. */
export async function recordReview(card, rating, durationMs) {
  const pack = (await packInfo()) || {};
  const now = new Date();
  const log = {
    clientReviewId: crypto.randomUUID(),
    cardId: card.id,
    rating,
    reviewedAt: now.toISOString(),
    durationMs: Math.round(durationMs),
    stateBefore: { state: card.state },
    deviceId: localStorage.getItem("lawos_device_id"),
  };
  const updated = rateLocally(
    card,
    rating,
    now,
    pack.settings?.desiredRetention ?? 0.9
  );
  await idb.put("reviewQueue", log);
  await idb.put("cards", updated);
  if (card.state === "new") {
    const today = now.toDateString();
    const base =
      pack.newAllowanceDate === today
        ? (pack.newAllowance ?? 0)
        : (pack.settings?.newCardsPerDay ?? 0);
    await idb.setMeta("pack", {
      ...pack,
      newAllowance: Math.max(0, base - 1),
      newAllowanceDate: today,
    });
  }
  notify();
  return updated;
}

async function doSync() {
  const queue = (await idb.getAll("reviewQueue")).sort((a, b) =>
    a.reviewedAt.localeCompare(b.reviewedAt)
  );
  if (!queue.length) return { sent: 0 };
  const id = await deviceId();
  let sent = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    const chunk = queue.slice(i, i + BATCH);
    const res = await Law.submitReviews({ logs: chunk, deviceId: id });
    if (!res.ok) {
      // 4xx on the whole batch would loop forever; only network/5xx errors keep the queue.
      if (res.status >= 400 && res.status < 500)
        console.warn("[LAW-OS] review batch refused", res.data);
      break;
    }
    const acked = [
      ...res.data.accepted,
      ...res.data.duplicates,
      ...res.data.rejected.map((r) => r.clientReviewId).filter(Boolean),
    ];
    await idb.deleteMany("reviewQueue", acked);
    await idb.putMany("cards", res.data.cards);
    sent += acked.length;
  }
  notify();
  return { sent };
}

/** Sync the queue, then refresh the pack. Concurrent calls share one run. */
export function syncNow() {
  if (!syncing)
    syncing = (async () => {
      try {
        const r = await doSync();
        if (navigator.onLine) await refreshPack();
        return r;
      } finally {
        syncing = null;
      }
    })();
  return syncing;
}

let started = false;
/** Sync on app open, when the network returns and when the app comes back to the foreground. */
export function startAutoSync() {
  if (started) return;
  started = true;
  const run = () => navigator.onLine && syncNow().catch(() => {});
  window.addEventListener("online", run);
  document.addEventListener(
    "visibilitychange",
    () => document.visibilityState === "visible" && run()
  );
  run();
}

/** Cards to review now from the local pack: due reviews + new cards within today's allowance. */
export async function localQueue({ subjectId } = {}) {
  const pack = (await packInfo()) || {};
  const now = new Date();
  const cards = (await idb.getAll("cards")).filter(
    (c) => !subjectId || c.subjectId === subjectId
  );
  const due = cards
    .filter((c) => c.state !== "new" && new Date(c.due) <= now)
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  const allowance =
    pack.newAllowanceDate === now.toDateString()
      ? (pack.newAllowance ?? 0)
      : (pack.settings?.newCardsPerDay ?? 0);
  const fresh = cards.filter((c) => c.state === "new").slice(0, allowance);
  return {
    due,
    fresh,
    subjects: pack.subjects || [],
    settings: pack.settings || {},
  };
}
