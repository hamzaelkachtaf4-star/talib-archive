import { useState } from "react";
import Law from "@/models/law";
import { Button, Field, Input, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const FIELDS = [
  ["dailyGoalMinutes", tr("هدف الاسترجاع اليومي (دقائق)"), 1, 600, 1],
  ["weeklyTargetMinutes", tr("الهدف الأسبوعي (دقائق)"), 0, 5000, 10],
  ["newCardsPerDay", tr("البطاقات الجديدة يوميا"), 0, 200, 1],
  ["examLockdownDays", tr("وضع الامتحان قبل (أيام)"), 0, 60, 1],
  ["desiredRetention", tr("نسبة التذكر المستهدفة"), 0.7, 0.99, 0.01],
];

export default function GoalSettings({ settings, onSaved }) {
  const [form, setForm] = useState(settings);
  const [msg, setMsg] = useState(null);

  async function save() {
    const body = Object.fromEntries(
      FIELDS.map(([k, , , , step]) => [
        k,
        step < 1 ? Number(form[k]) : parseInt(form[k], 10),
      ])
    );
    const res = await Law.updateSettings(body);
    if (res.ok) {
      setMsg({ tone: "ok", text: tr("تم الحفظ.") });
      onSaved?.(res.data.settings);
    } else
      setMsg({
        tone: "warn",
        text: res.offline
          ? tr("يلزم الاتصال.")
          : res.data?.error || tr("قيمة غير صالحة."),
      });
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {FIELDS.map(([key, label, min, max, step]) => (
        <Field key={key} label={label}>
          <Input
            type="number"
            dir="ltr"
            min={min}
            max={max}
            step={step}
            value={form[key] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </Field>
      ))}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button onClick={save} className="self-start">
        {tr("حفظ")}
      </Button>
    </div>
  );
}
