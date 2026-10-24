// RC3 Phase 3: module content tree, lecture sources (text + media state machine), recap.
jest.mock("../../utils/prisma", () => new Proxy({}, { get: (_t, k) => globalThis.__lawTestPrisma?.[k] }));
const fs = require("fs");
const os = require("os");
const path = require("path");
const { localDate } = require("../../utils/law/time");
const { startHarness } = require("../../utils/law/testing/harness");

jest.setTimeout(60000);
let h;
beforeEach(async () => { h = await startHarness(); });
afterEach(async () => { await h.stop(); });

const SCOPE = { facultyCode: "FSJES-AC", track: "PRIVE", studyLang: "AR", semester: "S3" };
async function student(name, email) {
  const u = await h.signUp(name, email);
  await h.tmp.client.lawUserProfile.update({ where: { userId: u.user.id }, data: SCOPE });
  return u;
}
async function firstModule(u) {
  return (await h.call("GET", "/law/modules?semester=S3", { token: u.token })).body.modules[0].id;
}
const node = (u, mid, body) => h.call("POST", `/law/modules/${mid}/nodes`, { token: u.token, body });
const tree = async (u, mid) => (await h.call("GET", `/law/modules/${mid}/tree`, { token: u.token })).body.nodes;

describe("content tree", () => {
  test("builds a nested tree with levels and sibling order", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const lec = await node(a, mid, { title: "المحاضرة الأولى" });
    expect(lec.status).toBe(201);
    expect(lec.body.node).toMatchObject({ level: 0, kind: "lecture", order: 0, parentId: null });
    const s1 = await node(a, mid, { parentId: lec.body.node.id, title: "الفصل الأول" });
    const s2 = await node(a, mid, { parentId: lec.body.node.id, title: "الفصل الثاني", body: "نص" });
    expect(s1.body.node).toMatchObject({ level: 1, kind: "section", order: 0 });
    expect(s2.body.node).toMatchObject({ level: 1, order: 1, body: "نص" });
    const second = await node(a, mid, { title: "المحاضرة الثانية" });
    expect(second.body.node.order).toBe(1);
    expect((await tree(a, mid)).map((n) => n.title)).toEqual(["المحاضرة الأولى", "المحاضرة الثانية", "الفصل الأول", "الفصل الثاني"]);
  });

  test("edit, reorder and delete a subtree", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const root = (await node(a, mid, { title: "جذر" })).body.node;
    const child = (await node(a, mid, { parentId: root.id, title: "فرع" })).body.node;
    await node(a, mid, { parentId: child.id, title: "ورقة" });
    const edit = await h.call("PATCH", `/law/modules/${mid}/nodes/${child.id}`, { token: a.token, body: { title: "فرع معدل", body: "ملاحظات", ord: 3 } });
    expect(edit.body.node).toMatchObject({ title: "فرع معدل", body: "ملاحظات", order: 3 });
    const del = await h.call("DELETE", `/law/modules/${mid}/nodes/${root.id}`, { token: a.token });
    expect(del.body.deleted).toBe(3);
    expect(await tree(a, mid)).toEqual([]);
  });

  test("validation: titles, bodies, kinds, parents, depth", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    for (const body of [{}, { title: "  " }, { title: "x".repeat(201) }, { title: "ok", body: "x".repeat(20001) }, { title: "ok", kind: "weird" }, { title: "ok", parentId: "nope" }, { title: "ok", sourceRefs: ["a"] }, { title: "ok", sourceRefs: [999999] }])
      expect((await node(a, mid, body)).status).toBe(400);
    let parent = null;
    for (let i = 0; i < 6; i++) {
      const r = await node(a, mid, { title: `مستوى ${i}`, ...(parent ? { parentId: parent } : {}) });
      expect(r.status).toBe(201);
      parent = r.body.node.id;
    }
    expect((await node(a, mid, { title: "أعمق", parentId: parent })).body.error.code).toBe("too_deep");
  });

  test("is private: another student gets 404 and cannot edit or delete", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const mid = await firstModule(a);
    const n = (await node(a, mid, { title: "سري" })).body.node;
    expect((await h.call("GET", `/law/modules/${mid}/tree`, { token: b.token })).status).toBe(404);
    expect((await node(b, mid, { title: "اختراق" })).status).toBe(404);
    expect((await h.call("PATCH", `/law/modules/${mid}/nodes/${n.id}`, { token: b.token, body: { title: "x1" } })).status).toBe(404);
    expect((await h.call("DELETE", `/law/modules/${mid}/nodes/${n.id}`, { token: b.token })).status).toBe(404);
    // nor through the student's own module id
    const bmid = await firstModule(b);
    expect((await h.call("PATCH", `/law/modules/${bmid}/nodes/${n.id}`, { token: b.token, body: { title: "x1" } })).status).toBe(404);
    expect((await tree(a, mid))[0].title).toBe("سري");
  });
});

