// The professor's course plan (spec §3.1, §5.1): a tree of headings that orders Exam Mode.
// Stored as JSON [{ title, children: [...] }]; edited as indented text (2 spaces or a tab per level,
// optional leading "-" or "•").
const { normalize } = require("./arabic");

function parseOutline(text) {
  const root = { children: [] };
  const stack = [{ level: -1, node: root }];
  for (const raw of String(text ?? "")
    .replace(/\r/g, "")
    .split("\n")) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^[\t ]*/)[0].replace(/\t/g, "  ").length;
    const level = Math.floor(indent / 2);
    const title = raw
      .trim()
      .replace(/^[-•*]\s*/, "")
      .trim();
    if (!title) continue;
    while (stack.length > 1 && stack[stack.length - 1].level >= level)
      stack.pop();
    const node = { title, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level, node });
  }
  return root.children;
}

function serializeOutline(tree, depth = 0) {
  return (tree || [])
    .map(
      (n) =>
        `${"  ".repeat(depth)}${n.title}\n${serializeOutline(n.children, depth + 1)}`
    )
    .join("");
}

function isValidTree(tree, depth = 0) {
  return (
    Array.isArray(tree) &&
    depth < 8 &&
    tree.every(
      (n) =>
        n &&
        typeof n.title === "string" &&
        n.title.trim() &&
        (n.children === undefined || isValidTree(n.children, depth + 1))
    )
  );
}

/** Pre-order list of { path: [titles], key: normalized path, order } */
function flatten(tree) {
  const out = [];
  const walk = (nodes, prefix) => {
    for (const n of nodes || []) {
      const path = [...prefix, n.title];
      out.push({
        path,
        key: path.map(normalize).join(" › "),
        leaf: normalize(n.title),
        order: out.length,
      });
      walk(n.children, path);
    }
  };
  walk(tree, []);
  return out;
}

/**
 * Position of a headingPath in the plan: the deepest plan node matching the path (exact path first,
 * then the deepest heading whose title equals one of the path's titles). null when absent.
 */
function planPosition(flat, headingPath) {
  if (!headingPath?.length) return null;
  const norm = headingPath.map(normalize);
  for (let len = norm.length; len > 0; len--) {
    const key = norm.slice(0, len).join(" › ");
    const exact = flat.find((f) => f.key === key);
    if (exact) return exact.order;
  }
  for (let i = norm.length - 1; i >= 0; i--) {
    const byLeaf = flat.find((f) => f.leaf === norm[i]);
    if (byLeaf) return byLeaf.order;
  }
  return null;
}

/** Sorts items ({headingPath, createdAt}) by plan position; unplaced items last in creation order. */
function orderByPlan(items, tree) {
  const flat = flatten(tree);
  return items
    .map((it) => ({ it, pos: planPosition(flat, it.headingPath) }))
    .sort(
      (a, b) =>
        (a.pos ?? Infinity) - (b.pos ?? Infinity) ||
        new Date(a.it.createdAt) - new Date(b.it.createdAt)
    )
    .map(({ it, pos }) => ({ ...it, planOrder: pos }));
}

module.exports = {
  parseOutline,
  serializeOutline,
  isValidTree,
  flatten,
  planPosition,
  orderByPlan,
};
