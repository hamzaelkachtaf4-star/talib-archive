// Runs gapRadar.analyze off the main thread (see analyzeIsolated in gapRadar.js).
const { parentPort, workerData } = require("worker_threads");
const { analyze } = require("./gapRadar");

try {
  parentPort.postMessage({ ok: analyze(workerData) });
} catch (e) {
  parentPort.postMessage({ error: e.message });
}
