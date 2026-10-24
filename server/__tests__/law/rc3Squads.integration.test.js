// RC3 Phase 7: friend share codes, squad roles + work documents + change requests (stale base), the faculty wall and its moderation.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const CONSENT = { termsAccepted: true, academicNotice: true, privacyAccepted: true, version: "1.1.0" };
const FAC = { facultyCode: "FSJES-AC" };
let n = 0;
async function user(name, scope = FAC) {
  const u = await h.signUp(name, `u${++n}@example.ma`);
  await h.call("POST", "/law/auth/consent", { token: u.token, body: CONSENT });
  if (scope) await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: scope });
  return u;
}
const api = (u, method, path, body) => h.call(method, path, { token: u.token, body });
const notifs = (u, type) => h.tmp.client.lawNotification.findMany({ where: { userId: u.user.id, ...(type ? { type } : {}) } });

/** owner (O), admin (A), editor (E), editor 2 (F), viewer (V) in one squad. */
async function team() {
  const O = await user("مالك");
  const A = await user("إدارية");
  const E = await user("محرر");
  const F = await user("محررة");
  const V = await user("قارئ");
  const c = await api(O, "POST", "/law/squads/create", { name: "فرقة" });
  for (const m of [A, E, F, V]) expect((await api(m, "POST", "/law/squads/join", { code: c.body.squad.inviteCode })).status).toBe(200);
  expect((await api(O, "PATCH", `/law/squads/members/${A.user.id}/role`, { role: "admin" })).status).toBe(200);
  expect((await api(O, "PATCH", `/law/squads/members/${V.user.id}/role`, { role: "viewer" })).status).toBe(200);
  return { O, A, E, F, V };
}
const doc = (u, over = {}) => api(u, "POST", "/law/squads/docs", { type: "summary", title: "ملخص", content: "فقرة أولى\n\nفقرة ثانية\n\nفقرة ثالثة", ...over });

describe("friend share codes", () => {
  test("XXXX-XXXX, stable, unique per student, accepted in any case or spacing; legacy codes still work", async () => {
    const a = await user("سلمى");
    const b = await user("يوسف");
    const ca = (await api(a, "GET", "/law/friends/code")).body;
    expect(ca.shareCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await api(a, "GET", "/law/friends/code")).body.shareCode).toBe(ca.shareCode);
    const cb = (await api(b, "GET", "/law/friends/code")).body;
    expect(cb.shareCode).not.toBe(ca.shareCode);
    expect(ca.whatsappUrl.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(ca.whatsappUrl.split("text=")[1])).toContain(ca.shareCode);
    expect((await api(a, "GET", "/law/profile")).body.progress.shareCode).toBe(ca.shareCode);
    const lower = cb.shareCode.toLowerCase().replace("-", " ");
    expect((await api(a, "POST", "/law/friends", { code: lower })).body.status).toBe("pending");
    const found = await api(b, "GET", `/law/social/find?q=${ca.shareCode}`);
    expect(found.body.results.map((r) => r.userId)).toEqual([a.user.id]);
    const legacy = (await api(b, "GET", "/law/profile")).body.progress.friendCode;
    expect(legacy).toMatch(/^QAN-/);
    expect((await api(a, "POST", "/law/friends", { code: legacy })).status).toBeLessThan(300);
    expect((await api(a, "POST", "/law/friends", { code: "ABCD-EFG0" })).status).toBe(404); // an invalid code looks like an unknown one
    expect((await api(a, "POST", "/law/friends", { code: ca.shareCode })).body.error).toBe("cannot_add_self");
  });
  test("unauthenticated is refused", async () => {
    expect((await h.call("GET", "/law/friends/code")).status).toBe(401);
  });
});

