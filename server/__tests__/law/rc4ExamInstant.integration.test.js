// RC4 Phase 5: a QCM answer is checked as soon as it is given; a revealed answer is locked and counts in the final score.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); jest.spyOn(Math, "random").mockReturnValue(0.999); });
afterEach(async () => { jest.restoreAllMocks(); await h.stop(); });

const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
const TEXT = "المسؤولية التقصيرية تقوم على ثلاثة أركان هي الخطأ والضرر والعلاقة السببية بينهما. ويُقصد بالخطأ الإخلال بواجب قانوني.";
const qcm = (over = {}) => ({ question: "ما أركان المسؤولية التقصيرية؟", options: ["الخطأ والضرر والسببية", "العقد فقط", "الضرر فقط", "لا شيء"], correctIndex: 0, explanation: "ثلاثة أركان", cite: "S1", ...over });

async function drill(count = 2) {
  const u = await h.signUp("سلمى", "i@example.ma");
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: SCOPE });
  const mid = (await h.call("GET", "/law/modules?semester=S3", { token: u.token })).body.modules[0].id;
  await h.call("POST", `/law/modules/${mid}/sources`, { token: u.token, body: { kind: "text", text: TEXT } });
  h.aiReply = { items: [qcm(), qcm({ question: "س2", correctIndex: 3, options: ["أ", "ب", "ج", "د"] })].slice(0, count) };
  const d = (await h.call("POST", `/law/exam/modules/${mid}/drills`, { token: u.token, body: { type: "qcm", count } })).body.drill;
  return { u, d };
}
const check = (u, d, body) => h.call("POST", `/law/exam/drills/${d.id}/check`, { token: u.token, body });

describe("QCM instant feedback", () => {
  test("a checked answer reveals only that question's key, with its source citation", async () => {
    const { u, d } = await drill();
    const r = await check(u, d, { index: 0, choice: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ correct: false, correctIndex: 0, explanation: "ثلاثة أركان", cite: { label: "S1" } });
    const got = (await h.call("GET", `/law/exam/drills/${d.id}`, { token: u.token })).body.drill;
    expect(got.status).toBe("open");
    expect(got.revealed["0"]).toMatchObject({ chosen: 1, correct: false, correctIndex: 0 });
    expect(got.revealed["1"]).toBeUndefined();
    expect(JSON.stringify(got.prompt)).not.toMatch(/correctIndex|explanation/);
  });

  test("a revealed answer is locked: checking again or submitting another choice cannot change it", async () => {
    const { u, d } = await drill();
    await check(u, d, { index: 0, choice: 1 });
    const again = await check(u, d, { index: 0, choice: 0 });
    expect(again.body).toMatchObject({ chosen: 1, correct: false });
    const done = await h.call("POST", `/law/exam/drills/${d.id}/submit`, { token: u.token, body: { answers: [0, 3] } });
    expect(done.status).toBe(200);
    expect(done.body.drill.feedback.items.map((i) => [i.chosen, i.correct])).toEqual([[1, false], [3, true]]);
    expect(done.body.drill.score).toBe(50);
  });

  test("rejects bad input, other types, other students and submitted drills", async () => {
    const { u, d } = await drill();
    for (const body of [{}, { index: 5, choice: 0 }, { index: 0, choice: 4 }, { index: -1, choice: 0 }, { index: "0", choice: 0 }, { index: 0, choice: 1.5 }]) {
      expect((await check(u, d, body)).status).toBe(400);
    }
    const o = await h.signUp("يوسف", "o2@example.ma");
    expect((await check(o, d, { index: 0, choice: 0 })).status).toBe(404);
    await h.call("POST", `/law/exam/drills/${d.id}/submit`, { token: u.token, body: { answers: [0, 0] } });
    expect((await check(u, d, { index: 0, choice: 0 })).status).toBe(409);
  });
});
