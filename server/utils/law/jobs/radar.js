// scrape_source and weekly_recap jobs (spec §6.5, §8.5).
const { scanAll } = require("../radar/scraper");
const { LawRecap } = require("../../../models/lawRecap");
const { sendToAll } = require("../push");
const { lawConfig } = require("../config");
const { generate } = require("../ai/router");
const { loadPrompt } = require("../prompts");

async function scrapeSource() {
  const report = await scanAll();
  return { report };
}

async function aiSummary(content, jobId, ctx) {
  const prompt = loadPrompt("weekly_recap", 1);
  const facts = {
    minutes: content.minutes,
    goalDays: content.goalDays,
    reviews: content.reviews,
    cardsLearned: content.cardsLearned,
    casesSolved: content.casesSolved,
    weakest: content.weakest.map(
      (w) => `${w.subject} (${Math.round(w.lapseRate * 100)}%)`
    ),
    inboxPending: content.inboxPending,
  };
  const out = await generate({
    purpose: "weekly_recap",
    prompt,
    system: prompt.text,
    parts: [{ text: JSON.stringify(facts) }],
    schema: {
      type: "OBJECT",
      properties: { summary: { type: "STRING" } },
      required: ["summary"],
    },
    temperature: 0.4,
    maxOutputTokens: 512,
    jobId,
  });
  ctx.track(out);
  return out.json.summary;
}

async function weeklyRecap(job, ctx) {
  const cfg = lawConfig();
  const useAi = cfg.ai.geminiEnabled || cfg.ai.deepseekEnabled;
  // The job carries the week it was scheduled for; noon UTC maps to that same local date in Morocco.
  const at = job.payload?.weekStart ? new Date(`${job.payload.weekStart}T12:00:00Z`) : new Date();
  const recap = await LawRecap.generate(at, {
    aiSummary: useAi ? (c) => aiSummary(c, job.id, ctx) : null,
  });
  const c = JSON.parse(recap.content);
  const push = await sendToAll({
    title: "ملخص الأسبوع",
    body: `${c.minutes} دقيقة استرجاع، ${c.cardsLearned} بطاقة جديدة، ${c.inboxPending} عنصر في صندوق الوارد`,
    url: "/law/recap",
    tag: "recap",
  });
  return { recapId: recap.id, push };
}

module.exports = { scrapeSource, weeklyRecap };
