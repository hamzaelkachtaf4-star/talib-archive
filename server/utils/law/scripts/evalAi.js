// Opt-in AI regression suite (spec Phase 10.6): `yarn --cwd server eval:ai`. Needs LAWOS_EVAL=1 and real provider keys
// (it spends credits), so it is NOT part of jest or the gate; run it before each release. Every admin-verified AI
// correction writes a case into ./cases; this replays each one through the real tutor pipeline (retrieval -> model ->
// citation check) against the configured database, without storing anything or charging any student.
const fs = require("fs");
const path = require("path");

if (process.env.LAWOS_EVAL !== "1") {
  console.log("eval:ai skipped: set LAWOS_EVAL=1 (and provider keys) to run it. It calls the real model and costs credits.");
  process.exit(0);
}

async function main() {
  const dir = process.env.LAWOS_EVAL_DIR || path.join(__dirname, "../../../__tests__/ai-evals/cases");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  if (!files.length) return console.log("eval:ai: no cases yet (they appear when an admin verifies a correction).");
  const { asSystem } = require("../tenant");
  const { retrieveEvidence, evidenceBlock } = require("../grounding");
  const { generate } = require("../ai/router");
  const { loadPrompt } = require("../prompts");
  const { checkChatOutput } = require("../chatCitations");
  const { rawDb } = require("../dbClient");
  const { normalize } = require("../arabic");
  const prompt = loadPrompt("legal_tutor", 3);
  let failed = 0;
  for (const f of files) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!c.question) { console.log(`skip ${c.id}: no question written yet`); continue; }
    const result = await asSystem(async () => {
      const evidence = await retrieveEvidence({ texts: [c.question], ids: c.mustCite, scopeSlugs: c.scope.codeSlugs });
      const out = await generate({
        purpose: "legal_chat", prompt, system: prompt.text,
        parts: [{ text: `${evidenceBlock(evidence)}\n\n# السؤال\n${c.question}` }],
        schema: { type: "OBJECT", properties: { answer: { type: "STRING" }, citations: { type: "ARRAY", items: { type: "OBJECT", properties: { canonicalId: { type: "STRING" } }, required: ["canonicalId"] } } }, required: ["answer"] },
        temperature: 0, maxOutputTokens: 2048,
      });
      const slugs = (await rawDb().lawCode.findMany({ select: { slug: true } })).map((x) => x.slug);
      return checkChatOutput(out.json, evidence, { knownSlugs: slugs });
    });
    const text = normalize(result.answer);
    const problems = [
      ...c.mustCite.filter((id) => !result.meta.verified.includes(id)).map((id) => `did not cite ${id}`),
      ...c.mustNotSay.filter((s) => text.includes(normalize(s))).map((s) => `repeated the verified mistake: «${s}»`),
    ];
    console.log(`${problems.length ? "FAIL" : "ok  "} ${c.id}${problems.length ? ` — ${problems.join("; ")}` : ""}`);
    if (problems.length) failed++;
  }
  if (failed) { console.error(`eval:ai: ${failed} of ${files.length} cases failed: block the release.`); process.exit(1); }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
