// Word-level diff (LCS over whitespace-separated tokens, whitespace kept). No dependency; blocks are paragraphs, so
// the token arrays stay small. Output: [{ type: "same"|"add"|"del", text }].
const tokens = (s) => String(s).split(/(\s+)/).filter((t) => t !== "");

export function wordDiff(a, b) {
  const x = tokens(a), y = tokens(b);
  const n = x.length, m = y.length;
  if (n * m > 400000) return [{ type: "del", text: a }, { type: "add", text: b }]; // pathological size: block replace
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { push("same", x[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push("del", x[i++]);
    else push("add", y[j++]);
  }
  while (i < n) push("del", x[i++]);
  while (j < m) push("add", y[j++]);
  return out;
}

/** Pairs consecutive del/add blocks (the changed paragraph) so the viewer can show word-level changes inside them. */
export function pairBlocks(blocks) {
  const out = [];
  for (let k = 0; k < blocks.length; k++) {
    const cur = blocks[k], next = blocks[k + 1];
    if (cur.type === "del" && next?.type === "add") { out.push({ type: "change", before: cur.text, after: next.text }); k++; }
    else out.push(cur);
  }
  return out;
}
