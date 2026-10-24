// Dry run of the CherryTree reader: prints the shape of a notebook (counts, depth, warnings) and never prints
// its content or touches any database.   node utils/law/scripts/ctbReport.js /path/to/notebook.ctb
const { readCtb } = require("../course/ctb");

const file = process.argv[2];
if (!file) {
  console.error("usage: ctbReport.js <notebook.ctb>");
  process.exit(2);
}
const r = readCtb(file);
const count = (n) => 1 + n.children.reduce((s, c) => s + count(c), 0);
const chars = (n) => n.text.length + n.children.reduce((s, c) => s + chars(c), 0);
const bold = (n) => n.emphasis.length + n.children.reduce((s, c) => s + bold(c), 0);
const leaves = (n) => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1);
console.log(`nodes=${r.stats.nodes} maxDepth=${r.stats.maxDepth} chars=${r.stats.chars} warnings=${r.warnings.length}`);
r.roots.forEach((n, i) =>
  console.log(`root ${i + 1}: topics=${count(n)} leaves=${leaves(n)} chars=${chars(n)} boldRuns=${bold(n)} title.length=${n.title.length}`)
);
const byCode = {};
for (const w of r.warnings) byCode[w.code] = (byCode[w.code] || 0) + 1;
console.log("warnings:", JSON.stringify(byCode));
