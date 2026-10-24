// Qanouni Collab Phase C: the pure parts of the multi-source synthesis helper.
const { buildDraft, sourceParts, planText, MAX_SOURCE_CHARS } = require("../../../utils/law/synthesis");
const { LawSessionSource } = require("../../../models/lawSessionSource");

const SOURCES = [
  { kind: "transcript", label: "أ", content: "نص أ" },
  { kind: "board_ocr", label: "ب", content: "نص ب" },
];
const resolveOnly = (known) => async (ids) => Object.fromEntries(ids.map((id) => [id, { exists: known.includes(id) }]));

describe("buildDraft", () => {
  test("levels clamped to 2–4, headings cleaned, pins de-duplicated, unknown sources ignored", async () => {
    const d = await buildDraft(
      {
        title: "  ",
        sections: [
          { heading: "### المبحث الأول", level: 1, body: "أ", sourceIds: ["S1", "s1", "S2"] },
          { heading: "الفقرة", level: 9, body: "ب [DOC:77] و[DOC:5]", sourceIds: ["S3"], articleRefs: ["DOC:77"] },
          { heading: "", level: 2, body: "", sourceIds: [] },
        ],
      },
      SOURCES,
      resolveOnly(["DOC:77"])
    );
    expect(d.title).toBe("مسودة المحاضرة");
    expect(d.content).toBe("## المبحث الأول\nأ [^pin-1] [^pin-2]\n\n#### الفقرة\nب [^pin-3] و");
    expect(d.sourcePins.map((p) => [p.id, p.type])).toEqual([
      ["pin-1", "document"],
      ["pin-2", "document"],
      ["pin-3", "ref"],
    ]);
    expect(d.strippedRefs).toEqual(["DOC:5"]);
    expect(d.sourcesUsed).toBe(2);
  });

  test("garbage model output gives an empty but valid draft", async () => {
    const d = await buildDraft({ sections: "nope" }, SOURCES, resolveOnly([]));
    expect(d).toMatchObject({ content: "", sourcePins: [], strippedRefs: [], gaps: [] });
  });
});

describe("prompt parts and inputs", () => {
  test("sources are fenced S1…Sn and trimmed; the lecturer's plan is passed as indented text", () => {
    const big = [{ kind: "text", label: "ضخم", content: "x".repeat(MAX_SOURCE_CHARS + 500) }, ...SOURCES];
    const parts = sourceParts(big, { moduleName: "م", professorName: "أ", sessionNumber: 2, plan: "- المبحث الأول\n" });
    expect(parts[0].text).toContain("تصميم الأستاذ (اتبعه):\n- المبحث الأول");
    expect(parts[1].text.length).toBeLessThan(MAX_SOURCE_CHARS + 100);
    expect(parts[2].text).toMatch(/^<<<S2 \| تفريغ صوتي \| أ>>>/);
    expect(planText([{ title: "القسم الأول", children: [{ title: "المبحث الأول", children: [] }] }])).toBe("- القسم الأول\n  - المبحث الأول\n");
  });

  test("derivative content is flattened from text, JSON pages or segments", () => {
    const t = LawSessionSource.derivativeText;
    expect(t("نص عادي")).toBe("نص عادي");
    expect(t(JSON.stringify({ text: "أ" }))).toBe("أ");
    expect(t(JSON.stringify({ pages: [{ text: "أ" }, { text: "ب" }] }))).toBe("أ\nب");
    expect(t(JSON.stringify([{ text: "أ" }, { text: "" }, { text: "ج" }]))).toBe("أ\nج");
  });
});
