// Registers the LAW-OS service worker (public/lawos-sw.js) and makes sure every chunk the shell needs is
// in its cache, so the app opens in airplane mode after a single online visit (spec §11 Phase 0).
//
// Why the hand-off: chunks loaded before the SW controlled the page never pass through it. Once it
// controls the page we import every tab (cheap, already split by Vite) and send the SW the URLs of all
// same-origin scripts/styles/fonts this page has loaded; it caches the ones it is missing.

const SW_URL = "/lawos-sw.js";

function controlled() {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) =>
    navigator.serviceWorker.addEventListener("controllerchange", resolve, {
      once: true,
    })
  );
}

function loadedAssetUrls() {
  const out = new Set();
  for (const e of performance.getEntriesByType("resource")) {
    const url = new URL(e.name);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/"))
      continue;
    if (/\.(js|css|woff2|png|svg|json|webmanifest)$/.test(url.pathname))
      out.add(url.pathname);
  }
  return [...out];
}

/**
 * @param {Array<() => Promise<unknown>>} prefetchers dynamic imports for every tab
 */
export async function registerLawServiceWorker(prefetchers = []) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    await controlled();
    await Promise.allSettled(prefetchers.map((load) => load()));
    reg.active?.postMessage({
      type: "LAWOS_CACHE_URLS",
      urls: loadedAssetUrls(),
    });
  } catch (e) {
    console.warn("[LAW-OS] service worker registration failed:", e?.message);
  }
}
