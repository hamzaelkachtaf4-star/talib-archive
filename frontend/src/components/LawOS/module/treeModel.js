// Pure helpers over the module's flat node list ({id, parentId, level, kind, title, body, order, sourceRefs, aiDraft}).
// One list behind all four views; the views only differ in how they lay it out.

const byOrder = (a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id));

/** Children of each parent id (null = roots), each list sorted by `order`. */
export function childrenMap(nodes) {
  const m = new Map();
  for (const n of nodes) {
    const k = n.parentId ?? null;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n);
  }
  for (const list of m.values()) list.sort(byOrder);
  return m;
}

/** Depth-first document order. Orphans (a parent that no longer exists) are shown as roots, never lost. */
export function flatten(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const m = childrenMap(nodes.map((n) => (n.parentId && !ids.has(n.parentId) ? { ...n, parentId: null } : n)));
  const out = [];
  const walk = (parent, depth) => {
    for (const n of m.get(parent) || []) {
      out.push({ ...n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Ids of every descendant of `id`. */
export function descendants(nodes, id) {
  const m = childrenMap(nodes);
  const out = [];
  const walk = (p) => (m.get(p) || []).forEach((c) => { out.push(c.id); walk(c.id); });
  walk(id);
  return out;
}

/** The "axes" of a module: its top-level nodes with how much sits under each. */
export function axes(nodes) {
  const m = childrenMap(nodes);
  return (m.get(null) || []).map((n) => {
    const below = descendants(nodes, n.id);
    return { node: n, count: below.length, withBody: nodes.filter((x) => below.includes(x.id) && x.body.trim()).length };
  });
}

export const hasContent = (nodes) => nodes.length > 0;

/** Paragraph diff for DiffViewer: [{type: same|add|del, text}] from the longest common run of paragraphs. */
export function paragraphDiff(before, after) {
  const a = String(before || "").split(/\n{2,}/).filter((p) => p.trim());
  const b = String(after || "").split(/\n{2,}/).filter((p) => p.trim());
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: "del", text: a[i++] });
    else out.push({ type: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ type: "del", text: a[i++] });
  while (j < b.length) out.push({ type: "add", text: b[j++] });
  return out;
}
