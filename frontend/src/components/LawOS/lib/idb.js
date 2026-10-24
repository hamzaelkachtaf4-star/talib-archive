// Minimal promise wrapper over IndexedDB (no dependency). Offline data lives here (spec §6.2):
//   cards        offline pack (keyPath id)
//   reviewQueue  review logs not yet acknowledged by the server (keyPath clientReviewId)
//   meta         small key/value records: pack info, last Today snapshot (keyPath key)
//   captures     captured files waiting for upload, with their blob (keyPath clientCaptureId)  [v2]
//   batches      capture batches waiting to be created/completed on the server (keyPath clientBatchId)  [v2]
//   legalTexts   statute packs saved for offline reading (keyPath slug)  [v4]
//   todos        the daily to-do list, keyPath clientId, `dirty: true` until the server acknowledged it  [v5]
//   ttQueue      timetable override writes made offline, replayed in order (keyPath clientOpId)  [v3]
// Later phases add stores by bumping VERSION and extending upgrade(). The upload engine
// (public/lawos-upload-engine.js) opens the same DB and must carry the identical upgrade().
const DB_NAME = "lawos";
const VERSION = 5;
let dbPromise = null;

function upgrade(db) {
  if (!db.objectStoreNames.contains("cards"))
    db.createObjectStore("cards", { keyPath: "id" });
  if (!db.objectStoreNames.contains("reviewQueue"))
    db.createObjectStore("reviewQueue", { keyPath: "clientReviewId" });
  if (!db.objectStoreNames.contains("meta"))
    db.createObjectStore("meta", { keyPath: "key" });
  if (!db.objectStoreNames.contains("captures"))
    db.createObjectStore("captures", { keyPath: "clientCaptureId" });
  if (!db.objectStoreNames.contains("batches"))
    db.createObjectStore("batches", { keyPath: "clientBatchId" });
  if (!db.objectStoreNames.contains("ttQueue"))
    db.createObjectStore("ttQueue", { keyPath: "clientOpId" });
  if (!db.objectStoreNames.contains("legalTexts"))
    db.createObjectStore("legalTexts", { keyPath: "slug" });
  if (!db.objectStoreNames.contains("todos"))
    db.createObjectStore("todos", { keyPath: "clientId" });
}

export function openDb() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await openDb();
  return request(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await openDb();
  return request(db.transaction(store).objectStore(store).get(key));
}

export async function count(store) {
  const db = await openDb();
  return request(db.transaction(store).objectStore(store).count());
}

export async function putMany(store, values) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  for (const v of values) tx.objectStore(store).put(v);
  return done(tx);
}

export async function put(store, value) {
  return putMany(store, [value]);
}

export async function deleteMany(store, keys) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  for (const k of keys) tx.objectStore(store).delete(k);
  return done(tx);
}

/** Atomically replace a store's content (used for the offline pack). */
export async function replaceAll(store, values) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  os.clear();
  for (const v of values) os.put(v);
  return done(tx);
}

/**
 * Reads the whole store, lets `merge(rows)` (synchronous) decide the new content, and writes it, all in ONE readwrite
 * transaction, so a write made by another tab or an earlier call can never fall between the read and the write.
 */
export async function replaceMerged(store, merge) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  const rows = await request(os.getAll());
  const next = merge(rows);
  os.clear();
  for (const v of next) os.put(v);
  await done(tx);
  return next;
}

export async function getMeta(key) {
  return (await get("meta", key))?.value ?? null;
}

export async function setMeta(key, value) {
  return put("meta", { key, value });
}

/** Empties every LAW-OS store (sign-out, or a different account on this device). */
export async function wipeAll() {
  const db = await openDb();
  const stores = [...db.objectStoreNames];
  const tx = db.transaction(stores, "readwrite");
  for (const name of stores) tx.objectStore(name).clear();
  await done(tx);
}
