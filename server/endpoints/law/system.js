const prisma = require("../../utils/prisma");
const { reqBody } = require("../../utils/http");
const { auth, admin } = require("./helpers");
const { isAdmin } = require("../../utils/law/tenant");
const { LawSetting } = require("../../models/lawSetting");
const { publicLawConfig } = require("../../utils/law/config");
const { journalMode } = require("../../utils/law/db");
const { diskSpace } = require("../../utils/law/storage");
const { ftsTables, rebuildFts } = require("../../utils/law/fts");
const { bootState } = require("../../utils/law/boot");
const { LawJob } = require("../../models/lawJob");

const MIN_FREE_BYTES = 1024 * 1024 * 1024; // warn below 1 GB free

function lawSystemEndpoints(router) {
  // Unauthenticated on purpose: used by the Docker healthcheck. Returns no user content.
  router.get("/law/health", async (_req, res) => {
    const checks = {
      boot: bootState.ok,
      db: false,
      wal: false,
      fts: false,
      disk: null,
    };
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      checks.db = true;
      checks.wal = (await journalMode(prisma)) === "wal";
    } catch {}
    try {
      checks.fts = ftsTables().length >= 3;
    } catch {}
    const disk = diskSpace();
    if (disk) checks.disk = { ...disk, low: disk.freeBytes < MIN_FREE_BYTES };

    const healthy = checks.db && checks.wal && checks.fts && !checks.disk?.low;
    res.status(checks.db ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      checks,
      errors: bootState.errors,
    });
  });

  router.get("/law/settings", auth, async (_req, res) => {
    try {
      // Students get no AI configuration at all (docs/plans/qanouni.md §4).
      const { ai, ...config } = publicLawConfig();
      res.json({
        settings: await LawSetting.all(),
        config: isAdmin() ? { ...config, ai } : config,
        me: res.locals.lawUser,
      });
    } catch (e) {
      console.error("[LAW-OS] settings read failed:", e.message);
      res.status(500).json({ error: "settings_unavailable" });
    }
  });

  router.patch("/law/settings", auth, async (req, res) => {
    try {
      const updates = reqBody(req) || {};
      const { settings, error } = await LawSetting.update(updates);
      if (error === "forbidden")
        return res.status(403).json({ error: "admin_only" });
      if (error) return res.status(400).json({ error });
      // Raising a budget releases the jobs parked by the budget gate (spec §6.3).
      if ("aiBudgetGeminiUsd" in updates || "aiBudgetDeepseekUsd" in updates) {
        await LawJob.resumeBudgetPaused();
        require("../../utils/law/worker").kick();
      }
      res.json({ settings });
    } catch (e) {
      console.error("[LAW-OS] settings update failed:", e.message);
      res.status(500).json({ error: "settings_update_failed" });
    }
  });

  router.post("/law/admin/rebuild-index", admin, async (_req, res) => {
    try {
      res.json({ rebuilt: await rebuildFts() });
    } catch (e) {
      console.error("[LAW-OS] FTS rebuild failed:", e.message);
      res.status(500).json({ error: "rebuild_failed" });
    }
  });
}

module.exports = { lawSystemEndpoints };
