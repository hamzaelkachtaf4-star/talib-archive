// Regression (found in the Android WebView): the server sends "Vary: Origin", module scripts are fetched
// with an Origin header, and a Vary-aware cache lookup missed every cached chunk offline. Every lookup
// in the Qanouni service worker must ignore Vary.
const fs = require("fs");
const path = require("path");

test("every service-worker cache lookup ignores Vary", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../frontend/public/lawos-sw.js"),
    "utf8"
  );
  expect(src).toMatch(/const MATCH = \{ ignoreVary: true \}/);
  const calls = src.match(/caches\.match\([^)]*\)/g) || [];
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) expect(c).toMatch(/,\s*MATCH\)$/);
});
