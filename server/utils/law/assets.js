// Immutable, content-addressed originals (spec §1.2, §4.3): storage/law/assets/<sha[0:2]>/<sha>.<ext>.
// A file is written once and never modified; AI output lives in LawDerivative, never here.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { lawPath } = require("./storage");

const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/amr": "amr",
  "audio/3gpp": "3gp",
  "application/pdf": "pdf",
};

const KINDS = ["photo", "audio", "pdf", "other"];

function baseMime(mime = "") {
  return String(mime).split(";")[0].trim().toLowerCase();
}

function extFor(mime) {
  return EXT[baseMime(mime)] || "bin";
}

function kindFor(mime) {
  const m = baseMime(mime);
  if (m.startsWith("image/")) return "photo";
  if (m.startsWith("audio/") || m === "video/webm") return "audio";
  if (m === "application/pdf") return "pdf";
  return "other";
}

/** Relative path (stored in DB) for a hash + mime. */
function assetRelPath(sha256, mime) {
  return path.join(sha256.slice(0, 2), `${sha256}.${extFor(mime)}`);
}

function assetAbsPath(relPath) {
  const root = lawPath("assets");
  const abs = path.resolve(root, relPath);
  if (!abs.startsWith(root + path.sep))
    throw new Error("path escapes asset store");
  return abs;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/**
 * Moves a verified temp file into the store. If the content already exists, the temp file is discarded
 * and the stored original is left untouched (write-once).
 */
function commitToStore(tmpFile, sha256, mime) {
  const rel = assetRelPath(sha256, mime);
  const abs = assetAbsPath(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (fs.existsSync(abs)) {
    fs.rmSync(tmpFile, { force: true });
  } else {
    fs.renameSync(tmpFile, abs);
    fs.chmodSync(abs, 0o444);
  }
  return rel;
}

module.exports = {
  KINDS,
  EXT,
  baseMime,
  extFor,
  kindFor,
  assetRelPath,
  assetAbsPath,
  sha256File,
  commitToStore,
};
