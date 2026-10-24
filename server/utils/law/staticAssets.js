// Qanouni static delivery (perf): Vite emits content-hashed chunks under /assets plus .br/.gz siblings
// (frontend/vite.config.js). Hashed files are cached forever; the unhashed entry (index.js/index.css) and
// the service worker always revalidate. Pre-compressed files are served as-is so the dv6 never spends CPU
// compressing the bundle; everything else (API JSON, HTML) goes through `compression()` in index.js.
const fs = require("fs");
const path = require("path");

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";
const TYPES = { ".js": "application/javascript; charset=UTF-8", ".css": "text/css; charset=UTF-8" };

function isHashedAsset(urlPath) {
  return urlPath.startsWith("/assets/");
}

/** Cache-Control for a static file, by its public URL path. */
function cacheControlFor(urlPath) {
  if (isHashedAsset(urlPath)) return IMMUTABLE;
  if (/\.(js|css|json|html)$/.test(urlPath)) return REVALIDATE;
  return "public, max-age=86400";
}

/** express.static `setHeaders` hook. */
function setStaticCacheHeaders(publicDir) {
  return (res, filePath) => {
    const urlPath = "/" + path.relative(publicDir, filePath).split(path.sep).join("/");
    res.setHeader("Cache-Control", cacheControlFor(urlPath));
  };
}

function pickEncoding(acceptEncoding = "") {
  if (/\bbr\b/.test(acceptEncoding)) return ["br", ".br"];
  if (/\bgzip\b/.test(acceptEncoding)) return ["gzip", ".gz"];
  return null;
}

/** Serves `<file>.br` / `<file>.gz` for JS and CSS when the client accepts it and the sibling exists. */
function precompressed(publicDir) {
  const root = path.resolve(publicDir);
  const exists = new Map();
  const has = (file) => {
    if (!exists.has(file)) exists.set(file, fs.existsSync(file));
    return exists.get(file);
  };
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const ext = path.extname(req.path);
    if (!TYPES[ext]) return next();
    const enc = pickEncoding(req.headers["accept-encoding"]);
    if (!enc) return next();
    const file = path.resolve(root, "." + decodeURIComponent(req.path));
    if (!file.startsWith(root + path.sep)) return next();
    // Unhashed files change on every deploy: only trust the in-memory cache for hashed chunks.
    const candidate = file + enc[1];
    const found = isHashedAsset(req.path) ? has(candidate) : fs.existsSync(candidate);
    if (!found) return next();
    res.setHeader("Content-Encoding", enc[0]);
    res.setHeader("Content-Type", TYPES[ext]);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", cacheControlFor(req.path));
    res.setHeader("X-Frame-Options", "DENY");
    res.sendFile(candidate, { headers: {} }, (err) => err && next(err));
  };
}

module.exports = { precompressed, setStaticCacheHeaders, cacheControlFor, pickEncoding };