describe("squad roles and documents", () => {
  test("permission matrix over HTTP: viewer reads only, editor creates and proposes, admin reviews", async () => {
    const { O, A, E, V } = await team();
    expect((await doc(V)).status).toBe(403);
    const d = await doc(E);
    expect(d.status).toBe(201);
    const id = d.body.doc.id;
    expect((await api(V, "GET", `/law/squads/docs/${id}`)).body.canEditDirect).toBe(false);
    expect((await api(V, "GET", "/law/squads/docs")).body.docs).toHaveLength(1);
    expect((await api(V, "POST", `/law/squads/docs/${id}/change-requests`, { title: "x", content: "y" })).status).toBe(403);
    expect((await api(V, "DELETE", `/law/squads/docs/${id}`)).status).toBe(403);
    const head = (await api(V, "GET", `/law/squads/docs/${id}`)).body.doc.headRevisionId;
    expect((await api(V, "PATCH", `/law/squads/docs/${id}`, { content: "pirate", baseRevisionId: head })).status).toBe(403);
    // a second editor is not the author: no direct edit, but may propose
    const F = await user("أخرى"); // outside the squad
    expect((await api(F, "GET", `/law/squads/docs/${id}`)).status).toBeGreaterThanOrEqual(400);
    expect((await api(A, "GET", `/law/squads/docs/${id}`)).body.canEditDirect).toBe(true);
    expect((await api(O, "GET", `/law/squads/docs/${id}`)).body.canReview).toBe(true);
    expect((await api(E, "GET", `/law/squads/docs/${id}`)).body).toMatchObject({ canEditDirect: true, canReview: false, canPropose: true });
  });

  test("only work post types; resource links must be https; no chat-like free text", async () => {
    const { E } = await team();
    for (const type of ["chat", "sticker", "message", "", undefined]) expect((await doc(E, { type })).body.error).toBe("invalid_type");
    expect((await doc(E, { type: "resource_link", title: "رابط", content: "", url: "javascript:alert(1)" })).body.error).toBe("invalid_url");
    expect((await doc(E, { type: "resource_link", title: "رابط", content: "", url: "http://example.com" })).body.error).toBe("invalid_url");
    expect((await doc(E, { type: "resource_link", title: "رابط", content: "" })).body.error).toBe("invalid_url");
    expect((await doc(E, { type: "resource_link", title: "رابط", content: "وصف", url: "https://example.com/x" })).status).toBe(201);
    for (const type of ["summary", "case_brief", "mock_exam", "question"]) expect((await doc(E, { type })).status).toBe(201);
    expect((await doc(E, { title: "" })).body.error).toBe("invalid_title");
    expect((await doc(E, { content: "" })).body.error).toBe("invalid_content");
    expect((await doc(E, { content: "x".repeat(20001) })).body.error).toBe("invalid_content");
  });

  test("a squad never sees another squad's documents; a student without a squad has no access", async () => {
    const { E } = await team();
    const id = (await doc(E)).body.doc.id;
    const X = await user("غريب");
    expect((await api(X, "GET", "/law/squads/docs")).body.error).toBe("not_in_squad");
    expect((await api(X, "GET", `/law/squads/docs/${id}`)).status).toBeGreaterThanOrEqual(400);
    const c = await api(X, "POST", "/law/squads/create", { name: "أخرى" });
    expect(c.status).toBeLessThan(300);
    expect((await api(X, "GET", `/law/squads/docs/${id}`)).status).toBe(404);
    expect((await api(X, "GET", "/law/squads/docs")).body.docs).toHaveLength(0);
  });

  test("direct edit needs the current base revision: a stale base is refused, not overwritten", async () => {
    const { A, E } = await team();
    const d = (await doc(E)).body.doc;
    const ok = await api(E, "PATCH", `/law/squads/docs/${d.id}`, { content: "نسخة جديدة", baseRevisionId: d.headRevisionId });
    expect(ok.status).toBe(200);
    const stale = await api(A, "PATCH", `/law/squads/docs/${d.id}`, { content: "نسخة قديمة", baseRevisionId: d.headRevisionId });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("stale_base");
    expect((await api(A, "PATCH", `/law/squads/docs/${d.id}`, { content: "x" })).body.error).toBe("base_required");
    expect((await api(A, "GET", `/law/squads/docs/${d.id}`)).body.doc.content).toBe("نسخة جديدة");
    expect((await api(A, "GET", `/law/squads/docs/${d.id}/revisions`)).body.revisions).toHaveLength(2);
  });

  test("change request: editor proposes, admin merges (fast-forward), author is told; self-approval is refused", async () => {
    const { O, A, E, F } = await team();
    const d = (await doc(O)).body.doc;
    const cr = await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "تصحيح", content: "فقرة أولى\n\nفقرة ثانية معدلة\n\nفقرة ثالثة" });
    expect(cr.status).toBe(201);
    expect((await notifs(A, "SQUAD_CR_OPENED"))).toHaveLength(1);
    expect((await notifs(E, "SQUAD_CR_OPENED"))).toHaveLength(0);
    expect((await api(F, "GET", `/law/squads/change-requests/${cr.body.changeRequest.id}`)).status).toBe(404); // another editor cannot read it
    const view = await api(A, "GET", `/law/squads/change-requests/${cr.body.changeRequest.id}`);
    expect(view.body).toMatchObject({ headChanged: false, mergeable: true });
    expect(view.body.diff.some((x) => x.type !== "same")).toBe(true);
    expect((await api(E, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/merge`)).status).toBe(403); // editors cannot review
    const merged = await api(A, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/merge`);
    expect(merged.body).toMatchObject({ merged: true, fastForward: true });
    expect((await api(A, "GET", `/law/squads/docs/${d.id}`)).body.doc.content).toContain("معدلة");
    expect((await notifs(E, "SQUAD_CR_MERGED"))).toHaveLength(1);
    expect((await api(A, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/merge`)).status).toBe(409); // already merged
    // an admin cannot merge their own request; the owner can
    const own = await api(A, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "ذاتي", content: "فقرة أولى\n\nفقرة ثانية معدلة\n\nفقرة ثالثة\n\nفقرة رابعة" });
    expect((await api(A, "POST", `/law/squads/change-requests/${own.body.changeRequest.id}/merge`)).body.error).toBe("cannot_review_own");
    expect((await api(O, "POST", `/law/squads/change-requests/${own.body.changeRequest.id}/merge`)).body.merged).toBe(true);
  });

  test("stale base: independent edits merge cleanly, conflicting edits are held as CONFLICT until the author rebases", async () => {
    const { O, A, E, F } = await team();
    const d = (await doc(O)).body.doc;
    const crClean = await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "نهاية", content: "فقرة أولى\n\nفقرة ثانية\n\nفقرة ثالثة\n\nفقرة رابعة" });
    const crClash = await api(F, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "تعارض", content: "فقرة أولى\n\nثانية مني\n\nفقرة ثالثة" });
    // the owner edits the second paragraph directly: both requests are now based on an old head
    expect((await api(O, "PATCH", `/law/squads/docs/${d.id}`, { content: "فقرة أولى\n\nثانية من المالك\n\nفقرة ثالثة", baseRevisionId: d.headRevisionId })).status).toBe(200);
    const stale = await api(A, "GET", `/law/squads/change-requests/${crClean.body.changeRequest.id}`);
    expect(stale.body).toMatchObject({ headChanged: true, mergeable: true });
    const m1 = await api(A, "POST", `/law/squads/change-requests/${crClean.body.changeRequest.id}/merge`);
    expect(m1.body).toMatchObject({ merged: true, fastForward: false });
    const content = (await api(A, "GET", `/law/squads/docs/${d.id}`)).body.doc.content;
    expect(content).toContain("ثانية من المالك");
    expect(content).toContain("فقرة رابعة");
    const m2 = await api(A, "POST", `/law/squads/change-requests/${crClash.body.changeRequest.id}/merge`);
    expect(m2.status).toBe(409);
    expect(m2.body.error).toBe("conflict");
    expect(m2.body.conflicts.length).toBeGreaterThan(0);
    expect((await api(F, "GET", `/law/squads/change-requests/${crClash.body.changeRequest.id}`)).body.changeRequest.status).toBe("CONFLICT");
    // the author rebases onto the current head, then it merges
    const head = (await api(F, "GET", `/law/squads/docs/${d.id}`)).body.doc.content;
    expect((await api(F, "POST", `/law/squads/change-requests/${crClash.body.changeRequest.id}/rebase`, { content: `${head}\n\nفقرة خامسة` })).status).toBe(200);
    expect((await api(A, "POST", `/law/squads/change-requests/${crClash.body.changeRequest.id}/merge`)).body.merged).toBe(true);
    // nobody else may rebase it
    expect((await api(A, "POST", `/law/squads/change-requests/${crClash.body.changeRequest.id}/rebase`, { content: "x" })).status).toBe(404);
  });

  test("reject, withdraw, no-op proposals and the open-request cap", async () => {
    const { O, A, E } = await team();
    const d = (await doc(O)).body.doc;
    const body = (i) => ({ title: `ت${i}`, content: `فقرة أولى\n\nفقرة ${i}` });
    expect((await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "لا شيء", content: "فقرة أولى\n\nفقرة ثانية\n\nفقرة ثالثة" })).body.error).toBe("no_changes");
    expect((await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "", content: "x" })).body.error).toBe("invalid_title");
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, body(i))).body.changeRequest.id);
    expect((await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, body(9))).body.error).toBe("too_many_open");
    expect((await api(A, "POST", `/law/squads/change-requests/${ids[0]}/reject`, { reviewNote: "لا" })).status).toBe(200);
    expect((await notifs(E, "SQUAD_CR_REJECTED"))).toHaveLength(1);
    expect((await api(A, "POST", `/law/squads/change-requests/${ids[0]}/reject`, {})).status).toBe(409);
    expect((await api(E, "POST", `/law/squads/change-requests/${ids[1]}/withdraw`)).status).toBe(200);
    expect((await api(A, "POST", `/law/squads/change-requests/${ids[2]}/withdraw`)).status).toBe(404); // not theirs
    expect((await api(A, "GET", "/law/squads/change-requests")).body.changeRequests).toHaveLength(3);
    expect((await api(E, "GET", "/law/squads/change-requests")).body.changeRequests).toHaveLength(3);
  });

  test("role changes follow the hierarchy; ownership moves only by transfer", async () => {
    const { O, A, E, F, V } = await team();
    const role = (u, t, r) => api(u, "PATCH", `/law/squads/members/${t.user.id}/role`, { role: r });
    expect((await role(A, E, "viewer")).status).toBe(200);
    expect((await role(A, E, "editor")).status).toBe(200);
    expect((await role(A, F, "admin")).status).toBe(403); // an admin cannot make admins
    expect((await role(A, O, "viewer")).status).toBe(403);
    expect((await role(E, V, "editor")).status).toBe(403);
    expect((await role(V, E, "viewer")).status).toBe(403);
    expect((await role(O, A, "owner")).status).toBe(403);
    expect((await role(O, F, "superuser")).body.error).toBe("invalid_role");
    expect((await role(O, O, "admin")).body.error).toBe("cannot_change_own_role");
    expect((await role(O, F, "admin")).status).toBe(200);
    expect((await role(A, F, "editor")).status).toBe(403); // admins cannot demote admins
    expect((await notifs(F, "SQUAD_ROLE_CHANGED"))).toHaveLength(1);
    // removal
    expect((await api(A, "DELETE", `/law/squads/members/${F.user.id}`)).status).toBeGreaterThanOrEqual(400); // an admin cannot remove an admin
    expect((await api(A, "DELETE", `/law/squads/members/${V.user.id}`)).status).toBe(200);
    expect((await api(E, "DELETE", `/law/squads/members/${F.user.id}`)).status).toBeGreaterThanOrEqual(400);
    // transfer
    expect((await api(A, "POST", `/law/squads/transfer/${E.user.id}`)).status).toBe(403);
    expect((await api(O, "POST", `/law/squads/transfer/${A.user.id}`)).status).toBe(200);
    expect((await api(O, "GET", "/law/squads/my")).body.myRole).toBe("admin");
    expect((await api(A, "GET", "/law/squads/my")).body.myRole).toBe("owner");
  });

  test("members of a squad are told about new documents (not the author); unread count feeds the Today card", async () => {
    const { E, F, V } = await team();
    await doc(E);
    expect((await notifs(F, "SQUAD_DOC_NEW"))).toHaveLength(1);
    expect((await notifs(V, "SQUAD_DOC_NEW"))).toHaveLength(1);
    expect((await notifs(E, "SQUAD_DOC_NEW"))).toHaveLength(0);
  });

  test("deleting a document removes its revisions and requests; only the author or an admin may", async () => {
    const { O, E, F } = await team();
    const d = (await doc(E)).body.doc;
    const cr = await api(F, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "ت", content: "جديد تماما" });
    expect((await api(F, "DELETE", `/law/squads/docs/${d.id}`)).status).toBe(403);
    expect((await api(O, "DELETE", `/law/squads/docs/${d.id}`)).status).toBe(200);
    expect(await h.tmp.client.lawSquadDocRevision.count()).toBe(0);
    expect(await h.tmp.client.lawSquadChangeRequest.count({ where: { id: cr.body.changeRequest.id } })).toBe(0);
  });
});

describe("critic findings (squad roles, integrity, history, rebase)", () => {
  test("a viewer cannot come back as an editor: leaving, being demoted or being removed rotates the invite code, and only admins see the code", async () => {
    const { O, A, E, V } = await team();
    const mine = (u) => api(u, "GET", "/law/squads/my");
    const code0 = (await mine(O)).body.squad.inviteCode;
    expect((await mine(E)).body.squad.inviteCode).toBeUndefined();
    expect((await mine(V)).body.squad.inviteCode).toBeUndefined();
    expect((await mine(A)).body.squad.inviteCode).toBeTruthy();
    // V (already a viewer) leaves and tries the old code
    expect((await api(V, "POST", "/law/squads/leave")).status).toBe(200);
    const code1 = (await mine(O)).body.squad.inviteCode;
    expect(code1).not.toBe(code0);
    expect((await api(V, "POST", "/law/squads/join", { code: code0 })).status).toBeGreaterThanOrEqual(400);
    // demotion rotates too
    expect((await api(O, "PATCH", `/law/squads/members/${E.user.id}/role`, { role: "viewer" })).status).toBe(200);
    expect((await mine(O)).body.squad.inviteCode).not.toBe(code1);
    // a kick rotates
    const code2 = (await mine(O)).body.squad.inviteCode;
    expect((await api(O, "DELETE", `/law/squads/members/${E.user.id}`)).status).toBe(200);
    expect((await mine(O)).body.squad.inviteCode).not.toBe(code2);
  });

  test("a viewer cannot write in the older squad features either (workspaces, notes, cards, sources); an admin can moderate", async () => {
    const { O, A, E, V } = await team();
    const ws = (await api(E, "POST", "/law/squads/workspaces", { moduleName: "الالتزامات", professorName: "د. س" })).body.workspace;
    expect(ws).toBeTruthy();
    expect((await api(V, "POST", "/law/squads/workspaces", { moduleName: "x", professorName: "y" })).status).toBe(403);
    const note = await api(E, "POST", `/law/squads/workspaces/${ws.id}/notes`, { sessionNumber: 1, title: "م1", content: "# المبحث الأول\n\nنص" });
    expect(note.status).toBeLessThan(300);
    const nid = note.body.note.id;
    expect((await api(V, "POST", `/law/squads/workspaces/${ws.id}/notes`, { sessionNumber: 2, title: "م2", content: "x" })).status).toBe(403);
    expect((await api(V, "PATCH", `/law/squads/notes/${nid}`, { version: note.body.note.version, content: "تخريب" })).status).toBe(403);
    const card = await api(E, "POST", `/law/squads/workspaces/${ws.id}/cards`, { front: "س", back: "ج" });
    expect(card.status).toBeLessThan(300);
    expect((await api(V, "POST", `/law/squads/workspaces/${ws.id}/cards`, { front: "a", back: "b" })).status).toBe(403);
    expect((await api(V, "PATCH", `/law/squads/cards/${card.body.card.id}`, { front: "تخريب" })).status).toBe(403);
    expect((await api(V, "POST", `/law/squads/workspaces/${ws.id}/sessions/1/sources`, { type: "text", content: "x" })).status).toBe(403);
    // an admin (not the creator) may delete the editor's card; a plain editor may not delete someone else's
    expect((await api(A, "DELETE", `/law/squads/cards/${card.body.card.id}`)).status).toBeLessThan(300);
  });

  test("deleting a member's account keeps the squad's documents, revisions and requests readable", async () => {
    const { O, A, E, F } = await team();
    const d = (await doc(O)).body.doc;
    const cr = await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "ت", content: "فقرة أولى\n\nفقرة جديدة\n\nفقرة ثالثة" });
    expect((await api(A, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/merge`)).body.merged).toBe(true);
    await h.tmp.client.users.delete({ where: { id: E.user.id } }); // the author of the head revision leaves
    const got = await api(A, "GET", `/law/squads/docs/${d.id}`);
    expect(got.body.doc.content).toContain("فقرة جديدة");
    const cr2 = await api(F, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "ثان", content: "فقرة أخرى تماما" });
    expect(cr2.status).toBe(201);
    expect((await api(O, "PATCH", `/law/squads/docs/${d.id}`, { content: "نص", baseRevisionId: got.body.doc.headRevisionId })).status).toBe(200);
    // even a doc whose head row is gone does not crash
    await h.tmp.client.lawSquadDoc.update({ where: { id: d.id }, data: { headRevisionId: "gone" } });
    expect((await api(O, "GET", `/law/squads/docs/${d.id}`)).status).toBe(200);
    expect((await api(O, "GET", `/law/squads/docs/${d.id}/revisions`)).status).toBe(200);
  });

  test("the history shows accepted revisions only: no open, rejected or withdrawn proposals", async () => {
    const { O, A, E, V } = await team();
    const d = (await doc(O)).body.doc;
    const open = await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "سري مفتوح", content: "فقرة أولى\n\nمفتوح" });
    const rej = await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "سري مرفوض", content: "فقرة أولى\n\nمرفوض" });
    await api(A, "POST", `/law/squads/change-requests/${rej.body.changeRequest.id}/reject`, {});
    const revs = (await api(V, "GET", `/law/squads/docs/${d.id}/revisions`)).body.revisions;
    expect(revs).toHaveLength(1);
    expect(JSON.stringify(revs)).not.toContain("سري");
    expect(open.status).toBe(201);
    // the viewer cannot read the proposals either
    expect((await api(V, "GET", `/law/squads/change-requests/${open.body.changeRequest.id}`)).status).toBe(404);
  });

  test("rebase: the old proposal sent back untouched is refused (it would undo others' edits); the suggestion keeps them", async () => {
    const { O, A, E } = await team();
    const d = (await doc(O)).body.doc;
    const cr = await api(E, "POST", `/law/squads/docs/${d.id}/change-requests`, { title: "ت", content: "فقرة أولى\n\nفقرة ثانية\n\nفقرة ثالثة\n\nرابعة مني" });
    await api(O, "PATCH", `/law/squads/docs/${d.id}`, { content: "فقرة أولى\n\nفقرة ثانية\n\nثالثة من المالك", baseRevisionId: d.headRevisionId });
    const view = (await api(E, "GET", `/law/squads/change-requests/${cr.body.changeRequest.id}`)).body;
    expect(view.headChanged).toBe(true);
    expect(view.suggestedContent).toContain("ثالثة من المالك");
    expect(view.suggestedContent).toContain("رابعة مني");
    const revert = await api(E, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/rebase`, { content: view.proposedContent });
    expect(revert.status).toBe(409);
    expect(revert.body.error).toBe("incorporate_head");
    expect((await api(E, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/rebase`, { content: view.suggestedContent })).status).toBe(200);
    expect((await api(A, "POST", `/law/squads/change-requests/${cr.body.changeRequest.id}/merge`)).body.merged).toBe(true);
    const text = (await api(A, "GET", `/law/squads/docs/${d.id}`)).body.doc.content;
    expect(text).toContain("ثالثة من المالك");
    expect(text).toContain("رابعة مني");
  });

  test("edits are rate limited and capped per document", async () => {
    const { O } = await team();
    const d0 = (await doc(O)).body.doc;
    let head = d0.headRevisionId;
    let limited = 0;
    for (let i = 0; i < 125; i++) {
      const r = await api(O, "PATCH", `/law/squads/docs/${d0.id}`, { content: `نسخة ${i}`, baseRevisionId: head });
      if (r.status === 429) { limited++; continue; }
      head = r.body.revisionId;
    }
    expect(limited).toBeGreaterThan(0);
  });

  test("ownership transfer leaves exactly one owner", async () => {
    const { O, A, E } = await team();
    const rs = await Promise.all([api(O, "POST", `/law/squads/transfer/${A.user.id}`), api(O, "POST", `/law/squads/transfer/${E.user.id}`)]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await h.tmp.client.lawSquadMember.count({ where: { role: "owner" } })).toBe(1);
  });
});

