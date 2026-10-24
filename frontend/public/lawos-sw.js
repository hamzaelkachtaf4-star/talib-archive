/* LAW-OS service worker (spec §6.2, §10.1): offline app shell + background uploads.
 * Uploads: the shared engine (lawos-upload-engine.js) runs here on request from the page and on
 * Background Sync ("lawos-upload"), so captures keep uploading after the tab is closed where supported.
 * Push (spec §8.5): close-out reminder and Sunday recap notifications open the matching LAW-OS screen.
 *
 * Strategies
 *   navigations          network-first (3 s timeout) → cached shell HTML. The server renders the same
 *                        HTML for every route, so one cached copy serves /law/* offline.
 *   /index.js /index.css network-first → cache. Upstream builds these with FIXED names, so cache-first
 *                        would pin a stale app after a deploy.
 *   /assets/*            cache-first (Vite content-hashes these names).
 *   /lawos/* static      cache-first (fonts, icons; bump VERSION when they change).
 *   other same-origin    network-first → cache.
 *   /api/*               never cached here (offline data comes in Phase 1 via IndexedDB).
 */
importScripts("/lawos-upload-engine.js");

const VERSION = "lawos-q6";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_KEY = "/__lawos_shell";

const PRECACHE = [
  "/index.js",
  "/index.css",
  "/manifest.json",
  "/lawos-upload-engine.js",
  "/lawos/icons/icon-192.png",
  "/lawos/icons/icon-512.png",
  "/lawos/fonts/plex-arabic-arabic-400.woff2",
  "/lawos/fonts/plex-arabic-arabic-600.woff2",
  "/lawos/fonts/plex-arabic-arabic-700.woff2",
  "/lawos/fonts/plex-arabic-latin-400.woff2",
  "/lawos/fonts/plex-arabic-latin-600.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const html = await fetch("/law/today", { cache: "reload", credentials: "same-origin" });
      if (!html.ok) throw new Error(`shell fetch ${html.status}`);
      await shell.put(SHELL_KEY, html);
      await shell.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys())
        if (key.startsWith("lawos-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "LAWOS_UPLOAD_NOW") {
    event.waitUntil(self.LawUploadEngine.run({ token: event.data.token || null }));
    return;
  }
  if (event.data?.type !== "LAWOS_CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(cacheMissing(event.data.urls));
});

// Background Sync: the browser calls back when connectivity returns, even with the app closed.
// Rejecting tells the browser to retry later with its own backoff.
self.addEventListener("sync", (event) => {
  if (event.tag !== "lawos-upload") return;
  event.waitUntil(
    self.LawUploadEngine.run({}).then((r) => {
      if (!r.ok) throw new Error(r.error);
    })
  );
});

async function cacheMissing(urls) {
  const cache = await caches.open(ASSET_CACHE);
  for (const path of urls) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("/api/")) continue;
    if (await caches.match(path, MATCH)) continue;
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      if (res.ok) await cache.put(path, res);
    } catch {}
  }
}

// The server sends "Vary: Origin". Module scripts are requested with an Origin header and warm-up fetches
// without one, so a Vary-aware match missed cached chunks and every lazy page failed offline.
// Everything cached here is static (content-hashed assets, the shell), so Vary can be ignored.
const MATCH = { ignoreVary: true };

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function networkFirst(request, cacheName, cacheKey = request, timeoutMs = 3000) {
  try {
    const res = await withTimeout(fetch(request), timeoutMs);
    if (res.ok) (await caches.open(cacheName)).put(cacheKey, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(cacheKey, MATCH);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(ASSET_CACHE)).put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, SHELL_CACHE, SHELL_KEY));
    return;
  }
  if (url.pathname === "/index.js" || url.pathname === "/index.css" || url.pathname === "/manifest.json") {
    event.respondWith(networkFirst(req, SHELL_CACHE, url.pathname));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/lawos/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Anything else same-origin (e.g. lazy-chunk CSS, which upstream's Vite config emits with fixed,
  // unhashed names at the root): network-first so deploys are picked up, cache when offline.
  event.respondWith(networkFirst(req, ASSET_CACHE));
});

// ── Push (spec §8.5) ──
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "LAW-OS", body: event.data?.text() || "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "LAW-OS", {
      body: data.body || "",
      tag: data.tag || "lawos",
      icon: "/lawos/icons/icon-192.png",
      badge: "/lawos/icons/icon-192.png",
      dir: "rtl",
      lang: "ar",
      data: { url: data.url || "/law/today" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/law/today";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return existing.navigate(url);
      }
      return self.clients.openWindow(url);
    })()
  );
});
