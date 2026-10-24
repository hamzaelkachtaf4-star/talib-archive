// utils/law/writeLock.js: queued in order, never two at once, re-entrant, a failure does not block the queue.
const { serialWrite } = require("../../../utils/law/writeLock");

test("runs one at a time, in order, re-entrant, survives failures", async () => {
  let running = 0;
  let maxRunning = 0;
  const order = [];
  const job = (name, ms) => () =>
    new Promise((resolve) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      setTimeout(() => {
        order.push(name);
        running--;
        resolve(name);
      }, ms);
    });
  const nested = serialWrite(async () => `outer+${await serialWrite(async () => "inner")}`);
  const failing = serialWrite(async () => {
    throw new Error("boom");
  });
  const results = await Promise.allSettled([serialWrite(job("a", 30)), nested, failing, serialWrite(job("b", 5)), serialWrite(job("c", 1))]);
  expect(results.map((r) => r.value ?? r.reason.message)).toEqual(["a", "outer+inner", "boom", "b", "c"]);
  expect(order).toEqual(["a", "b", "c"]);
  expect(maxRunning).toBe(1);
});
