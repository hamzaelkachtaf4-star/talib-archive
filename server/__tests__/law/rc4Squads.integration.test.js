// RC4 Phase 8: a work group has a module, is public or private, and its owner decides who publishes.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

// pdf-parse 1.1.1 cannot read pdf-lib fixtures (see courseWindowing): the mock hands back the text a real text layer would carry.
jest.mock("pdf-parse/lib/pdf-parse.js", () => async (buf, opts) => {
  await opts.pagerender({ pageIndex: 0, getTextContent: async () => ({ items: [{ str: "Obligations contractuelles", transform: [0, 0, 0, 0, 0, 0] }] }) });
});

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };
let n = 0;
async function user(name) {
  const u = await h.signUp(name, `g${++n}@example.ma`);
  await h.call("POST", "/law/auth/consent", { token: u.token, body: CONSENT });
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: { facultyCode: "FSJES-AC" } });
  return u;
}
const api = (u, method, path, body) => h.call(method, path, { token: u.token, body });
const doc = (u) => api(u, "POST", "/law/squads/docs", { type: "summary", title: "ملخص", content: "فقرة أولى\n\nفقرة ثانية" });

describe("work group settings", () => {
  test("create takes a module, visibility and publish mode; defaults are private + members propose", async () => {
    const o = await user("مالك");
    const r = await api(o, "POST", "/law/squads/create", { name: "فريق المسؤولية", moduleTitle: "المسؤولية المدنية", visibility: "public", publishMode: "admin_only" });
    expect(r.status).toBe(201);
    expect(r.body.squad).toMatchObject({ name: "فريق المسؤولية", moduleTitle: "المسؤولية المدنية", visibility: "public", publishMode: "admin_only" });
    const o2 = await user("ثانية");
    const d = await api(o2, "POST", "/law/squads/create", { name: "فريق" });
    expect(d.body.squad).toMatchObject({ visibility: "private", publishMode: "members_propose", moduleTitle: null });
    expect((await api(await user("ثالثة"), "POST", "/law/squads/create", { name: "x", visibility: "secret" })).status).toBe(400);
  });

  test("public groups are listed and joinable without a code; private ones are neither", async () => {
    const o = await user("مالك");
    await api(o, "POST", "/law/squads/create", { name: "عامة", moduleTitle: "قانون الشركات", visibility: "public" });
    const p = await user("خاصة-مالك");
    await api(p, "POST", "/law/squads/create", { name: "خاصة" });
    const s = await user("طالب");
    const list = await api(s, "GET", "/law/squads/public");
    expect(list.status).toBe(200);
    expect(list.body.squads.map((x) => x.name)).toEqual(["عامة"]);
    expect(list.body.squads[0]).toMatchObject({ moduleTitle: "قانون الشركات", memberCount: 1 });
    expect(list.body.squads[0].inviteCode).toBeUndefined();
    const priv = await h.tmp.client.lawSquad.findFirst({ where: { name: "خاصة" } });
    expect((await api(s, "POST", `/law/squads/public/${priv.id}/join`)).status).toBe(404);
    const joined = await api(s, "POST", `/law/squads/public/${list.body.squads[0].id}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body.squad.name).toBe("عامة");
    expect((await api(s, "POST", `/law/squads/public/${list.body.squads[0].id}/join`)).status).toBe(409);
  });

  test("only an owner or admin changes the settings", async () => {
    const o = await user("مالك");
    const c = await api(o, "POST", "/law/squads/create", { name: "فريق" });
    const m = await user("عضو");
    await api(m, "POST", "/law/squads/join", { code: c.body.squad.inviteCode });
    expect((await api(m, "PATCH", "/law/squads/settings", { publishMode: "admin_only" })).status).toBe(403);
    const ok = await api(o, "PATCH", "/law/squads/settings", { publishMode: "admin_only", visibility: "public", moduleTitle: "قانون الشغل" });
    expect(ok.status).toBe(200);
    expect(ok.body.squad).toMatchObject({ publishMode: "admin_only", visibility: "public", moduleTitle: "قانون الشغل" });
    expect((await api(o, "PATCH", "/law/squads/settings", { publishMode: "anyone" })).status).toBe(400);
  });

  test("admin_only: members cannot publish or propose; members_propose: they propose, only admins publish in place", async () => {
    const o = await user("مالك");
    const c = await api(o, "POST", "/law/squads/create", { name: "فريق", publishMode: "admin_only" });
    const m = await user("عضو");
    await api(m, "POST", "/law/squads/join", { code: c.body.squad.inviteCode });
    const d = await doc(o);
    expect(d.status).toBe(201);
    expect((await doc(m)).status).toBe(403);
    expect((await doc(m)).body.error).toBe("admin_only_publish");
    const propose = await api(m, "POST", `/law/squads/docs/${d.body.doc.id}/change-requests`, { title: "تعديل", content: "فقرة أولى معدلة\n\nفقرة ثانية" });
    expect(propose.status).toBe(403);
    await api(o, "PATCH", "/law/squads/settings", { publishMode: "members_propose" });
    const again = await api(m, "POST", `/law/squads/docs/${d.body.doc.id}/change-requests`, { title: "تعديل", content: "فقرة أولى معدلة\n\nفقرة ثانية" });
    expect(again.status).toBe(201);
  });
});

describe("work group documents", () => {
  async function team() {
    const o = await user("مالك");
    await api(o, "POST", "/law/squads/create", { name: "فريق", moduleTitle: "المسؤولية المدنية" });
    return o;
  }

  test("a memo is a document type of its own, next to summaries and solved cases", async () => {
    const o = await team();
    for (const type of ["summary", "memo", "case_brief"]) {
      const r = await api(o, "POST", "/law/squads/docs", { type, title: `عنوان ${type}`, content: "نص الوثيقة" });
      expect(r.status).toBe(201);
    }
    expect((await api(o, "POST", "/law/squads/docs", { type: "chat", title: "x", content: "y" })).status).toBe(400);
  });

  test("an uploaded PDF becomes editable text (and a file that is not a readable PDF is refused)", async () => {
    const o = await team();
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    page.drawText("Obligations contractuelles", { x: 50, y: 700, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) });
    const b64 = Buffer.from(await pdf.save({ useObjectStreams: false })).toString("base64");
    const r = await api(o, "POST", "/law/squads/docs/extract", { file: `data:application/pdf;base64,${b64}` });
    expect(r.status).toBe(200);
    expect(r.body.text).toContain("Obligations contractuelles");
    const bad = await api(o, "POST", "/law/squads/docs/extract", { file: `data:application/pdf;base64,${Buffer.from("not a pdf").toString("base64")}` });
    expect(bad.status).toBe(400);
    expect((await api(o, "POST", "/law/squads/docs/extract", { file: "data:image/png;base64,AAAA" })).status).toBe(400);
    expect((await api(o, "POST", "/law/squads/docs/extract", {})).status).toBe(400);
  });

  test("only members of a group can extract (no squad, no endpoint)", async () => {
    const lone = await user("وحيدة");
    expect((await api(lone, "POST", "/law/squads/docs/extract", { file: "data:application/pdf;base64,AAAA" })).status).not.toBe(200);
  });
});

describe("review fixes", () => {
  test("a member removed from a public group cannot walk back in through the listing", async () => {
    const o = await user("مالك");
    const c = await api(o, "POST", "/law/squads/create", { name: "عامة", visibility: "public" });
    const m = await user("عضو");
    const id = c.body.squad.id;
    expect((await api(m, "POST", `/law/squads/public/${id}/join`)).status).toBe(200);
    expect((await api(o, "DELETE", `/law/squads/members/${m.user.id}`)).status).toBe(200);
    const again = await api(m, "POST", `/law/squads/public/${id}/join`);
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(again.body)).toContain("removed_from_squad");
    expect((await api(m, "GET", "/law/squads/my")).body.squad).toBeFalsy();
  });

  test("admin_only also stops a member editing their own old document and rebasing", async () => {
    const o = await user("مالك");
    const c = await api(o, "POST", "/law/squads/create", { name: "فريق" });
    const m = await user("عضو");
    await api(m, "POST", "/law/squads/join", { code: c.body.squad.inviteCode });
    const d = (await doc(m)).body.doc; // allowed while members propose
    await api(o, "PATCH", "/law/squads/settings", { publishMode: "admin_only" });
    const got = (await api(m, "GET", `/law/squads/docs/${d.id}`)).body;
    expect(got).toMatchObject({ canEditDirect: false, canPropose: false });
    const edit = await api(m, "PATCH", `/law/squads/docs/${d.id}`, { content: "x", baseRevisionId: got.doc.headRevisionId });
    expect(edit.status).toBe(403);
  });
});
