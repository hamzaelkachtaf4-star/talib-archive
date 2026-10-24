// Runs readCtb off the main thread (see readCtbIsolated in ctb.js). Parsing a user-supplied notebook is CPU and
// memory work the Express event loop must not wait for, and a worker can be killed on a timeout.
const { parentPort, workerData } = require("worker_threads");
const { readCtb } = require("./ctb");

try {
  parentPort.postMessage({ ok: readCtb(workerData.file, workerData.opts) });
} catch (e) {
  // Only notebook errors carry a code the API may show; SQLite/OS codes (ENOENT, ERR_SQLITE_ERROR, ...) become "unreadable".
  parentPort.postMessage({ error: { name: e.name, code: e.name === "CtbError" ? e.code : "unreadable", message: e.message } });
}
