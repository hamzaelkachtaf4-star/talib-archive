// Builds a CherryTree (.ctb) notebook for tests, with the quirks of a real one: node text is XML, `level` is
// always 0, roots have father_id 0, is_richtxt holds odd flag values. nodes: [{ id, name, parent = 0, seq,
// txt, level }]; `txt` may be raw XML/plain text, or use richText([...]) to build the XML.
const fs = require("fs");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** parts: strings, or { b: "bold text" } for the student's bold (weight="heavy") */
function richText(parts) {
  const body = parts
    .map((p) => (typeof p === "string" ? `<rich_text>${esc(p)}</rich_text>` : `<rich_text weight="heavy">${esc(p.b)}</rich_text>`))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<node>${body}</node>`;
}

function makeCtb(file, nodes) {
  const { DatabaseSync } = require("node:sqlite");
  fs.rmSync(file, { force: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE node (node_id INTEGER UNIQUE,name TEXT,txt TEXT,syntax TEXT,tags TEXT,is_ro INTEGER,is_richtxt INTEGER,has_codebox INTEGER,has_table INTEGER,has_image INTEGER,level INTEGER,ts_creation INTEGER,ts_lastsave INTEGER);
    CREATE TABLE children (node_id INTEGER UNIQUE,father_id INTEGER,sequence INTEGER,master_id INTEGER);
    CREATE TABLE codebox (node_id INTEGER);
    CREATE TABLE grid (node_id INTEGER);
    CREATE TABLE image (node_id INTEGER);
    CREATE TABLE bookmark (node_id INTEGER, sequence INTEGER);
  `);
  const addNode = db.prepare("INSERT INTO node VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const addEdge = db.prepare("INSERT INTO children VALUES (?,?,?,?)");
  nodes.forEach((n, i) => {
    addNode.run(n.id, n.name, n.txt ?? richText([""]), "custom-colors", "", 0, 13827495, 0, 0, 0, n.level ?? 0, 1700000000, 1700000000);
    if (n.parent !== null) addEdge.run(n.id, n.parent ?? 0, n.seq ?? i + 1, 0);
  });
  db.close();
  return file;
}

module.exports = { makeCtb, richText };
