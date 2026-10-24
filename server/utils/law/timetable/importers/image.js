// Photo (or pasted text) of a timetable → candidates through the AI timetable reader. Same candidate shape as every other
// importer; the review step in the app is what makes anything permanent.
const { parseTimetable } = require("../../timetableParse");

async function parse({ image, mimeType, text, subjects = [], section = null }) {
  const r = await parseTimetable({ image, mimeType, text, subjects, section });
  if (r.error) return r;
  return {
    slots: r.slots.map((s) => ({ ...s, subjectName: s.subjectName, professor: null, groupLabel: null, activeFrom: null, activeTo: null })),
    rejected: [], warnings: [], notes: r.notes,
  };
}

module.exports = { id: "image", parse };
