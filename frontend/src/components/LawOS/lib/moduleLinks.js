import Law from "@/models/law";
import * as idb from "./idb";

// A capture queued on the phone is linked to its module by name (the device's batch id). When the phone is offline at that
// moment the link would be lost while the capture itself uploads later, so the link waits here and is retried.
const KEY = "moduleSourceLinks";
const read = async () => (await idb.getMeta(KEY).catch(() => null)) || [];

export async function queueModuleLink(moduleId, body) {
  const list = await read();
  if (!list.some((l) => l.body.clientBatchId === body.clientBatchId)) await idb.setMeta(KEY, [...list, { moduleId, body }]).catch(() => {});
}

/** Sends the waiting links. A link the server refuses for good (4xx other than rate limits) is dropped. Resolves the number sent. */
export async function flushModuleLinks() {
  const list = await read();
  if (!list.length) return 0;
  const keep = [];
  let sent = 0;
  for (const l of list) {
    const r = await Law.moduleSourceAdd(l.moduleId, l.body);
    if (r.ok || r.status === 409) sent++; // 409: already linked
    else if (r.offline || r.status >= 500 || r.status === 429) keep.push(l);
    // other 4xx: the module or batch is gone / invalid; retrying would never help
  }
  await idb.setMeta(KEY, keep).catch(() => {});
  return sent;
}

export const pendingModuleLinks = async () => (await read()).length;