describe("text sources", () => {
  test("a pasted text is ready at once, can be attached to a lecture, and referenced by a node", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const lec = (await node(a, mid, { title: "محاضرة" })).body.node;
    const src = await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "text", text: "  نص المحاضرة  ", lectureId: lec.id } });
    expect(src.status).toBe(201);
    expect(src.body.source).toMatchObject({ kind: "text", status: "ready", lectureId: lec.id, chars: "نص المحاضرة".length });
    const ref = await node(a, mid, { title: "نقطة", parentId: lec.id, sourceRefs: [src.body.source.id] });
    expect(ref.body.node.sourceRefs).toEqual([src.body.source.id]);
    expect((await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources).toHaveLength(1);
  });

  test("rejects empty or oversize text, unknown kinds and foreign lectures", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const mid = await firstModule(a);
    const bmid = await firstModule(b);
    const foreign = (await node(b, bmid, { title: "محاضرة ب" })).body.node;
    for (const body of [{ kind: "text", text: "  " }, { kind: "text", text: "x".repeat(60001) }, { kind: "video", text: "x" }, { kind: "text", text: "ok", lectureId: foreign.id }, { kind: "text", text: "ok", lectureId: "nope" }, {}])
      expect((await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body })).status).toBe(400);
    expect((await h.call("POST", `/law/modules/${bmid}/sources`, { token: a.token, body: { kind: "text", text: "x" } })).status).toBe(404);
  });

  test("delete removes only my own source", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const mid = await firstModule(a);
    const s = (await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "text", text: "x" } })).body.source;
    expect((await h.call("DELETE", `/law/modules/${mid}/sources/${s.id}`, { token: b.token })).status).toBe(404);
    expect((await h.call("DELETE", `/law/modules/${mid}/sources/${s.id}`, { token: a.token })).status).toBe(200);
    expect((await h.call("DELETE", `/law/modules/${mid}/sources/${s.id}`, { token: a.token })).status).toBe(404);
  });
});

