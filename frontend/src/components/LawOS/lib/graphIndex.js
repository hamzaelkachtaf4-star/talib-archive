// Pure graph queries over the compiled legal-graph bundle (no imports, so server jest can load it, like pathGroups.js).
// Node ids: article "DOC:77", concept "c:<slug>", confusion pair "p:<id>". Edge kinds: link (verified), explicit (regex), concept, pair.

const DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/g;
export function foldArabic(s) {
  return String(s ?? "")
    .replace(DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildIndex(bundle) {
  const nodes = new Map();
  const out = new Map();
  const inc = new Map();
  for (const n of bundle?.nodes || []) nodes.set(n.id, n);
  const add = (m, k, e) => (m.get(k) || m.set(k, []).get(k)).push(e);
  for (const e of bundle?.edges || []) {
    if (!nodes.has(e.s) || !nodes.has(e.t)) continue;
    add(out, e.s, e);
    add(inc, e.t, e);
  }
  return { nodes, out, inc, tours: bundle?.tours || [], size: nodes.size };
}

export function nodeLabel(n) {
  if (!n) return "";
  if (n.type === "article") return `${n.label} ${n.n}`;
  if (n.type === "concept") return n.titleAr;
  return n.labelAr;
}

const byLabel = (a, b) => nodeLabel(a).localeCompare(nodeLabel(b), "ar", { numeric: true });

/** parents = who points here, children = where this points, peers = siblings through a shared concept or a confusion pair. */
export function relatedNodes(index, id) {
  const pick = (edges, side) => (edges || []).map((e) => ({ node: index.nodes.get(e[side]), edge: e })).filter((x) => x.node);
  const parents = pick(index.inc.get(id), "s").filter((x) => x.edge.k !== "pair");
  const children = pick(index.out.get(id), "t").filter((x) => x.edge.k !== "pair");
  const peers = new Map();
  const node = index.nodes.get(id);
  if (node?.type === "article") {
    for (const p of parents.filter((x) => x.edge.k === "concept"))
      for (const sib of pick(index.out.get(p.node.id), "t"))
        if (sib.node.id !== id && sib.edge.k === "concept") peers.set(sib.node.id, sib);
  }
  if (node?.type === "concept") {
    for (const e of [...(index.out.get(id) || []), ...(index.inc.get(id) || [])].filter((x) => x.k === "pair")) {
      const other = index.nodes.get(e.s === id ? e.t : e.s);
      if (other) peers.set(other.id, { node: other, edge: e });
    }
  }
  const sort = (xs) => xs.sort((a, b) => byLabel(a.node, b.node));
  return { parents: sort(parents), children: sort(children), peers: sort([...peers.values()]) };
}

/** A concept, the articles it cites, and the concepts it is confused with. */
export function conceptGraph(index, slug) {
  const concept = index.nodes.get(`c:${slug}`);
  if (!concept) return null;
  const edges = [...(index.out.get(concept.id) || []), ...(index.inc.get(concept.id) || [])];
  return {
    concept,
    articles: edges.filter((e) => e.k === "concept" && e.s === concept.id).map((e) => index.nodes.get(e.t)).filter(Boolean).sort(byLabel),
    confusions: edges.filter((e) => e.k === "pair").map((e) => ({ pair: index.nodes.get(`p:${e.pair}`), other: index.nodes.get(e.s === concept.id ? e.t : e.s) })).filter((x) => x.other),
  };
}

/** Fuzzy search over concept names and article numbers/summaries. Article numbers ("77", "DOC 77", "الفصل 77") rank first. */
export function searchGraph(index, query, limit = 20) {
  const q = foldArabic(query);
  if (!q) return [];
  const num = (q.match(/\d+(?:-\d+)?/) || [])[0];
  const hits = [];
  for (const n of index.nodes.values()) {
    let score = 0;
    if (n.type === "article") {
      if (num && String(n.n).replace(/\s.*/, "") === num) score = 100;
      else if (num && foldArabic(n.id).includes(q)) score = 60;
      else if (foldArabic(n.summary).includes(q)) score = 20;
    } else if (n.type === "concept") {
      const hay = [n.titleAr, n.titleFr, n.slug].map(foldArabic);
      if (hay.some((h) => h === q)) score = 90;
      else if (hay.some((h) => h.includes(q))) score = 70;
    } else if (foldArabic(n.labelAr).includes(q)) score = 50;
    if (score) hits.push({ node: n, score });
  }
  return hits.sort((a, b) => b.score - a.score || byLabel(a.node, b.node)).slice(0, limit).map((h) => h.node);
}

/** Ego graph: the focus node in the middle, up to `max` neighbours on one ring. Coordinates in a [-1, 1] square. */
export function egoLayout(index, id, { max = 12 } = {}) {
  const focus = index.nodes.get(id);
  if (!focus) return { nodes: [], edges: [], hidden: 0 };
  const edges = [...(index.out.get(id) || []), ...(index.inc.get(id) || [])];
  const seen = new Set([id]);
  const ring = [];
  for (const e of edges) {
    const other = e.s === id ? e.t : e.s;
    if (!seen.has(other)) { seen.add(other); ring.push(other); }
  }
  const shown = ring.slice(0, max);
  const step = (2 * Math.PI) / Math.max(shown.length, 1);
  const pos = [{ id, x: 0, y: 0 }, ...shown.map((nid, i) => ({ id: nid, x: Math.cos(i * step - Math.PI / 2) * 0.78, y: Math.sin(i * step - Math.PI / 2) * 0.78 }))];
  const keep = new Set(pos.map((p) => p.id));
  return { nodes: pos, edges: edges.filter((e) => keep.has(e.s) && keep.has(e.t)), hidden: ring.length - shown.length };
}

/** Tree mode: code -> chapter (first heading) -> articles, each with its in/out link counts. */
export function codeTree(index) {
  const codes = new Map();
  for (const n of index.nodes.values()) {
    if (n.type !== "article") continue;
    const code = codes.get(n.code) || codes.set(n.code, { code: n.code, titleAr: n.codeTitleAr, level: n.level, chapters: new Map() }).get(n.code);
    const key = (n.headingPath || [])[0] || "";
    (code.chapters.get(key) || code.chapters.set(key, []).get(key)).push({ node: n, outgoing: (index.out.get(n.id) || []).length, incoming: (index.inc.get(n.id) || []).length });
  }
  const natural = (a, b) => a.node.n.localeCompare(b.node.n, "en", { numeric: true });
  return [...codes.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => ({ ...c, chapters: [...c.chapters.entries()].map(([title, articles]) => ({ title, articles: articles.sort(natural) })) }));
}

/**
 * Structured material for a flashcard about one edge. Wording is composed by the UI with tr(); nothing here is
 * generated, the back only restates the edge, its relation and the canonical citations (+ the edge's own note).
 */
export function edgeCardParts(index, edge) {
  const a = index.nodes.get(edge?.s), b = index.nodes.get(edge?.t);
  if (!a || !b) return null;
  const arts = [a, b].filter((n) => n.type === "article");
  const concepts = [a, b].filter((n) => n.type === "concept");
  return {
    kind: edge.k,
    a, b,
    relation: edge.r || null,
    note: edge.note || "",
    canonicalIds: arts.map((n) => n.id),
    conceptIds: concepts.map((n) => n.conceptId).filter(Boolean),
  };
}