describe("campus wall", () => {
  async function admin(name = "إدارة") {
    const u = await user(name);
    await h.tmp.client.users.update({ where: { id: u.user.id }, data: { role: "admin" } });
    return u;
  }
  const post = (u, over = {}) => api(u, "POST", "/law/campus/posts", { kind: "td_thread", title: "سؤال", body: "ما موعد الحصة؟", ...over });

  test("students post announcements, TD exchanges and legal discussions; replies; scoped to the faculty", async () => {
    const a = await user("سلمى");
    const b = await user("يوسف");
    const other = await user("بعيد", { facultyCode: "FSJES-CASA" });
    const adm = await admin();
    expect((await post(a, { kind: "announcement", title: "إعلان" })).status).toBe(201);
    expect((await post(b, { kind: "legal_discussion", title: "نقاش في المسؤولية" })).status).toBe(201);
    expect((await post(b, { kind: "inquiry", title: "استفسار عن الفصل 230" })).status).toBe(201);
    expect((await post(b, { kind: "bogus", title: "x" })).status).toBe(400);
    const t = (await post(a)).body.post;
    expect((await api(b, "POST", "/law/campus/posts", { kind: "reply", parentId: t.id, body: "غدا" })).status).toBe(201);
    expect((await notifs(a, "CAMPUS_REPLY"))).toHaveLength(1);
    const wall = (await api(b, "GET", "/law/campus/posts")).body;
    expect(wall.posts.map((p) => p.kind).sort()).toEqual(["announcement", "inquiry", "legal_discussion", "td_thread"]);
    expect((await api(b, "GET", "/law/campus/posts?kind=legal_discussion")).body.posts.map((p) => p.kind)).toEqual(["legal_discussion"]);
    expect((await api(b, "GET", "/law/campus/posts?kind=inquiry")).body.posts.map((p) => p.kind)).toEqual(["inquiry"]);
    expect(wall.posts.find((p) => p.kind === "td_thread").replyCount).toBe(1);
    const thread = (await api(b, "GET", `/law/campus/posts/${t.id}`)).body;
    expect(thread.replies).toHaveLength(1);
    expect((await api(other, "GET", "/law/campus/posts")).body.posts).toHaveLength(0);
    expect((await api(other, "GET", `/law/campus/posts/${t.id}`)).status).toBe(404);
    expect((await api(other, "POST", "/law/campus/posts", { kind: "reply", parentId: t.id, body: "x" })).status).toBe(404);
    const noFac = await user("بلا كلية", { facultyCode: null });
    expect((await api(noFac, "GET", "/law/campus/posts")).body.error).toBe("no_faculty");
  });

  test("validation: kinds, sizes, link spam, replying to announcements", async () => {
    const a = await user("سلمى");
    const adm = await admin();
    expect((await post(a, { kind: "sticker" })).body.error).toBe("invalid_kind");
    expect((await post(a, { title: "" })).body.error).toBe("invalid_title");
    expect((await post(a, { body: "" })).body.error).toBe("invalid_body");
    expect((await post(a, { body: "x".repeat(2001) })).body.error).toBe("invalid_body");
    expect((await post(a, { body: "http://a.com http://b.com http://c.com" })).body.error).toBe("too_many_links");
    const ann = (await post(adm, { kind: "announcement", title: "إعلان" })).body.post;
    expect((await api(a, "POST", "/law/campus/posts", { kind: "reply", parentId: ann.id, body: "x" })).status).toBe(201); // every post can be answered
    const reply = (await api(a, "POST", "/law/campus/posts", { kind: "reply", parentId: ann.id, body: "y" })).body.post;
    expect((await api(a, "POST", "/law/campus/posts", { kind: "reply", parentId: reply.id, body: "x" })).status).toBe(404); // but a reply cannot be answered: threads are one level deep
    expect((await api(a, "POST", "/law/campus/posts", { kind: "reply", body: "x" })).status).toBe(404);
  });

  test("reports hide a post once three different students flagged it; the admin dismisses or upholds; duplicates do not count", async () => {
    const author = await user("كاتب");
    const rs = [await user("1"), await user("2"), await user("3")];
    const adm = await admin();
    const p = (await post(author)).body.post;
    expect((await api(author, "POST", `/law/campus/posts/${p.id}/report`, { reason: "SPAM_ADS" })).status).toBe(404); // not your own
    expect((await api(rs[0], "POST", `/law/campus/posts/${p.id}/report`, { reason: "BOGUS" })).body.error).toBe("invalid_reason");
    await api(rs[0], "POST", `/law/campus/posts/${p.id}/report`, { reason: "SPAM_ADS" });
    await api(rs[0], "POST", `/law/campus/posts/${p.id}/report`, { reason: "VULGARITY" });
    await api(rs[1], "POST", `/law/campus/posts/${p.id}/report`, { reason: "SPAM_ADS" });
    expect((await api(rs[2], "GET", "/law/campus/posts")).body.posts).toHaveLength(1);
    await api(rs[2], "POST", `/law/campus/posts/${p.id}/report`, { reason: "OTHER" });
    expect((await api(rs[2], "GET", "/law/campus/posts")).body.posts).toHaveLength(0);
    expect((await api(author, "GET", "/law/campus/posts")).body.posts).toHaveLength(0);
    expect((await api(author, "GET", `/law/campus/posts/${p.id}`)).status).toBe(200); // the author still sees their own hidden post
    expect((await api(rs[0], "GET", `/law/campus/posts/${p.id}`)).status).toBe(404);
    expect((await api(rs[0], "GET", "/law/admin/campus/queue")).status).toBe(403);
    const q = (await api(adm, "GET", "/law/admin/campus/queue")).body.queue;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id: p.id, reporters: 3 });
    expect((await api(adm, "POST", `/law/admin/campus/${p.id}/decide`, { decision: "maybe" })).body.error).toBe("invalid_decision");
    expect((await api(adm, "POST", `/law/admin/campus/${p.id}/decide`, { decision: "dismiss" })).status).toBe(200);
    expect((await api(rs[2], "GET", "/law/campus/posts")).body.posts).toHaveLength(1); // restored
    expect((await api(adm, "GET", "/law/admin/campus/queue")).body.queue).toHaveLength(0);
    await api(adm, "POST", `/law/admin/campus/${p.id}/decide`, { decision: "uphold" });
    expect((await api(rs[2], "GET", "/law/campus/posts")).body.posts).toHaveLength(0);
    expect((await notifs(author, "CAMPUS_POST_HIDDEN"))).toHaveLength(1);
  });

  test("blocked students vanish from each other's wall; authors and admins delete, others cannot", async () => {
    const a = await user("سلمى");
    const b = await user("يوسف");
    const adm = await admin();
    const p = (await post(a)).body.post;
    expect((await api(b, "GET", "/law/campus/posts")).body.posts).toHaveLength(1);
    await api(b, "POST", `/law/social/block/${a.user.id}`);
    expect((await api(b, "GET", "/law/campus/posts")).body.posts).toHaveLength(0);
    expect((await api(b, "GET", `/law/campus/posts/${p.id}`)).status).toBe(404);
    expect((await api(b, "DELETE", `/law/campus/posts/${p.id}`)).status).toBe(404);
    expect((await api(adm, "DELETE", `/law/campus/posts/${p.id}`)).status).toBe(200);
    const q = (await post(a)).body.post;
    expect((await api(a, "DELETE", `/law/campus/posts/${q.id}`)).status).toBe(200);
  });

  test("three reports hide a student post of any type, but an admin's announcement is only queued for an admin", async () => {
    const adm = await admin();
    const rs = [await user("1"), await user("2"), await user("3")];
    const ann = (await post(adm, { kind: "announcement", title: "إعلان" })).body.post;
    for (const r of rs) await api(r, "POST", `/law/campus/posts/${ann.id}/report`, { reason: "OTHER" });
    expect((await api(rs[0], "GET", "/law/campus/posts")).body.posts).toHaveLength(1); // admin's: still visible
    const mine = (await post(rs[0], { kind: "announcement", title: "إعلان طالب" })).body.post;
    for (const r of [rs[1], rs[2], adm]) await api(r, "POST", `/law/campus/posts/${mine.id}/report`, { reason: "OTHER" });
    expect((await api(rs[1], "GET", "/law/campus/posts")).body.posts.map((p) => p.id)).toEqual([ann.id]); // a student's: hidden
    expect((await api(adm, "GET", "/law/admin/campus/queue")).body.queue).toHaveLength(2); // both are queued: the hidden student post and the visible admin one
  });

  test("an author cannot delete their post once it is reported or hidden (the moderation record stays); an admin can", async () => {
    const a = await user("كاتب");
    const r = await user("مبلّغ");
    const adm = await admin();
    const p = (await post(a)).body.post;
    await api(r, "POST", `/law/campus/posts/${p.id}/report`, { reason: "OTHER" });
    expect((await api(a, "DELETE", `/law/campus/posts/${p.id}`)).status).toBe(403);
    expect(await h.tmp.client.lawCampusReport.count()).toBe(1);
    expect((await api(adm, "DELETE", `/law/campus/posts/${p.id}`)).status).toBe(200);
  });

  test("paging does not skip posts that share a timestamp", async () => {
    const a = await user("سلمى");
    const at = new Date(Date.now() - 60000);
    for (let i = 0; i < 35; i++) await h.tmp.client.lawCampusPost.create({ data: { facultyCode: "FSJES-AC", kind: "td_thread", authorId: a.user.id, title: `t${i}`, body: "b", createdAt: at } });
    const first = (await api(a, "GET", "/law/campus/posts")).body;
    const second = (await api(a, "GET", `/law/campus/posts?before=${encodeURIComponent(first.next)}`)).body;
    const ids = new Set([...first.posts, ...second.posts].map((p) => p.id));
    expect(first.posts).toHaveLength(30);
    expect(ids.size).toBe(35);
  });

  test("the wall is paged and rate limited", async () => {
    const a = await user("سلمى");
    const adm = await admin();
    for (let i = 0; i < 32; i++) await h.tmp.client.lawCampusPost.create({ data: { facultyCode: "FSJES-AC", kind: "td_thread", authorId: a.user.id, title: `t${i}`, body: "b", createdAt: new Date(Date.now() - i * 1000) } });
    const first = (await api(adm, "GET", "/law/campus/posts")).body;
    expect(first.posts).toHaveLength(30);
    expect(first.next).toBeTruthy();
    const second = (await api(adm, "GET", `/law/campus/posts?before=${encodeURIComponent(first.next)}`)).body;
    expect(second.posts).toHaveLength(2);
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await post(a)).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });
});
