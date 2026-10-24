// Web push for LAW-OS (spec §8.5): close-out reminder and Sunday recap. VAPID keys come from env, or
// from the keys upstream AnythingLLM already generated (storage/push-notifications/vapid-keys.json).
const fs = require("fs");
const path = require("path");
const { db, rawDb } = require("./dbClient");

let sender = null; // test seam: async (subscription, payloadString) => void

function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  const dir =
    process.env.NODE_ENV === "development"
      ? path.resolve(__dirname, "../../storage/push-notifications")
      : path.resolve(process.env.STORAGE_DIR || "", "push-notifications");
  try {
    return JSON.parse(
      fs.readFileSync(path.join(dir, "vapid-keys.json"), "utf8")
    );
  } catch {
    return { publicKey: null, privateKey: null };
  }
}

function setPushSender(fn) {
  sender = fn;
}

function defaultSender() {
  const webpush = require("web-push");
  const keys = vapidKeys();
  if (!keys.publicKey || !keys.privateKey) throw new Error("no VAPID keys");
  webpush.setVapidDetails(
    "mailto:lawos@localhost",
    keys.publicKey,
    keys.privateKey
  );
  return (sub, payload) =>
    webpush.sendNotification(sub, payload, { TTL: 12 * 3600 });
}

/** Sends to every subscription of the context user; prunes the ones the push service says are gone. */
async function sendToAll({ title, body, url = "/law/today", tag = "lawos" }) {
  const subs = await db().lawPushSubscription.findMany();
  if (!subs.length) return { sent: 0, pruned: 0 };
  const send = sender || defaultSender();
  const payload = JSON.stringify({ title, body, url, tag });
  let sent = 0;
  let pruned = 0;
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, payload);
      await db().lawPushSubscription.update({
        where: { id: s.id },
        data: { lastSuccessAt: new Date() },
      });
      sent++;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db().lawPushSubscription.delete({ where: { id: s.id } });
        pruned++;
      } else console.error("[LAW-OS] push failed:", e.message);
    }
  }
  return { sent, pruned };
}

async function subscribe({ subscription, deviceId = null }) {
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (
    typeof endpoint !== "string" ||
    !/^https:\/\//.test(endpoint) ||
    !keys?.p256dh ||
    !keys?.auth
  )
    return { error: "invalid subscription" };
  // A browser has one endpoint. If another account subscribed it before (shared phone, new login), that
  // account no longer receives on this device: the endpoint moves to the current user.
  if (!(await db().lawPushSubscription.findFirst({ where: { endpoint } })))
    await rawDb().lawPushSubscription.deleteMany({ where: { endpoint } });
  const row = await db().lawPushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, keys: JSON.stringify(keys), deviceId },
    update: { keys: JSON.stringify(keys), deviceId },
  });
  return { subscription: { id: row.id }, error: null };
}

async function unsubscribe(endpoint) {
  const r = await db().lawPushSubscription.deleteMany({ where: { endpoint } });
  return r.count;
}

module.exports = {
  sendToAll,
  subscribe,
  unsubscribe,
  vapidKeys,
  setPushSender,
};
