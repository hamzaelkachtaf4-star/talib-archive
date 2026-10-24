// RC4 Phase 4: extracted lecture text can be read and corrected before the mentor structures it.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function setup(name = "سلمى", email = "s@example.ma") {
  const u = await h.signUp(name, email);
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: SCOPE });
  const id = (await h.call("GET", "/law/modules?semester=S3", { token: u.token })).body.modules[0].id;
  return { u, id };
}
const add = (u, id, text) => h.call("POST", `/law/modules/${id}/sources`, { token: u.token, body: { kind: "text", text } });

describe("source preview and edit", () => {
  test("GET returns the extracted text; PATCH replaces it and the size follows", async () => {
    const { u, id } = await setup();
    const s = (await add(u, id, "نص أولي بالخطأ")).body.source;
    const got = await h.call("GET", `/law/modules/${id}/sources/${s.id}`, { token: u.token });
    expect(got.status).toBe(200);
    expect(got.body.source).toMatchObject({ id: s.id, kind: "text", status: "ready", text: "نص أولي بالخطأ" });
    const patched = await h.call("PATCH", `/law/modules/${id}/sources/${s.id}`, { token: u.token, body: { text: "نص مصحح" } });
    expect(patched.status).toBe(200);
    expect(patched.body.source).toMatchObject({ text: "نص مصحح", chars: 7 });
    expect((await h.call("GET", `/law/modules/${id}/sources`, { token: u.token })).body.sources[0].chars).toBe(7);
  });

  test("empty, oversized or non-string text is refused; a source that is not ready cannot be edited", async () => {
    const { u, id } = await setup();
    const s = (await add(u, id, "نص")).body.source;
    for (const text of ["", "   ", 5, null, "x".repeat(60001)]) {
      expect((await h.call("PATCH", `/law/modules/${id}/sources/${s.id}`, { token: u.token, body: { text } })).status).toBe(400);
    }
    const pending = await h.tmp.client.lawLectureSource.create({ data: { userId: u.user.id, moduleId: id, kind: "audio", status: "processing" } });
    expect((await h.call("PATCH", `/law/modules/${id}/sources/${pending.id}`, { token: u.token, body: { text: "x" } })).status).toBe(409);
  });

  test("another student cannot read or edit the source", async () => {
    const { u, id } = await setup();
    const o = await h.signUp("يوسف", "o@example.ma");
    const s = (await add(u, id, "نص سري")).body.source;
    expect((await h.call("GET", `/law/modules/${id}/sources/${s.id}`, { token: o.token })).status).toBe(404);
    expect((await h.call("PATCH", `/law/modules/${id}/sources/${s.id}`, { token: o.token, body: { text: "اختراق" } })).status).toBe(404);
  });
});
