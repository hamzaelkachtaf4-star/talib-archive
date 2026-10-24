// Integration-test helper: a throwaway SQLite DB built from the current Prisma schema, with the LAW-OS
// models pointed at it through dbClient.setDb(). Never touches storage/anythingllm.db.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { setDb } = require("../dbClient");
const { setTestFallbackUser } = require("../tenant");

const SERVER_DIR = path.resolve(__dirname, "../../..");
let schemaSql = null;

function schemaToSql() {
  if (schemaSql) return schemaSql;
  schemaSql = execFileSync(
    path.join(SERVER_DIR, "node_modules/.bin/prisma"),
    [
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      cwd: SERVER_DIR,
      encoding: "utf8",
      env: { ...process.env, CHECKPOINT_DISABLE: "1" },
    }
  );
  return schemaSql;
}

async function createTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-it-"));
  const file = path.join(dir, "test.db");
  const { DatabaseSync } = require("node:sqlite");
  const raw = new DatabaseSync(file);
  raw.exec(schemaToSql());
  raw.close();
  const { PrismaClient } = require("@prisma/client");
  const client = new PrismaClient({
    datasources: { db: { url: `file:${file}` } },
  });
  setDb(client);
  // Like the real migration: an owner admin, which every test acts as unless it switches user.
  const owner = await client.users.create({
    data: { username: "qanouni-owner", password: "!", role: "admin" },
  });
  setTestFallbackUser(owner.id);
  return {
    client,
    file,
    ownerId: owner.id,
    async cleanup() {
      await client.$disconnect();
      setDb(null);
      setTestFallbackUser(null);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { createTempDb };
