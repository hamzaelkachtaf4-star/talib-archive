// Offline copy of the legal-graph bundle, kept in the existing IndexedDB `meta` store (no schema bump, wiped with the rest
// when a different account signs in). Queries are pure functions in graphIndex.js and run on the local copy.
import Law from "@/models/law";
import { getMeta, setMeta } from "./idb";
import { buildIndex } from "./graphIndex";

export { relatedNodes as getRelatedNodes, conceptGraph as getConceptGraph, searchGraph, egoLayout, codeTree, edgeCardParts, nodeLabel } from "./graphIndex";

export const GRAPH_KEY = "legalGraphBundle";

/** Loads the bundle: revalidates the stored copy when online, serves it as-is when offline. */
export async function loadGraph() {
  const stored = await getMeta(GRAPH_KEY).catch(() => null);
  const r = await Law.graphBundle(stored?.etag);
  if (r.ok && r.data?.nodes) {
    await setMeta(GRAPH_KEY, { etag: r.etag, bundle: r.data, savedAt: new Date().toISOString() }).catch(() => {});
    return { index: buildIndex(r.data), source: "network", savedAt: null };
  }
  if (r.ok && r.notModified && stored?.bundle) return { index: buildIndex(stored.bundle), source: "cache", savedAt: stored.savedAt };
  if (stored?.bundle) return { index: buildIndex(stored.bundle), source: "offline", savedAt: stored.savedAt };
  return { index: null, source: r.offline ? "offline-empty" : "error", savedAt: null };
}
