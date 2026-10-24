// RC4: the migration that removes invented sessions only deletes sessions nobody touched.
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SQL = fs.readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261201130000_rc4_drop_placeholder_sessions/migration.sql"), "utf8");

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE "LawTimetableSlot" ("id" TEXT PRIMARY KEY, "subjectId" TEXT, "moduleId" TEXT, "weekday" INTEGER, "startTime" TEXT, "endTime" TEXT, "kind" TEXT, "room" TEXT, "professor" TEXT, "groupLabel" TEXT, "activeFrom" TEXT, "activeTo" TEXT, "placeholder" INTEGER)`);
  return d;
}
const add = (d, id, o = {}) => {
  const r = { subjectId: null, moduleId: null, weekday: 1, startTime: "08:30", endTime: "10:00", kind: "amphi", room: null, professor: null, groupLabel: null, activeFrom: null, activeTo: null, placeholder: 1, ...o };
  d.prepare(`INSERT INTO "LawTimetableSlot" VALUES (:id,:subjectId,:moduleId,:weekday,:startTime,:endTime,:kind,:room,:professor,:groupLabel,:activeFrom,:activeTo,:placeholder)`).run({ id, ...r });
};

test("untouched seeded sessions go; anything a student edited stays", () => {
  const d = db();
  add(d, "seed1");
  add(d, "seed2", { weekday: 3, startTime: "10:15", endTime: "11:45" });
  add(d, "seed3", { weekday: 4 });
  add(d, "room", { room: "Amphi 3" });
  add(d, "prof", { professor: "د. العلمي" });
  add(d, "time", { startTime: "09:00", endTime: "10:30" });
  add(d, "td", { kind: "TD" });
  add(d, "module", { moduleId: "m1" });
  add(d, "real", { placeholder: 0 });
  d.exec(SQL);
  expect(d.prepare(`SELECT id FROM "LawTimetableSlot" ORDER BY id`).all().map((r) => r.id)).toEqual(["module", "prof", "real", "room", "td", "time"]);
});
