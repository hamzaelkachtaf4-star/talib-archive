// CherryTree (.ctb) notebook reader. A .ctb is a SQLite file: `node` (name, XML text) and `children` (the tree
// edges: father_id 0 = a root, `sequence` = order among siblings). The `level` column is unreliable (0 on every
// node of real notebooks), so depth is always computed from the edges.
//
// The file is untrusted input: it is checked for the SQLite header before being opened, opened read-only, queried
// with fixed statements, bounded in size / node count / depth / text length, and its XML is never parsed by a
// real XML parser (a tiny scanner reads <rich_text> runs only, so DTDs and external entities are inert).
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const LIMITS = {
  maxBytes: 20 * 1024 * 1024,
  maxNodes: 20000,
  maxDepth: 32,
  maxTextChars: 200000,
  maxTitleChars: 200, // a title is copied into the heading path of every descendant
};
const SQLITE_MAGIC = "SQLite format 3\0";
const EMPTY_TITLE = "(بدون عنوان)";

class CtbError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "CtbError";
    this.code = code;
  }
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeEntities(s) {
  return s.replace(/&(?:#x([0-9a-fA-F]{1,6})|#(\d{1,7})|(amp|lt|gt|quot|apos));/g, (m, hex, dec, name) => {
    if (name) return NAMED[name];
    const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
  });
}

/**
 * Node text → { text, emphasis } where emphasis = [{start,end}] spans of bold (weight="heavy") runs.
 * Linear time: one forward scan with indexOf, and an unclosed <rich_text> ends the scan instead of rescanning.
 * `plain: true` (node syntax is not rich text) keeps the text as it is, even when it starts with "<".
 */
