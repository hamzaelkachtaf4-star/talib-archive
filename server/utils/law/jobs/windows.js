// Windowing for jobs that feed long documents to a model: bounded calls instead of one huge prompt, so token
// budgets, output limits and the 300 s deadline hold for a 200-page course.

/** Greedy windows of consecutive item indexes whose text stays under maxChars. An oversized item gets a window of its own. */
function windowByChars(items, textOf, maxChars) {
  if (!(maxChars > 0)) throw new Error("maxChars must be positive");
  const windows = [];
  let cur = [];
  let size = 0;
  items.forEach((item, i) => {
    const len = String(textOf(item) ?? "").length;
    if (cur.length && size + len > maxChars) {
      windows.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += len;
  });
  if (cur.length) windows.push(cur);
  return windows;
}

/** Runs of n consecutive elements; the last run may be shorter. */
function chunkEvery(arr, n) {
  if (!(n >= 1)) throw new Error("n must be >= 1");
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

module.exports = { windowByChars, chunkEvery };
