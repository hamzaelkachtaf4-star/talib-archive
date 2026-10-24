// Round-robin across subjects (spec §8.1: interleave due cards by default). Mirrors the server's order.
export function interleave(cards) {
  const buckets = new Map();
  for (const c of cards) {
    if (!buckets.has(c.subjectId)) buckets.set(c.subjectId, []);
    buckets.get(c.subjectId).push(c);
  }
  const queues = [...buckets.values()];
  const out = [];
  while (queues.some((q) => q.length))
    for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}
