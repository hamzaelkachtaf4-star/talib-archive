const { merge3, blockDiff, splitBlocks, normalizeDoc } = require("../../../utils/law/hubMerge");

const doc = (...b) => b.join("\n\n");
const BASE = doc("# عنوان", "فقرة أولى", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة");

describe("merge3 (block level)", () => {
  test("fast path: only theirs changed", () => {
    const theirs = doc("# عنوان", "فقرة أولى", "فقرة ثانية معدلة", "فقرة ثالثة", "فقرة رابعة");
    const r = merge3(BASE, BASE, theirs);
    expect(r).toMatchObject({ clean: true, merged: theirs });
  });

  test("independent edits in different places merge cleanly", () => {
    const ours = doc("# عنوان", "فقرة أولى بتعديل المالك", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة");
    const theirs = doc("# عنوان", "فقرة أولى", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة", "فقرة خامسة مضافة");
    const r = merge3(BASE, ours, theirs);
    expect(r.clean).toBe(true);
    expect(splitBlocks(r.merged)).toEqual(["# عنوان", "فقرة أولى بتعديل المالك", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة", "فقرة خامسة مضافة"]);
  });

  test("both sides edit the same block differently: conflict, head side kept in the preview", () => {
    const ours = doc("# عنوان", "فقرة أولى", "نسخة المالك", "فقرة ثالثة", "فقرة رابعة");
    const theirs = doc("# عنوان", "فقرة أولى", "نسخة المقترح", "فقرة ثالثة", "فقرة رابعة");
    const r = merge3(BASE, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts).toEqual([{ base: ["فقرة ثانية"], ours: ["نسخة المالك"], theirs: ["نسخة المقترح"] }]);
  });

  test("identical edits on both sides apply once", () => {
    const both = doc("# عنوان", "فقرة أولى", "نفس التعديل", "فقرة ثالثة", "فقرة رابعة");
    const r = merge3(BASE, both, both);
    expect(r).toMatchObject({ clean: true, merged: both });
  });

  test("one side deletes a block the other edited: conflict", () => {
    const ours = doc("# عنوان", "فقرة أولى", "فقرة ثالثة", "فقرة رابعة");
    const theirs = doc("# عنوان", "فقرة أولى", "فقرة ثانية معدلة", "فقرة ثالثة", "فقرة رابعة");
    expect(merge3(BASE, ours, theirs).clean).toBe(false);
  });

  test("adjacent (non-overlapping) edits are independent", () => {
    const ours = doc("# عنوان", "فقرة أولى معدلة", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة");
    const theirs = doc("# عنوان", "فقرة أولى", "فقرة ثانية معدلة", "فقرة ثالثة", "فقرة رابعة");
    const r = merge3(BASE, ours, theirs);
    expect(r.clean).toBe(true);
    expect(splitBlocks(r.merged)[1]).toBe("فقرة أولى معدلة");
    expect(splitBlocks(r.merged)[2]).toBe("فقرة ثانية معدلة");
  });

  test("two insertions at the same point conflict; at different points both survive", () => {
    const o1 = doc("# عنوان", "إضافة المالك", "فقرة أولى", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة");
    const t1 = doc("# عنوان", "إضافة المقترح", "فقرة أولى", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة");
    expect(merge3(BASE, o1, t1).clean).toBe(false);
    const t2 = doc("# عنوان", "فقرة أولى", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة", "إضافة في النهاية");
    const r = merge3(BASE, o1, t2);
    expect(r.clean).toBe(true);
    expect(splitBlocks(r.merged)).toEqual(["# عنوان", "إضافة المالك", "فقرة أولى", "فقرة ثانية", "فقرة ثالثة", "فقرة رابعة", "إضافة في النهاية"]);
  });

  test("indented (code-like) blocks and inner lines survive a merge unchanged", () => {
    const base = "    code line\n    second line\n\nB";
    const r = merge3(base, "    code line\n    second line\n\nB2", "    code line\n    second line\n\nB\n\nZ");
    expect(r).toMatchObject({ clean: true, merged: "    code line\n    second line\n\nB2\n\nZ" });
  });

  test("empty and degenerate inputs", () => {
    expect(merge3("", "", "")).toMatchObject({ clean: true, merged: "" });
    expect(merge3("", "جديد", "")).toMatchObject({ clean: true, merged: "جديد" });
    expect(merge3("", "أ", "ب").clean).toBe(false);
    expect(splitBlocks("a\r\n\r\n\r\n b \n\n")).toEqual(["a", " b"]); // indentation is content; separators are not
  });

  test("normalizeDoc is idempotent", () => {
    expect(normalizeDoc(normalizeDoc("a\n\n\n\nb  \n"))).toBe(normalizeDoc("a\n\n\n\nb  \n"));
  });

  test("blockDiff marks additions and deletions", () => {
    const d = blockDiff(doc("a", "b", "c"), doc("a", "x", "c"));
    expect(d.map((x) => `${x.type}:${x.text}`)).toEqual(["same:a", "del:b", "add:x", "same:c"]);
  });
});
