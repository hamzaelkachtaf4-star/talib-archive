// RC2 1.1: per-user in-flight cap + per-IP rate limit in front of AI routes.
const http = require("http");
const express = require("express");
const { aiGuard, resetAiGuard } = require("../../../utils/law/aiGuard");

let server, base, release;
const ENV = process.env;

beforeEach((done) => {
  resetAiGuard();
  process.env = { ...ENV, AI_MAX_IN_FLIGHT: "2", AI_IP_PER_MINUTE: "1000" };
  const app = express();
  app.use((req, res, next) => { res.locals.lawUser = { id: Number(req.get("x-user")) || null }; next(); });
  app.post("/ai", aiGuard, (_req, res) => { release = release || []; release.push(() => res.json({ ok: true })); });
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterEach(() => new Promise((r) => { process.env = ENV; release = null; server.closeAllConnections?.(); server.close(() => r()); }));

const post = (user) => fetch(`${base}/ai`, { method: "POST", headers: { "x-user": String(user) } });

test("a third in-flight request from one user is refused; another user is unaffected; slot frees on completion", async () => {
  const p1 = post(1), p2 = post(1);
  await new Promise((r) => setTimeout(r, 100));
  expect((await post(1)).status).toBe(429);
  const other = post(2);
  await new Promise((r) => setTimeout(r, 50));
  release.splice(0).forEach((f) => f());
  expect((await p1).status).toBe(200);
  expect((await p2).status).toBe(200);
  expect((await other).status).toBe(200);
  const again = post(1);
  await new Promise((r) => setTimeout(r, 50));
  release.splice(0).forEach((f) => f());
  expect((await again).status).toBe(200);
});

test("per-IP rate limit", async () => {
  process.env.AI_IP_PER_MINUTE = "3";
  const out = [];
  for (let i = 0; i < 5; i++) {
    const p = post(i + 10);
    await new Promise((r) => setTimeout(r, 30));
    release.splice(0).forEach((f) => f());
    out.push((await p).status);
  }
  expect(out).toEqual([200, 200, 200, 429, 429]);
});

test("no session user -> 401", async () => {
  expect((await post("")).status).toBe(401);
});
