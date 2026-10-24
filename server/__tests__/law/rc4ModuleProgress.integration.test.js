// RC4 Phase 4: the module's progress recap: sessions attended (+/-), self-rated comprehension, and what the exam center says.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function setup() {
  const u = await h.signUp("سلمى", "p@example.ma");
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: SCOPE });
  const id = (await h.call("GET", "/law/modules?semester=S3", { token: u.token })).body.modules[0].id;
  return { u, id };
}
const put = (u, id, body) => h.call("PUT", `/law/modules/${id}/profile`, { token: u.token, body });
const recap = async (u, id) => (await h.call("GET", `/law/modules/${id}/recap`, { token: u.token })).body.recap;

describe("sessions attended and comprehension", () => {
  test("default to 0 / unrated and persist", async () => {
    const { u, id } = await setup();
    const d = (await h.call("GET", `/law/modules/${id}/profile`, { token: u.token })).body.profile;
    expect(d).toMatchObject({ sessionsAttended: 0, comprehension: null });
    const r = await put(u, id, { sessionsAttended: 7, comprehension: 4 });
    expect(r.body.profile).toMatchObject({ sessionsAttended: 7, comprehension: 4 });
    expect(await recap(u, id)).toMatchObject({ sessionsAttended: 7, comprehension: 4 });
    expect((await put(u, id, { comprehension: null })).body.profile.comprehension).toBeNull();
  });

  test("rejects out-of-range or non-integer values", async () => {
    const { u, id } = await setup();
    for (const body of [{ sessionsAttended: -1 }, { sessionsAttended: 1.5 }, { sessionsAttended: 1000 }, { sessionsAttended: "3" }, { comprehension: 0 }, { comprehension: 6 }, { comprehension: "x" }]) {
      expect((await put(u, id, body)).status).toBe(400);
    }
  });
});

describe("recap derived from the exam center", () => {
  test("drillAverage is the mean of submitted drills for this module only; completion percent from the path", async () => {
    const { u, id } = await setup();
    expect(await recap(u, id)).toMatchObject({ drillAverage: null, drillCount: 0, completionPct: 0 });
    const db = h.tmp.client;
    const other = (await h.call("GET", "/law/modules?semester=S3", { token: u.token })).body.modules[1].id;
    const mk = (moduleId, score, status = "submitted") => db.lawDrillAttempt.create({ data: { userId: u.user.id, moduleId, type: "qcm", promptJson: "{}", score, status } });
    await mk(id, 80); await mk(id, 60); await mk(id, null, "open"); await mk(other, 10);
    expect(await recap(u, id)).toMatchObject({ drillAverage: 70, drillCount: 2 });
  });
});
