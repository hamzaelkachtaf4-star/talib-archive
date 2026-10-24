// Shared string enums for database columns. SQLite has no native enums in Prisma 5.3, so columns are Strings and every
// request validator checks against these lists. Add values here (never rename) and extend the validators.
const freeze = (o) => Object.freeze(o);

const TODO_KINDS = freeze(["custom", "lecture", "reading", "review"]);
const TODO_PRIORITIES = freeze(["high", "medium", "normal"]);
const TODO_REF_TYPES = freeze(["module", "lecture", "deck", "session"]);

// RC3 Phase 3: module workspace
const MODULE_STRATEGIES = freeze(["full_course", "per_lecture"]);
const MODULE_VIEW_STYLES = freeze(["trail", "reader", "tree", "axes", "tables", "graph", "cards"]); // Talib v3 angles: trail, tree (cherry), tables, graph, cards + Q/A
const MODULE_COLORS = freeze(["emerald", "violet", "orange", "cyan", "blue", "rose", "amber", "slate"]); // subject colour dot
const NOTE_DOC_TYPES = freeze(["full_course", "session", "summary", "reference", "case"]); // forum tabs
const MODULE_FORMATS = freeze(["tree", "table", "full", "brief", "detailed", "cards", "qa"]); // Talib v3 learning formats
const MODULE_DEPTHS = freeze(["concise", "detailed", "verbatim"]);
const TEACHING_STYLES = freeze(["reads_polycopie", "verbal_detail", "mixed"]);
const ATTENDANCE_FOCUS = freeze(["strict", "flexible", "unknown"]);
const EXAM_TENDENCIES = freeze(["definitions", "cases", "mixed", "unknown"]);
const EXAM_FORMATS = freeze(["qcm", "case", "direct", "dissertation", "mixed"]);
const SOURCE_KINDS = freeze(["text", "audio", "image", "pdf"]);
const SOURCE_STATUSES = freeze(["pending", "processing", "ready", "failed"]);
const NODE_KINDS = freeze(["lecture", "section", "point"]);
const MODULE_SOURCES = freeze(["timetable", "seed", "custom"]);
const MENTOR_MODES = freeze(["qa", "build"]);

// RC3 Phase 4: exam center
const DRILL_TYPES = freeze(["qcm", "case", "direct", "dissertation"]);
const EXAM_SOURCES = freeze(["manual", "photo", "pdf"]);
const CASE_SECTIONS = freeze(["facts", "issue", "rule", "solution"]); // الوقائع، الإشكال القانوني، القاعدة القانونية، الحل وتطبيق القانون

const isOneOf = (list, v) => list.includes(v);

module.exports = {
  TODO_KINDS, TODO_REF_TYPES, TODO_PRIORITIES, MODULE_STRATEGIES, MODULE_VIEW_STYLES, MODULE_FORMATS, MODULE_COLORS, NOTE_DOC_TYPES, MODULE_DEPTHS, TEACHING_STYLES, ATTENDANCE_FOCUS,
  EXAM_TENDENCIES, EXAM_FORMATS, SOURCE_KINDS, SOURCE_STATUSES, NODE_KINDS, MODULE_SOURCES, MENTOR_MODES, DRILL_TYPES, EXAM_SOURCES, CASE_SECTIONS, isOneOf,
};
