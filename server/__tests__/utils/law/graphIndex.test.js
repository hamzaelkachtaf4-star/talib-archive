// Offline graph queries (pure, loaded the way pathGroups.test.js does).
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.resolve(__dirname, "../../../../frontend/src/components/LawOS/lib/graphIndex.js"), "utf8").replace(/export /g, "");
const G = new Function(`${src}; return { buildIndex, relatedNodes, conceptGraph, searchGraph, egoLayout, codeTree, edgeCardParts, foldArabic, nodeLabel };`)();

const art = (code, n, extra = {}) => ({ id: `${code}:${n}`, type: "article", code, codeTitleAr: code, label: "الفصل", n: String(n), summary: `نص الفصل ${n}`, headingPath: [], ...extra });
const bundle = {
  nodes: [
    art("DOC", 77, { headingPath: ["الباب الأول"] }), art("DOC", 78, { headingPath: ["الباب الأول"] }), art("DOC", 9, { headingPath: ["الباب الثاني"] }), art("CP", 3),
    { id: "c:nullite", type: "concept", slug: "nullite", titleAr: "البطلان", titleFr: "Nullité", conceptId: "k1" },
    { id: "c:annul", type: "concept", slug: "annul", titleAr: "الإبطال", titleFr: "Annulabilité", conceptId: "k2" },
    { id: "p:1", type: "pair", pairId: "1", labelAr: "البطلان والإبطال" },
  ],
  edges: [
    { s: "DOC:77", t: "DOC:78", k: "explicit", r: "references", x: true },
    { s: "DOC:77", t: "CP:3", k: "link", r: "interprets", note: "ملاحظة" },
    { s: "c:nullite", t: "DOC:77", k: "concept" },
    { s: "c:nullite", t: "DOC:9", k: "concept" },
    { s: "c:nullite", t: "c:annul", k: "pair", pair: "1" },
    { s: "DOC:1", t: "DOC:77", k: "explicit" }, // dangling: DOC:1 is not a node
  ],
};
const idx = G.buildIndex(bundle);

test("dangling edges are ignored", () => {
  expect(idx.size).toBe(7);
  expect((idx.inc.get("DOC:77") || []).some((e) => e.s === "DOC:1")).toBe(false);
});

test("related nodes: parents, children and concept peers", () => {
  const r = G.relatedNodes(idx, "DOC:77");
  expect(r.children.map((x) => x.node.id).sort()).toEqual(["CP:3", "DOC:78"]);
  expect(r.parents.map((x) => x.node.id)).toEqual(["c:nullite"]);
  expect(r.peers.map((x) => x.node.id)).toEqual(["DOC:9"]);
  expect(G.relatedNodes(idx, "c:nullite").peers.map((x) => x.node.id)).toEqual(["c:annul"]);
  expect(G.relatedNodes(idx, "nope")).toEqual({ parents: [], children: [], peers: [] });
});

test("concept graph: articles and confusion partner; unknown slug is null", () => {
  const g = G.conceptGraph(idx, "nullite");
  expect(g.articles.map((a) => a.id).sort()).toEqual(["DOC:77", "DOC:9"]);
  expect(g.confusions.map((c) => c.other.slug)).toEqual(["annul"]);
  expect(G.conceptGraph(idx, "zzz")).toBeNull();
});

test("search: article numbers (also Arabic-Indic), concept names with hamza/ta-marbuta folding, empty query", () => {
  expect(G.searchGraph(idx, "77")[0].id).toBe("DOC:77");
  expect(G.searchGraph(idx, "الفصل ٧٨")[0].id).toBe("DOC:78");
  expect(G.searchGraph(idx, "ابطال")[0].id).toBe("c:annul");
  expect(G.searchGraph(idx, "Nullité")[0].id).toBe("c:nullite");
  expect(G.searchGraph(idx, "  ")).toEqual([]);
  expect(G.searchGraph(idx, "لا شيء")).toEqual([]);
});

test("ego layout: centre plus a ring, capped with a hidden count", () => {
  const e = G.egoLayout(idx, "DOC:77", { max: 2 });
  expect(e.nodes[0]).toEqual({ id: "DOC:77", x: 0, y: 0 });
  expect(e.nodes.length).toBe(3);
  expect(e.hidden).toBe(1);
  expect(e.nodes.every((n) => Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1)).toBe(true);
  expect(G.egoLayout(idx, "nope")).toEqual({ nodes: [], edges: [], hidden: 0 });
});

test("code tree groups by code and chapter in natural article order", () => {
  const t = G.codeTree(idx);
  expect(t.map((c) => c.code)).toEqual(["CP", "DOC"]);
  const doc = t.find((c) => c.code === "DOC");
  expect(doc.chapters.map((c) => c.title)).toEqual(["الباب الأول", "الباب الثاني"]);
  expect(doc.chapters[0].articles.map((a) => a.node.n)).toEqual(["77", "78"]);
  expect(doc.chapters[0].articles[0]).toMatchObject({ outgoing: 2, incoming: 1 });
});

test("edge card parts: citations and concept ids come from the edge, nothing invented", () => {
  const p = G.edgeCardParts(idx, bundle.edges[1]);
  expect(p).toMatchObject({ kind: "link", relation: "interprets", note: "ملاحظة", canonicalIds: ["DOC:77", "CP:3"], conceptIds: [] });
  const c = G.edgeCardParts(idx, bundle.edges[2]);
  expect(c.canonicalIds).toEqual(["DOC:77"]);
  expect(c.conceptIds).toEqual(["k1"]);
  expect(G.edgeCardParts(idx, { s: "x", t: "y" })).toBeNull();
});
