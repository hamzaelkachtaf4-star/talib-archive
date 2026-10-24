// Dev/e2e only: `node -r ./deploy/e2e/fake-llm.cjs server/index.js` swaps the AI providers for a local stand-in so the exam drills,
// the mentor and the structuring flow can be walked in a browser without API keys. It answers from the request's schema and always
// cites the first source block ("S1"), so the app's own grounding checks still run. Never loaded in production.
const path = require("path");
const router = require(path.resolve(__dirname, "../../server/utils/law/ai/router"));

const units = (text, label) => {
  const m = text.match(new RegExp(`${label}[^:\\n]*:\\s*([^\\n]+)`));
  return m ? m[1].split(/[،,]\s*/).map((s) => s.trim()).filter(Boolean) : [];
};
const reply = (req) => {
  const props = req.schema?.properties || {};
  const text = req.parts?.map((p) => p.text || "").join("\n") || "";
  if (props.proposals) return { proposals: [{ op: "add", title: "الأركان", body: "تقوم المسؤولية التقصيرية على الخطأ والضرر والعلاقة السببية.", refs: ["S1"] }, { op: "add", title: "الخطأ", body: "الإخلال بواجب قانوني.", refs: ["S1"] }] };
  if (props.answer) return { answer: "حسب المصدر S1، أركان المسؤولية ثلاثة: الخطأ والضرر والعلاقة السببية.", refs: ["S1"] };
  if (props.sections) return { sections: (units(text, "القيم المطلوبة في الحقل section").length ? units(text, "القيم المطلوبة في الحقل section") : ["facts", "issue", "rule", "solution"]).map((s) => ({ section: s, verdict: "good", comment: "تحليل سليم.", cite: "S1" })), strengths: ["ترتيب واضح"], improvements: ["اربط الحل بالقاعدة"] };
  if (props.parts) return { parts: (units(text, "القيم المطلوبة في الحقل part").length ? units(text, "القيم المطلوبة في الحقل part") : ["intro", "problem", "part1", "part2"]).map((s) => ({ part: s, verdict: "partial", comment: "تحتاج توازنا أكبر.", cite: "S1" })), strengths: ["إشكالية واضحة"], improvements: ["وازن بين المطلبين"] };
  if (props.facts) return { facts: "تعاقد أحمد مع بائع على شراء سيارة ودفع الثمن، ثم امتنع البائع عن التسليم في الأجل المتفق عليه رغم الإنذار.", keyPoints: ["facts", "issue", "rule", "solution"].map((section) => ({ section, point: `نقطة ${section} مستخرجة من المصدر`, cite: "S1" })) };
  if (props.topic) return { topic: "الأركان العامة للمسؤولية التقصيرية", keyAxes: [{ axis: "الخطأ", cite: "S1" }, { axis: "الضرر والسببية", cite: "S1" }] };
  if (props.items?.items?.properties?.options) return { items: [0, 1, 2].map((i) => ({ question: ["ما أركان المسؤولية التقصيرية؟", "ما المقصود بالخطأ؟", "ما العلاقة السببية؟"][i], options: ["الخطأ والضرر والعلاقة السببية", "العقد فقط", "الضرر فقط", "لا شيء مما ذكر"], correctIndex: 0, explanation: "حسب المصدر S1.", cite: "S1" })) };
  if (props.items?.items?.properties?.referenceAnswer) return { items: [{ question: "عرّف الخطأ في المسؤولية التقصيرية.", kind: "definition", referenceAnswer: "الإخلال بواجب قانوني.", cite: "S1" }, { question: "ميّز بين الخطأ والضرر.", kind: "distinction", referenceAnswer: "الخطأ إخلال بواجب والضرر أذى يلحق الغير.", cite: "S1" }] };
  if (props.items) return { items: (units(text, "الأرقام المطلوبة في الحقل index").map(Number).filter(Number.isFinite).length ? units(text, "الأرقام المطلوبة في الحقل index").map(Number) : [0, 1]).map((index) => ({ index, verdict: "good", comment: "إجابة صحيحة.", cite: "S1" })) };
  return {};
};
const client = () => ({ generate: async (req) => { const json = reply(req); return { text: JSON.stringify(json), json, model: "fake", usage: { tokensIn: 10, tokensOut: 10 } }; } });
router.setClientFactory({ gemini: client, deepseek: client });
console.log("[e2e] fake LLM providers installed");
