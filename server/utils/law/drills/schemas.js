// Structured-output schemas for the exam center's AI calls (drill generation and critique).
const S = (type, extra = {}) => ({ type, ...extra });
const arr = (items) => ({ type: "ARRAY", items });
const obj = (properties, required) => ({ type: "OBJECT", properties, required });

const GENERATE = {
  qcm: obj({ items: arr(obj({ question: S("STRING"), options: arr(S("STRING")), correctIndex: S("INTEGER"), explanation: S("STRING"), cite: S("STRING") }, ["question", "options", "correctIndex", "explanation", "cite"])) }, ["items"]),
  case: obj({ facts: S("STRING"), keyPoints: arr(obj({ section: S("STRING"), point: S("STRING"), cite: S("STRING") }, ["section", "point", "cite"])) }, ["facts", "keyPoints"]),
  direct: obj({ items: arr(obj({ question: S("STRING"), kind: S("STRING"), referenceAnswer: S("STRING"), cite: S("STRING") }, ["question", "referenceAnswer", "cite"])) }, ["items"]),
  dissertation: obj({ topic: S("STRING"), keyAxes: arr(obj({ axis: S("STRING"), cite: S("STRING") }, ["axis", "cite"])) }, ["topic", "keyAxes"]),
};

const VERDICT = { type: "STRING", enum: ["good", "partial", "missing"] };
const SECTION = { type: "STRING", enum: ["facts", "issue", "rule", "solution"] };
const PART = { type: "STRING", enum: ["intro", "problem", "part1", "part2"] };
const CRITIQUE = {
  case: obj({ sections: arr(obj({ section: SECTION, verdict: VERDICT, comment: S("STRING"), cite: S("STRING") }, ["section", "verdict", "comment"])), strengths: arr(S("STRING")), improvements: arr(S("STRING")) }, ["sections"]),
  direct: obj({ items: arr(obj({ index: S("INTEGER"), verdict: VERDICT, comment: S("STRING"), cite: S("STRING") }, ["index", "verdict", "comment"])) }, ["items"]),
  dissertation: obj({ parts: arr(obj({ part: PART, verdict: VERDICT, comment: S("STRING"), cite: S("STRING") }, ["part", "verdict", "comment"])), strengths: arr(S("STRING")), improvements: arr(S("STRING")) }, ["parts"]),
};

module.exports = { GENERATE, CRITIQUE };