describe("media sources (state machine over capture batches)", () => {
  const mkBatch = (u, kind, extra = {}) => h.tmp.client.lawCaptureBatch.create({ data: { userId: u.user.id, clientBatchId: `cb-${Math.random().toString(16).slice(2)}-xxxx`, kind, status: "complete", ...extra } });
  const add = (u, mid, body) => h.call("POST", `/law/modules/${mid}/sources`, { token: u.token, body });

  test("audio needs the recording-permission acknowledgement", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const batch = await mkBatch(a, "audio_recording");
    expect((await add(a, mid, { kind: "audio", batchId: batch.id })).body.error.code).toBe("recording_permission_required");
    const ok = await add(a, mid, { kind: "audio", batchId: batch.id, recordingPermission: true });
    expect(ok.status).toBe(201);
    expect(ok.body.source.status).toBe("processing");
  });

  test("processing -> ready once the transcript exists; text is not exposed in the list", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const batch = await mkBatch(a, "photo_batch");
    const src = (await add(a, mid, { kind: "image", batchId: batch.id })).body.source;
    expect((await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources[0].status).toBe("processing");
    await h.tmp.client.lawDerivative.create({ data: { userId: a.user.id, batchId: batch.id, kind: "ocr_text", content: JSON.stringify({ pages: [{ index: 0, text: "الصفحة الأولى" }, { index: 1, text: "الصفحة الثانية" }] }) } });
    const list = (await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources;
    expect(list[0]).toMatchObject({ id: src.id, status: "ready", chars: "الصفحة الأولى\n\nالصفحة الثانية".length });
    expect(JSON.stringify(list)).not.toContain("الصفحة الأولى");
    const row = await h.tmp.client.lawLectureSource.findUnique({ where: { id: src.id } });
    expect(row.extracted).toBe("الصفحة الأولى\n\nالصفحة الثانية");
  });

  test("a failed job marks the source failed", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const batch = await mkBatch(a, "pdf");
    await add(a, mid, { kind: "pdf", batchId: batch.id });
    await h.tmp.client.lawJob.create({ data: { userId: a.user.id, type: "extract_pdf", status: "failed", payload: JSON.stringify({ batchId: batch.id }) } });
    const s = (await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources[0];
    expect(s).toMatchObject({ status: "failed", error: "processing_failed" });
  });

  test("raw audio is deleted after transcription unless the student keeps it", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lawos-audio-"));
    const { assetAbsPath } = require("../../utils/law/assets");
    const mkAsset = async (batch, name) => {
      const rel = `zz-test/${name}.m4a`;
      const abs = assetAbsPath(rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "audio");
      return h.tmp.client.lawAsset.create({ data: { userId: a.user.id, sha256: name, kind: "audio", mime: "audio/mp4", bytes: 5, storagePath: rel, batchId: batch.id, clientCaptureId: name } });
    };
    const gone = await mkBatch(a, "audio_recording");
    const kept = await mkBatch(a, "audio_recording");
    const assetGone = await mkAsset(gone, "gone-1");
    const assetKept = await mkAsset(kept, "kept-1");
    await add(a, mid, { kind: "audio", batchId: gone.id, recordingPermission: true });
    await add(a, mid, { kind: "audio", batchId: kept.id, recordingPermission: true, keepRaw: true });
    for (const b of [gone, kept]) await h.tmp.client.lawDerivative.create({ data: { userId: a.user.id, batchId: b.id, kind: "transcript", content: JSON.stringify({ segments: [{ text: "نص" }] }) } });
    const list = (await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources;
    expect(list.every((s) => s.status === "ready")).toBe(true);
    expect(await h.tmp.client.lawAsset.count({ where: { id: assetGone.id } })).toBe(0);
    expect(fs.existsSync(assetAbsPath(assetGone.storagePath))).toBe(false);
    expect(await h.tmp.client.lawAsset.count({ where: { id: assetKept.id } })).toBe(1);
    expect(fs.existsSync(assetAbsPath(assetKept.storagePath))).toBe(true);
    fs.rmSync(path.dirname(assetAbsPath("zz-test/x")), { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("a capture queued on the device: pending until its batch reaches the server, then processing and ready", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const cid = "device-batch-0001";
    const created = await add(a, mid, { kind: "image", clientBatchId: cid });
    expect(created.status).toBe(201);
    expect(created.body.source.status).toBe("pending");
    expect((await add(a, mid, { kind: "image", clientBatchId: cid })).status).toBe(409);
    expect((await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources[0].status).toBe("pending");
    const batch = await mkBatch(a, "photo_batch", { clientBatchId: cid });
    expect((await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources[0].status).toBe("processing");
    await h.tmp.client.lawDerivative.create({ data: { userId: a.user.id, batchId: batch.id, kind: "ocr_text", content: JSON.stringify({ pages: [{ text: "نص" }] }) } });
    expect((await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources[0].status).toBe("ready");
    expect((await add(a, mid, { kind: "image", clientBatchId: "short" })).body.error.code).toBe("invalid_batch");
  });

  test("another student's device batch id is not claimable by name once it exists", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const mid = await firstModule(a);
    await mkBatch(b, "photo_batch", { clientBatchId: "shared-client-id-1" });
    const r = await add(a, mid, { kind: "image", clientBatchId: "shared-client-id-1" });
    expect(r.body.source.status).toBe("pending"); // a's own batch with that id does not exist; b's is invisible to a
  });

  test("a batch must be mine, of the right kind, and used once", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    const mid = await firstModule(a);
    const mine = await mkBatch(a, "photo_batch");
    const theirs = await mkBatch(b, "photo_batch");
    const audio = await mkBatch(a, "audio_recording");
    expect((await add(a, mid, { kind: "image", batchId: theirs.id })).body.error.code).toBe("invalid_batch");
    expect((await add(a, mid, { kind: "image", batchId: audio.id })).body.error.code).toBe("invalid_batch");
    expect((await add(a, mid, { kind: "image", batchId: "nope" })).body.error.code).toBe("invalid_batch");
    expect((await add(a, mid, { kind: "image" })).body.error.code).toBe("invalid_batch");
    expect((await add(a, mid, { kind: "image", batchId: mine.id })).status).toBe(201);
    expect((await add(a, mid, { kind: "image", batchId: mine.id })).status).toBe(409);
  });
});

describe("limits, races and the AI label", () => {
  test("saving an unchanged node keeps its AI label; changing the text removes it", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const n = (await node(a, mid, { title: "عنوان", body: "نص" })).body.node;
    await h.tmp.client.lawModuleNode.update({ where: { id: n.id }, data: { aiDraft: true } });
    const same = await h.call("PATCH", `/law/modules/${mid}/nodes/${n.id}`, { token: a.token, body: { title: "عنوان", body: "نص", kind: n.kind } });
    expect(same.body.node.aiDraft).toBe(true);
    const moved = await h.call("PATCH", `/law/modules/${mid}/nodes/${n.id}`, { token: a.token, body: { ord: 4 } });
    expect(moved.body.node.aiDraft).toBe(true);
    const edited = await h.call("PATCH", `/law/modules/${mid}/nodes/${n.id}`, { token: a.token, body: { body: "نص مختلف" } });
    expect(edited.body.node.aiDraft).toBe(false);
  });

  test("a student's own module stays openable after they change faculty, track or language", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    await h.tmp.client.lawUserProfile.update({ where: { userId: a.user.id }, data: { facultyCode: "OTHER-FAC", track: "PUBLIC", studyLang: "FR" } });
    expect((await h.call("GET", `/law/path/modules/${mid}/graph`, { token: a.token })).status).toBe(200);
    expect((await h.call("GET", `/law/modules/${mid}/tree`, { token: a.token })).status).toBe(200);
  });

  test("source additions are rate limited per day", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const key = `module_source:${a.user.id}:${localDate(new Date())}`;
    await h.tmp.client.lawRateCounter.create({ data: { key, count: 100 } });
    const r = await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "text", text: "x" } });
    expect(r.status).toBe(429);
  });

  test("a module's total text is capped", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    await h.tmp.client.lawLectureSource.create({ data: { userId: a.user.id, moduleId: mid, kind: "text", status: "ready", extracted: "ن".repeat(1_450_000) } });
    const r = await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "text", text: "ن".repeat(60_000) } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("module_text_full");
    expect((await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "text", text: "ن".repeat(1000) } })).status).toBe(201);
  });

  test("two requests claiming the same device batch: exactly one wins", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const body = { kind: "image", clientBatchId: "device-batch-race" };
    const rs = await Promise.all([1, 2, 3].map(() => h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await h.tmp.client.lawLectureSource.count({ where: { userId: a.user.id } })).toBe(1);
  });

  test("a pending source whose batch turns out to be of the wrong kind fails instead of processing", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "image", clientBatchId: "device-batch-kind" } });
    await h.tmp.client.lawCaptureBatch.create({ data: { userId: a.user.id, clientBatchId: "device-batch-kind", kind: "audio_recording", status: "complete" } });
    const s = (await h.call("GET", `/law/modules/${mid}/sources`, { token: a.token })).body.sources[0];
    expect(s).toMatchObject({ status: "failed", error: "invalid_batch" });
  });
});

