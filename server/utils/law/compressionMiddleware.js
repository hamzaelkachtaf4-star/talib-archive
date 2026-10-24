// Qanouni perf: HTTP compression for dynamic responses. Server-sent event streams are skipped so every
// event reaches the client immediately (upstream chat, LAW-OS job progress).
const compression = require("compression");

function shouldCompress(req, res) {
  const type = String(res.getHeader("Content-Type") || "");
  if (type.includes("text/event-stream")) return false;
  if (String(req.headers.accept || "").includes("text/event-stream")) return false;
  if (req.headers["x-no-compression"]) return false;
  return compression.filter(req, res);
}

function lawCompression() {
  return compression({ filter: shouldCompress, threshold: 1024 });
}

module.exports = { lawCompression, shouldCompress };
