// The share of each kind of source (percentages in whole steps of 5 that always add up to 100).
export const MIX_KEYS = ["lectures", "printed", "research", "legal"];
const STEP = 5;
const zero = () => Object.fromEntries(MIX_KEYS.map((k) => [k, 0]));

/** 100 split evenly over the given kinds, in steps of 5 (the remainder goes to the first ones). */
export function equalSplit(kinds) {
  const out = zero();
  const ks = MIX_KEYS.filter((k) => kinds.includes(k));
  if (!ks.length) return out;
  const units = 100 / STEP;
  const base = Math.floor(units / ks.length);
  let extra = units - base * ks.length;
  for (const k of ks) { out[k] = (base + (extra > 0 ? 1 : 0)) * STEP; extra--; }
  return out;
}

/** Turns a kind on (everything is shared again) or off (its share goes to the others). At least one kind stays on. */
export function toggleKind(mix, key) {
  const on = MIX_KEYS.filter((k) => mix[k] > 0);
  if (mix[key] > 0) return on.length <= 1 ? mix : equalSplit(on.filter((k) => k !== key));
  return equalSplit([...on, key]);
}

/** Moves `delta` points (a multiple of 5) to `key` from the largest other kind that is on, so the total stays 100. */
export function shiftShare(mix, key, delta) {
  if (!(mix[key] > 0) || !delta) return mix;
  const out = { ...mix };
  const others = MIX_KEYS.filter((k) => k !== key && out[k] > 0).sort((a, b) => out[b] - out[a]);
  if (!others.length) return mix;
  if (delta > 0) {
    const give = Math.min(delta, out[others[0]] - STEP);
    if (give <= 0) return mix;
    out[key] += give; out[others[0]] -= give;
  } else {
    const take = Math.min(-delta, out[key] - STEP);
    if (take <= 0) return mix;
    out[key] -= take; out[others[others.length - 1]] += take;
  }
  return out;
}

export const mixTotal = (mix) => MIX_KEYS.reduce((n, k) => n + (mix[k] || 0), 0);