function parseRichText(txt, { plain = false } = {}) {
  if (txt == null || txt === "") return { text: "", emphasis: [] };
  const raw = String(txt);
  if (plain || !raw.trimStart().startsWith("<")) return { text: raw.replace(/\r/g, "").trim(), emphasis: [] };
  let text = "";
  const spans = [];
  const OPEN = "<rich_text";
  const CLOSE = "</rich_text>";
  for (let i = 0; (i = raw.indexOf(OPEN, i)) !== -1; ) {
    const next = raw.charAt(i + OPEN.length);
    if (!(next === ">" || next === "/" || /\s/.test(next))) {
      i += OPEN.length; // <rich_textual ...>: not ours
      continue;
    }
    const gt = raw.indexOf(">", i + OPEN.length);
    if (gt === -1) break;
    const attrs = raw.slice(i + OPEN.length, gt);
    if (attrs.endsWith("/")) {
      i = gt + 1; // self-closing run: nothing in it
      continue;
    }
    const close = raw.indexOf(CLOSE, gt + 1);
    // No closing tag: the value was cut (long values are cut inside SQLite) or is malformed. Keep what is
    // there as the last run and stop; never rescan for the next opener.
    const end = close === -1 ? raw.length : close;
    const run = decodeEntities(raw.slice(gt + 1, end).replace(close === -1 ? /<[^>]*$/ : /$^/, "")).replace(/\r/g, "");
    i = close === -1 ? raw.length : close + CLOSE.length;
    if (!run) continue;
    if (/\bweight\s*=\s*["']heavy["']/.test(attrs)) {
      const last = spans[spans.length - 1];
      if (last && last.end === text.length) last.end += run.length;
      else spans.push({ start: text.length, end: text.length + run.length });
    }
    text += run;
  }
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const emphasis = spans
    .map((sp) => ({ start: Math.max(0, sp.start - lead), end: Math.min(trimmed.length, sp.end - lead) }))
    .filter((sp) => sp.end > sp.start);
  return { text: trimmed, emphasis };
}

// Control characters (JSON escapes each to 6 characters) become spaces, and so do whitespace runs. Invisible
// format characters (ZWNJ, RLM, soft hyphen, ...) are removed, not replaced: in Arabic they sit inside words.
const cleanTitle = (name) =>
  (typeof name === "string" ? name : "").replace(/\p{Cf}/gu, "").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim() || EMPTY_TITLE;

/**
 * @returns {{ roots: Node[], stats: {nodes:number, maxDepth:number, chars:number}, warnings: {code:string, nodeId?:number, detail?:string}[] }}
 *   Node = { nodeId, title, text, emphasis, children: Node[] } (children in notebook order)
 */
function readCtb(file, opts = {}) {
  const lim = { ...LIMITS, ...opts };
  const size = fs.statSync(file).size;
  if (size > lim.maxBytes) throw new CtbError("too_large", `notebook is ${size} bytes (max ${lim.maxBytes})`);
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(16);
  try {
    fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head.toString("latin1") !== SQLITE_MAGIC) throw new CtbError("not_sqlite", "not a SQLite file");

  const { DatabaseSync } = require("node:sqlite");
  // immutable=1: SQLite never writes beside the file (no -wal/-shm sidecars in the content-addressed store).
  const db = new DatabaseSync(`${pathToFileURL(file).href}?immutable=1`, { readOnly: true });
  let nodeRows;
  let edgeRows;
  try {
    const master = new Map(db.prepare("SELECT name, type, sql FROM sqlite_master WHERE name IN ('node', 'children')").all().map((r) => [r.name, r]));
    for (const t of ["node", "children"]) {
      const m = master.get(t);
      if (!m || m.type !== "table") throw new CtbError("bad_schema", "not a CherryTree notebook");
      // Plain tables only: a virtual table or a generated column can compute (and allocate) anything on read.
      if (!/^\s*CREATE\s+TABLE\b/i.test(m.sql || "") || /\bVIRTUAL\b|\bGENERATED\b|\bAS\s*\(/i.test(m.sql))
        throw new CtbError("bad_schema", `table ${t} is not a plain table`);
      if (db.prepare(`PRAGMA table_xinfo(${t})`).all().some((c) => c.hidden !== 0))
        throw new CtbError("bad_schema", `table ${t} has hidden or generated columns`);
    }
    const cols = new Set(db.prepare("PRAGMA table_info(node)").all().map((c) => c.name));
    for (const c of ["node_id", "name", "txt"]) if (!cols.has(c)) throw new CtbError("bad_schema", `node.${c} is missing`);
    const nodes = db.prepare("SELECT COUNT(*) AS n FROM node").get().n;
    const edges = db.prepare("SELECT COUNT(*) AS n FROM children").get().n;
    if (nodes > lim.maxNodes || edges > lim.maxNodes) throw new CtbError("too_many_nodes", `${nodes} nodes / ${edges} edges (max ${lim.maxNodes})`);
    // Cut long values inside SQLite so they are never materialised whole in this process.
    const rawLimit = lim.maxTextChars * 4 + 2000;
    const optional = ["syntax", "has_table", "has_codebox"].filter((c) => cols.has(c));
    try {
      nodeRows = db
        .prepare(`SELECT node_id, substr(name, 1, 2000) AS name, substr(txt, 1, ${rawLimit}) AS txt${optional.map((c) => `, ${c}`).join("")} FROM node`)
        .all();
      edgeRows = db.prepare("SELECT node_id, father_id, sequence FROM children").all();
    } catch (e) {
      throw new CtbError("bad_schema", `unexpected node/children columns: ${e.message}`);
    }
  } finally {
    db.close();
  }

  const warnings = [];
  const byId = new Map();
  let droppedObjects = 0;
  for (const r of nodeRows) {
    // "custom-colors" is CherryTree's rich text; anything else (plain-text, code syntaxes) is literal text.
    const plain = r.syntax != null && r.syntax !== "custom-colors";
    let { text, emphasis } = parseRichText(typeof r.txt === "string" ? r.txt : "", { plain }); // a BLOB is not text
    if (text.length > lim.maxTextChars) {
      text = text.slice(0, lim.maxTextChars);
      emphasis = emphasis.filter((sp) => sp.start < text.length).map((sp) => ({ start: sp.start, end: Math.min(sp.end, text.length) }));
      warnings.push({ code: "text_truncated", nodeId: r.node_id });
    }
    if (r.has_table || r.has_codebox) droppedObjects++;
    const title = cleanTitle(r.name);
    if (title.length > lim.maxTitleChars) warnings.push({ code: "title_truncated", nodeId: r.node_id });
    byId.set(r.node_id, { nodeId: r.node_id, title: title.slice(0, lim.maxTitleChars), text, emphasis, children: [] });
  }
  if (droppedObjects) warnings.push({ code: "dropped_objects", detail: `${droppedObjects} node(s) contain tables or code boxes, which are not imported` });

  const kids = new Map(); // father id -> [{ id, seq }]
  const placed = new Set();
  for (const e of edgeRows) {
    if (!byId.has(e.node_id) || placed.has(e.node_id)) continue; // edge without a node, or a shared (duplicate) edge
    placed.add(e.node_id);
    let father = e.father_id ?? 0;
    if (father !== 0 && !byId.has(father)) {
      warnings.push({ code: "orphan", nodeId: e.node_id, detail: `father ${father} does not exist` });
      father = 0;
    }
    if (!kids.has(father)) kids.set(father, []);
    kids.get(father).push({ id: e.node_id, seq: e.sequence ?? 0 });
  }
  for (const id of byId.keys()) {
    if (placed.has(id)) continue;
    warnings.push({ code: "orphan", nodeId: id, detail: "no children row" });
    if (!kids.has(0)) kids.set(0, []);
    kids.get(0).push({ id, seq: Number.MAX_SAFE_INTEGER });
  }

  const order = (list) => list.sort((a, b) => a.seq - b.seq || a.id - b.id);
  const seen = new Set();
  const cut = new Set(); // nodes below the depth limit: dropped on purpose, not a cycle
  let maxDepth = 0;
  let chars = 0;
  const markCut = (id) => {
    const stack = [...(kids.get(id) || []).map((k) => k.id)];
    while (stack.length) {
      const n = stack.pop();
      if (cut.has(n) || seen.has(n)) continue;
      cut.add(n);
      for (const k of kids.get(n) || []) stack.push(k.id);
    }
  };
  const build = (id, depth) => {
    seen.add(id);
    const node = byId.get(id);
    maxDepth = Math.max(maxDepth, depth);
    chars += node.text.length;
    if (depth >= lim.maxDepth) {
      if ((kids.get(id) || []).length) {
        warnings.push({ code: "too_deep", nodeId: id, detail: `deeper than ${lim.maxDepth} levels was dropped` });
        markCut(id);
      }
      return node;
    }
    for (const k of order(kids.get(id) || [])) if (!seen.has(k.id)) node.children.push(build(k.id, depth + 1));
    return node;
  };
  const roots = order(kids.get(0) || []).map((k) => build(k.id, 1));
  // Anything neither reached nor deliberately cut is only reachable through itself: a cycle (or hangs off one).
  for (const id of byId.keys()) if (!seen.has(id) && !cut.has(id)) warnings.push({ code: "unreachable", nodeId: id, detail: "part of a cycle" });

  return { roots, stats: { nodes: seen.size, maxDepth, chars }, warnings };
}

const DEFAULT_TIMEOUT_MS = 20000;
// Each read may use up to its heap cap, and the daily rate limit does nothing against parallel requests: only a
// couple of notebooks are read at once, the rest wait (FIFO) for a free slot.
const MAX_READERS = 2;
let active = 0;
const waiting = [];
const activeReaders = () => active;
function acquire() {
  if (active < MAX_READERS) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); // the slot passes straight to the next waiter
  else active--;
}

/**
 * readCtb in a worker thread: the event loop is never blocked, memory is capped, at most MAX_READERS threads
 * exist at once, and a slow or hostile notebook is killed after timeoutMs (error code "timeout"; the clock starts
 * when the read starts, not while it waits for a slot). A slot is handed on only when the thread has really
 * exited: terminate() cannot interrupt native SQLite code, so a stuck thread keeps its slot (and its memory
 * budget) until it returns.
 */
async function readCtbIsolated(file, opts = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, maxOldGenerationSizeMb = 384 } = {}) {
  await acquire();
  let worker;
  try {
    const { Worker } = require("worker_threads");
    worker = new Worker(path.join(__dirname, "ctbWorker.js"), {
      workerData: { file, opts },
      resourceLimits: { maxOldGenerationSizeMb },
    });
  } catch (e) {
    release();
    throw new CtbError("unreadable", e.message);
  }
  worker.once("exit", release); // the one place a slot is released
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new CtbError("timeout", `reading took longer than ${timeoutMs} ms`)), timeoutMs);
    worker.once("message", (m) => {
      if (m.ok) finish(resolve, m.ok);
      else finish(reject, new CtbError(m.error.code, m.error.message));
    });
    worker.once("error", (e) =>
      finish(reject, e?.code === "ERR_WORKER_OUT_OF_MEMORY" ? new CtbError("too_large", "notebook needs too much memory") : new CtbError("unreadable", e.message))
    );
    worker.once("exit", (code) => finish(reject, new CtbError("unreadable", `reader stopped (${code})`)));
  });
}

module.exports = { readCtb, readCtbIsolated, activeReaders, parseRichText, CtbError, LIMITS };
