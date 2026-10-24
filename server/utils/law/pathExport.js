// Course-path export (spec Phase 9.4). DOCX: right-to-left paragraphs (w:bidi), the Amiri font embedded (SIL OFL,
// utils/law/assets/fonts), cover page, contents list, one chapter per path section, appendix of cited articles
// (text from the local corpus, never from a model). PDF is not generated here: no PDF library shapes Arabic
// correctly, so the app prints a dedicated page in the browser (or a headless-Chromium route when deployed with one).
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, CharacterSet } = require("docx");
const { BRAND } = require("./brand");

const FONT = "Amiri";
const KIND_AR = { LESSON: "درس", PRACTICE: "مراجعة", METHOD: "منهجية", CHECKPOINT: "محطة", BOSS: "اختبار نهائي" };
const STATE_AR = { COMPLETED: "منجز", IN_PROGRESS: "قيد الإنجاز", AVAILABLE: "متاح", LOCKED: "مقفل" };

// XML 1.0 cannot carry control characters: a hostile title must not corrupt the file
const xmlSafe = (t) => String(t ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
const run = (text, o = {}) => new TextRun({ text: xmlSafe(text), font: FONT, rightToLeft: true, ...o });
const para = (text, o = {}) => new Paragraph({ bidirectional: true, alignment: AlignmentType.START, spacing: { after: 120, line: 360 }, children: [run(text, o.run)], ...o.para });
const heading = (text, level) => new Paragraph({ bidirectional: true, heading: level, spacing: { before: 240, after: 120 }, children: [run(text, { bold: true })] });

/** @returns {Promise<Buffer>} */
async function buildPathDocx({ student, module, nodes, appendix, date }) {
  const sections = [...new Set(nodes.map((n) => n.section))];
  const children = [
    para("", { para: { spacing: { before: 2400 } } }),
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [run(BRAND.name.ar, { size: 56, bold: true })] }),
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [run(BRAND.tagline.ar, { size: 26 })] }),
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(module.title, { size: 44, bold: true })] }),
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [run(`${module.semester}${module.parcours ? ` · ${module.parcours}` : ""}`, { size: 28 })] }),
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [run(student, { size: 30 })] }),
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [run(date, { size: 24 })] }),
    new Paragraph({ children: [new PageBreak()] }),
    heading("الفهرس", HeadingLevel.HEADING_1),
    ...sections.map((s, i) => para(`${i + 1}. ${s}`)),
    ...(appendix.length ? [para(`${sections.length + 1}. ملحق: النصوص القانونية المستشهد بها`)] : []),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  sections.forEach((s, i) => {
    children.push(heading(`${i + 1}. ${s}`, HeadingLevel.HEADING_1));
    for (const n of nodes.filter((x) => x.section === s)) {
      children.push(heading(`${KIND_AR[n.kind] || n.kind}: ${n.title}`, HeadingLevel.HEADING_2));
      children.push(para(`الحالة: ${STATE_AR[n.state] || n.state}`));
      for (const r of n.legalRefs) children.push(para(`${r.exists ? "✓" : "؟"} ${r.canonicalId}`));
      for (const p of n.pins) children.push(para(`ملخص مجتمعي: ${p.title}`));
    }
  });
  if (appendix.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading(`${sections.length + 1}. ملحق: النصوص القانونية المستشهد بها`, HeadingLevel.HEADING_1));
    for (const a of appendix) {
      children.push(heading(a.canonicalId, HeadingLevel.HEADING_2));
      children.push(para(a.text));
    }
    children.push(para("النص المرجعي هو المنشور في الجريدة الرسمية.", { run: { italics: true } }));
  }
  const doc = new Document({
    creator: BRAND.name.ar,
    title: module.title,
    fonts: [{ name: FONT, data: fs.readFileSync(path.join(__dirname, "assets/fonts/Amiri-Regular.ttf")), characterSet: CharacterSet.ARABIC }],
    styles: { default: { document: { run: { font: FONT, size: 26 } } } },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildPathDocx };
