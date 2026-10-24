// Phase 6: /api/law/chat/* (grounded legal chat, attachments, quota) and the admin quota controls.
const express = require("express");
const { reqBody } = require("../../utils/http");
const { auth, admin, handle } = require("./helpers");
const { LawChat } = require("../../models/lawChat");
const quota = require("../../utils/law/aiQuota");
const { aiGuard } = require("../../utils/law/aiGuard");
const { rawDb } = require("../../utils/law/dbClient");
const { LawSetting } = require("../../models/lawSetting");

const STATUS = { not_found: 404, AI_QUOTA_EXCEEDED: 429, ai_unavailable: 503 };
const fail = (res, r) => {
  const { error, status, ...rest } = r;
  const code = status || STATUS[error] || 400;
  if (error === "AI_QUOTA_EXCEEDED") res.set("Retry-After", String(Math.max(1, Math.ceil((new Date(rest.resetAt) - Date.now()) / 1000))));
  return res.status(code).json({ error: { code: error, message: error, details: rest } });
};
// Raw bytes for attachments: only the allowlisted media types are parsed; everything else reaches the handler as an empty body.
const rawBody = express.raw({ type: Object.keys(LawChat.MIME), limit: LawChat.MAX_ATTACH_BYTES + 1024 });

function lawChatEndpoints(router) {
  router.get("/law/chat/quota", auth, handle("chat_quota", async (_req, res) => {
    res.json(await quota.status(res.locals.lawUser.id));
  }));
  router.get("/law/chat/suggested-scope", auth, handle("chat_suggest", async (_req, res) => {
    res.json(await LawChat.suggestedScope(res.locals.lawUser.id));
  }));
  router.get("/law/chat/threads", auth, handle("chat_threads", async (_req, res) => {
    res.json({ threads: await LawChat.listThreads(res.locals.lawUser.id) });
  }));
  router.post("/law/chat/threads", auth, handle("chat_thread_create", async (req, res) => {
    const r = await LawChat.createThread(res.locals.lawUser.id, reqBody(req));
    if (r.error) return fail(res, r);
    res.status(201).json({ thread: r.thread });
  }));
  router.get("/law/chat/threads/:id", auth, handle("chat_thread_get", async (req, res) => {
    const r = await LawChat.getThread(res.locals.lawUser.id, req.params.id);
    if (r.error) return fail(res, r);
    res.json({ thread: r.thread, messages: r.messages });
  }));
  router.patch("/law/chat/threads/:id/scope", auth, handle("chat_thread_scope", async (req, res) => {
    const r = await LawChat.setScope(res.locals.lawUser.id, req.params.id, reqBody(req).scope);
    if (r.error) return fail(res, r);
    res.json({ thread: r.thread });
  }));
  router.delete("/law/chat/threads/:id", auth, handle("chat_thread_delete", async (req, res) => {
    const r = await LawChat.deleteThread(res.locals.lawUser.id, req.params.id);
    if (r.error) return fail(res, r);
    res.json({ ok: true });
  }));
  router.post("/law/chat/threads/:id/messages", auth, aiGuard, handle("chat_send", async (req, res) => {
    const b = reqBody(req);
    const r = await LawChat.send(res.locals.lawUser.id, req.params.id, { text: b.text, attachmentIds: b.attachmentIds, locale: b.locale });
    if (r.error) return fail(res, r);
    res.status(201).json({ messages: r.messages, quota: r.quota });
  }));
  router.post("/law/chat/attachments", auth, aiGuard, rawBody, handle("chat_attach", async (req, res) => {
    const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const r = await LawChat.addAttachment(res.locals.lawUser.id, { mime, buffer: Buffer.isBuffer(req.body) ? req.body : null });
    if (r.error) return fail(res, r);
    res.status(201).json({ attachment: r.attachment });
  }));
  router.get("/law/chat/attachments/:id/file", auth, handle("chat_attach_file", async (req, res) => {
    const f = await LawChat.attachmentFile(res.locals.lawUser.id, req.params.id);
    if (!f) return fail(res, { error: "not_found" });
    res.set({ "Content-Type": f.mime, "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff" });
    res.sendFile(f.path);
  }));

  // ---- admin: quota controls ----
  router.get("/law/admin/ai-quota", admin, handle("quota_admin_get", async (_req, res) => {
    res.json({ limit: Number(await LawSetting.get("aiDailyLimit")), top: await quota.topUsage() });
  }));
  router.put("/law/admin/ai-quota", admin, handle("quota_admin_put", async (req, res) => {
    const r = await LawSetting.update({ aiDailyLimit: reqBody(req).limit });
    if (r.error) return res.status(400).json({ error: { code: "invalid_limit", message: r.error } });
    res.json({ limit: Number(await LawSetting.get("aiDailyLimit")) });
  }));
  router.put("/law/admin/users/:id/ai-limit", admin, handle("quota_user_limit", async (req, res) => {
    const id = Number(req.params.id);
    const limit = reqBody(req).limit;
    if (!Number.isInteger(id) || !(limit === null || (Number.isInteger(limit) && limit >= 0 && limit <= 1000))) return res.status(400).json({ error: { code: "invalid_limit", message: "invalid_limit" } });
    const r = await rawDb().lawUserProfile.updateMany({ where: { userId: id }, data: { aiDailyLimitOverride: limit } });
    if (!r.count) return res.status(404).json({ error: { code: "not_found", message: "not_found" } });
    res.json({ userId: id, limit });
  }));
}

module.exports = { lawChatEndpoints };
