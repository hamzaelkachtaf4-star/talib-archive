// Block-level three-way merge for Hub notes (spec Phase 8.2). A "block" is a paragraph: text separated by blank
// lines. Built on `diff`'s diffArrays (LCS), so reordering within a hunk is a delete+insert, never a silent swap.
const { diffArrays } = require("diff");

// Blocks keep their own leading indentation and inner lines; only the blank-line separators are normalized
// (so code-like indented paragraphs survive a merge byte for byte).
const splitBlocks = (md) =>
  String(md || "")
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((b) => b.replace(/^\n+/, "").replace(/\s+$/, ""))
    .filter((b) => b.trim() !== "");
/** The same normalization applied to a whole document (used as the "before" side of section blame). */
const normalizeDoc = (md) => splitBlocks(md).join("\n\n");
const joinBlocks = (blocks) => blocks.join("\n\n");

/** Changes of `side` relative to `base` as hunks { start, end, lines } over base indexes (end exclusive). */
function hunks(base, side) {
  const out = [];
  let i = 0;
  let cur = null;
  for (const part of diffArrays(base, side)) {
    if (!part.added && !part.removed) {
      if (cur) { out.push(cur); cur = null; }
      i += part.count;
      continue;
    }
    cur ||= { start: i, end: i, lines: [] };
    if (part.removed) { cur.end += part.count; i += part.count; }
    else cur.lines.push(...part.value);
  }
  if (cur) out.push(cur);
  return out;
}

const apply = (base, hs, from, to) => {
  const out = [];
  let pos = from;
  for (const h of hs) {
    out.push(...base.slice(pos, h.start), ...h.lines);
    pos = h.end;
  }
  out.push(...base.slice(pos, to));
  return out;
};

/**
 * @returns {{ clean: boolean, merged: string, conflicts: {base:string[], ours:string[], theirs:string[]}[] }}
 * `ours` = the current head, `theirs` = the proposal. Independent edits merge; edits to the same blocks that
 * differ are conflicts (never auto-resolved). Identical edits on both sides merge once.
 */
function merge3(baseMd, oursMd, theirsMd) {
  const base = splitBlocks(baseMd), ours = splitBlocks(oursMd), theirs = splitBlocks(theirsMd);
  const all = [
    ...hunks(base, ours).map((h) => ({ ...h, side: "o" })),
    ...hunks(base, theirs).map((h) => ({ ...h, side: "t" })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  const conflicts = [];
  let cursor = 0;
  let k = 0;
  while (k < all.length) {
    const cluster = [all[k++]];
    let cs = cluster[0].start, ce = cluster[0].end;
    // overlap: strictly inside the range, or two insertions at the same point; touching ranges stay independent
    while (k < all.length && (all[k].start < ce || (all[k].start === ce && all[k].end === all[k].start && ce === cs && cluster.some((c) => c.start === c.end && c.start === all[k].start)))) {
      cluster.push(all[k]);
      ce = Math.max(ce, all[k].end);
      k++;
    }
    out.push(...base.slice(cursor, cs));
    const o = cluster.filter((h) => h.side === "o"), t = cluster.filter((h) => h.side === "t");
    if (!t.length) out.push(...apply(base, o, cs, ce));
    else if (!o.length) out.push(...apply(base, t, cs, ce));
    else {
      const a = apply(base, o, cs, ce), b = apply(base, t, cs, ce);
      if (a.join("\u0000") === b.join("\u0000")) out.push(...a);
      else { conflicts.push({ base: base.slice(cs, ce), ours: a, theirs: b }); out.push(...a); }
    }
    cursor = ce;
  }
  out.push(...base.slice(cursor));
  return { clean: conflicts.length === 0, merged: joinBlocks(out), conflicts };
}

/** Block diff for display: [{ type: "same"|"add"|"del", text }]. Changed pairs are matched for word-level diff in the UI. */
function blockDiff(aMd, bMd) {
  const a = splitBlocks(aMd), b = splitBlocks(bMd);
  const out = [];
  for (const p of diffArrays(a, b))
    for (const text of p.value) out.push({ type: p.added ? "add" : p.removed ? "del" : "same", text });
  return out;
}

module.exports = { splitBlocks, joinBlocks, normalizeDoc, merge3, blockDiff };
