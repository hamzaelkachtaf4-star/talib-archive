// "Save offline" for statute texts: a code's current articles live in IndexedDB (store legalTexts) so the reader
// keeps working without a connection. Packs are read-only copies of the server's corpus export.
import Law from "@/models/law";
import * as idb from "./idb";

export const listSaved = async () => (await idb.getAll("legalTexts").catch(() => [])).map((p) => ({ slug: p.code.slug, title: p.code.titleAr, titleFr: p.code.titleFr, normLevel: p.code.normLevel, at: p.at, count: p.articles.length }));

export async function saveCode(slug) {
  const r = await Law.exportCode(slug);
  if (!r.ok) return { ok: false, offline: r.offline };
  await idb.put("legalTexts", { slug, ...r.data });
  return { ok: true, count: r.data.articles.length };
}

export const removeCode = (slug) => idb.deleteMany("legalTexts", [slug]);

/** An article from any saved pack: { code, article } or null. */
export async function findSavedArticle(canonicalId) {
  const slug = String(canonicalId).split(":")[0];
  const pack = await idb.get("legalTexts", slug).catch(() => null);
  const article = pack?.articles.find((a) => a.canonicalId === canonicalId);
  return article ? { code: pack.code, article, at: pack.at } : null;
}
