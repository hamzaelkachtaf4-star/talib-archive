#!/usr/bin/env node
// Imports a student's course vault into their account.
//   node scripts/import-vault.js --email student@example.com --vault /path/to/S3 [--dry] [--replace]
// Run from /app/server (inside the container: docker exec lawos node scripts/import-vault.js …).
const { rawDb } = require("../utils/law/dbClient");
const V = require("../utils/law/vaultImport");

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const flag = (name) => process.argv.includes(name);

(async () => {
  const email = arg("--email");
  const vault = arg("--vault");
  if (!email || !vault) { console.error("usage: --email <address> --vault <dir> [--dry] [--replace]"); process.exit(2); }
  const profile = await rawDb().lawUserProfile.findFirst({ where: { email: email.toLowerCase() } });
  if (!profile) { console.error(`no account with email ${email}`); process.exit(1); }
  const subjects = V.readVault(vault);
  for (const s of subjects) console.log(`read  ${s.title}: plan ${V.countNodes(s.plan)} nodes, ${s.sessions.length} session note(s)${s.warnings.length ? ` [${s.warnings}]` : ""}`);
  const report = await V.importForUser(profile.userId, subjects, { dryRun: flag("--dry"), replace: flag("--replace") });
  console.log(JSON.stringify(report, null, 1));
  for (const w of report.warnings) console.log(`warning: ${w}`);
  await rawDb().$disconnect();
})().catch((e) => {
  console.error("FAILED:", e.message);
  if (e.report) console.error("done before the failure:", JSON.stringify(e.report.modules));
  process.exit(1);
});
