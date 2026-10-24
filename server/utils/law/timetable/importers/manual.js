// Hand-entered rows (a form, a quick-add list). Same candidate pipeline as every other importer, so one rule set decides validity.
const { toCandidates } = require("./candidate");

function parse({ rows }) {
  const r = toCandidates(rows);
  return { slots: r.slots, rejected: r.rejected, warnings: r.truncated ? ["truncated"] : [], notes: null };
}

module.exports = { id: "manual", parse };