describe("module recap", () => {
  test("counts lectures, ready sources, generated notes and path progress", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const lec = (await node(a, mid, { title: "محاضرة" })).body.node;
    await node(a, mid, { title: "نقطة", parentId: lec.id });
    await h.call("POST", `/law/modules/${mid}/sources`, { token: a.token, body: { kind: "text", text: "x" } });
    await h.tmp.client.lawModuleNode.update({ where: { id: lec.id }, data: { aiDraft: true } });
    const g = (await h.call("GET", `/law/path/modules/${mid}/graph`, { token: a.token })).body;
    await h.call("POST", `/law/path/nodes/${g.nodes[0].id}/progress`, { token: a.token, body: { state: "COMPLETED" } });
    const r = (await h.call("GET", `/law/modules/${mid}/recap`, { token: a.token })).body.recap;
    expect(r).toMatchObject({ lectures: 1, sourcesReady: 1, notesGenerated: 1, nodesCompleted: 1, nodesTotal: g.nodes.length, gapRadarScore: null });
  });

  test("gap radar score is the share of closed gaps in the linked course notes", async () => {
    const a = await student("سلمى", "a@example.ma");
    const mid = await firstModule(a);
    const title = (await h.call("GET", "/law/modules?semester=S3", { token: a.token })).body.modules[0].title;
    const subject = await h.tmp.client.lawSubject.create({ data: { userId: a.user.id, name: title } });
    const course = await h.tmp.client.lawStudentCourse.create({ data: { userId: a.user.id, subjectId: subject.id, title: "ملاحظاتي", source: "manual" } });
    const gap = (status, i) => h.tmp.client.lawKnowledgeGap.create({ data: { userId: a.user.id, courseId: course.id, kind: "OTHER", canonicalId: `DOC:${i}`, coverage: 0, severity: 1, quote: "q", explanationAr: "e", status } });
    await gap("OPEN", 1); await gap("COVERED", 2); await gap("DISMISSED", 3); await gap("OPEN", 4);
    expect((await h.call("GET", `/law/modules/${mid}/recap`, { token: a.token })).body.recap.gapRadarScore).toBe(50);
  });

  test("another student's module is 404", async () => {
    const a = await student("سلمى", "a@example.ma");
    const b = await student("يوسف", "b@example.ma");
    expect((await h.call("GET", `/law/modules/${await firstModule(a)}/recap`, { token: b.token })).status).toBe(404);
  });
});
