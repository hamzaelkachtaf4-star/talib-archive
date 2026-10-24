// Course-plan hierarchy for the roadmap. Moroccan plans nest القسم/الباب › الفصل › المبحث › المطلب › الفقرة (sometimes المحور);
// the data decides the depth. A node's `section` is a path whose levels are separated by " › " (a plain label = one level),
// so no schema change is needed. Pure function: returns a tree with a done/total fraction at every level.
export const SECTION_SEP = " › ";

export function groupNodes(nodes) {
  const root = { label: "", depth: -1, children: [], nodes: [], total: 0, done: 0 };
  const index = new Map([["", root]]);
  nodes.forEach((n, i) => {
    const parts = String(n.section || "").split(SECTION_SEP).map((p) => p.trim()).filter(Boolean);
    let parent = root;
    let key = "";
    for (const [d, label] of parts.entries()) {
      key += `${SECTION_SEP}${label}`;
      let g = index.get(key);
      if (!g) {
        g = { label, depth: d, children: [], nodes: [], total: 0, done: 0 };
        index.set(key, g);
        parent.children.push(g);
      }
      parent = g;
      g.total += 1;
      if (n.state === "COMPLETED") g.done += 1;
    }
    parent.nodes.push({ node: n, index: i + 1 });
  });
  return root;
}
