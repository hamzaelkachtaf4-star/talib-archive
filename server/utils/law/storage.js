const fs = require("fs");
const path = require("path");

// Storage layout (spec §4.3), namespaced under STORAGE_DIR/law because upstream already owns
// STORAGE_DIR/assets (logos, pfp). The main SQLite DB stays upstream's anythingllm.db (DECISIONS D-001).
const LAW_DIRS = ["assets", "derivatives", "corpus/sources", "uploads-tmp"];

function storageRoot() {
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.resolve(__dirname, "../../storage");
}

function lawPath(...parts) {
  return path.join(storageRoot(), "law", ...parts);
}

function ensureLawDirs() {
  for (const dir of LAW_DIRS) fs.mkdirSync(lawPath(dir), { recursive: true });
}

/**
 * Free/total bytes on the volume holding storage. Returns null if unsupported.
 */
function diskSpace() {
  try {
    const s = fs.statfsSync(storageRoot());
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

module.exports = { LAW_DIRS, storageRoot, lawPath, ensureLawDirs, diskSpace };
