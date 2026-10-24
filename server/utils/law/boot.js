const prisma = require("../prisma");
const { applySqlitePragmas } = require("./db");
const { ensureLawDirs } = require("./storage");
const { ftsDb } = require("./fts");
const { lawConfig } = require("./config");

// Called once from server/index.js. Never throws: LAW-OS problems must not take down the upstream app,
// and /api/law/health reports what failed.
const bootState = { ok: false, journalMode: null, errors: [] };

async function bootLawOS() {
  try {
    ensureLawDirs();
  } catch (e) {
    bootState.errors.push(`storage: ${e.message}`);
  }
  try {
    bootState.journalMode = await applySqlitePragmas(prisma);
  } catch (e) {
    bootState.errors.push(`sqlite: ${e.message}`);
  }
  try {
    ftsDb();
  } catch (e) {
    bootState.errors.push(`fts: ${e.message}`);
  }

  const cfg = lawConfig();
  const { ai } = cfg;
  if (cfg.worker && process.env.NODE_ENV !== "test")
    require("./worker").start();
  try {
    require("./mailer").logMailStatus();
  } catch {}
  if (!ai.geminiEnabled)
    console.log("[LAW-OS] Gemini not configured: capture/OCR AI disabled.");
  if (!ai.deepseekEnabled)
    console.log("[LAW-OS] DeepSeek not configured: critique AI disabled.");
  bootState.ok = bootState.errors.length === 0;
  if (!bootState.ok) console.error("[LAW-OS] boot errors:", bootState.errors);
  return bootState;
}

module.exports = { bootLawOS, bootState };
