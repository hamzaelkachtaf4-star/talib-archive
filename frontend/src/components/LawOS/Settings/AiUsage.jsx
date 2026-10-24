import { useEffect, useState } from "react";
import Law from "@/models/law";
import { Button, Field, Input, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const PURPOSES = {
  ocr: tr("قراءة الصفحات"),
  transcription: tr("تفريغ التسجيلات"),
  pdf_vision: tr("PDF ممسوح"),
  segmentation: tr("تقسيم المحاضرات"),
  case_critique: tr("تصحيح الحالات العملية"),
  dissertation_critique: tr("تصحيح المواضيع"),
};

function Bar({ spent, budget }) {
  const pct = budget > 0 ? Math.min(1, spent / budget) : 1;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: "var(--law-surface-2)" }}
    >
      <div
        className="h-2"
        style={{
          width: `${pct * 100}%`,
          background: pct >= 1 ? "var(--law-warn)" : "var(--law-accent)",
        }}
      />
    </div>
  );
}

/** Monthly AI spend vs budget per provider (spec §9.8), with editable budgets (raising one resumes paused jobs). */
export default function AiUsage({ settings, onSaved }) {
  const [usage, setUsage] = useState(null);
  const [budgets, setBudgets] = useState({
    gemini: settings.aiBudgetGeminiUsd,
    deepseek: settings.aiBudgetDeepseekUsd,
  });
  const [msg, setMsg] = useState(null);

  const load = () => Law.aiUsage().then((r) => r.ok && setUsage(r.data));
  useEffect(() => {
    load();
  }, []);

  async function save() {
    const r = await Law.updateSettings({
      aiBudgetGeminiUsd: Number(budgets.gemini),
      aiBudgetDeepseekUsd: Number(budgets.deepseek),
    });
    if (r.ok) {
      setMsg({ tone: "ok", text: tr("تم الحفظ. استُؤنفت المهام المتوقفة.") });
      onSaved?.(r.data.settings);
      load();
    } else
      setMsg({ tone: "warn", text: r.data?.error || tr("قيمة غير صالحة.") });
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {usage &&
        ["gemini", "deepseek"].map((p) => {
          const spent = usage.byProvider[p]?.costUsd || 0;
          return (
            <div key={p} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <bdi dir="ltr" className="font-semibold">
                  {p === "gemini" ? "Gemini" : "DeepSeek"}
                </bdi>
                <bdi dir="ltr" className="tabular-nums">
                  ${spent.toFixed(2)} / ${usage.budgets[p]}
                </bdi>
              </div>
              <Bar spent={spent} budget={usage.budgets[p]} />
              {(usage.byProvider[p]?.purposes || []).map((x) => (
                <div
                  key={x.purpose}
                  className="law-muted flex justify-between text-xs"
                >
                  <span>{PURPOSES[x.purpose] || x.purpose}</span>
                  <bdi dir="ltr" className="tabular-nums">
                    {x.calls} × · ${x.costUsd.toFixed(3)}
                  </bdi>
                </div>
              ))}
            </div>
          );
        })}
      {usage?.pausedJobs > 0 && (
        <Notice tone="warn">
          <bdi dir="ltr">{usage.pausedJobs}</bdi>{" "}
          {tr("مهمة متوقفة بسبب الميزانية.")}
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("ميزانية Gemini الشهرية ($)")}>
          <Input
            type="number"
            dir="ltr"
            min={0}
            step={0.5}
            value={budgets.gemini}
            onChange={(e) =>
              setBudgets((b) => ({ ...b, gemini: e.target.value }))
            }
          />
        </Field>
        <Field label={tr("ميزانية DeepSeek الشهرية ($)")}>
          <Input
            type="number"
            dir="ltr"
            min={0}
            step={0.5}
            value={budgets.deepseek}
            onChange={(e) =>
              setBudgets((b) => ({ ...b, deepseek: e.target.value }))
            }
          />
        </Field>
      </div>
      <Notice>
        {tr(
          "التكلفة تقديرية حسب أسعار الإعدادات. الميزانية 0 تعني إيقاف كل مهام الذكاء الاصطناعي."
        )}
      </Notice>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button onClick={save} className="self-start">
        {tr("حفظ الميزانية")}
      </Button>
    </div>
  );
}
