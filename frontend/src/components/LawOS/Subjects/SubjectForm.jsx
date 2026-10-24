import { useState } from "react";
import { Button, Field, Input, Textarea, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const COLORS = [
  "#0f2a3f",
  "#7b2d26",
  "#1e5631",
  "#5b3a8c",
  "#9a6b00",
  "#1f5f8b",
  "#7a4a2a",
];

function toDateInput(v) {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

export default function SubjectForm({ subject, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: subject?.name || "",
    nameFr: subject?.nameFr || "",
    code: subject?.code || "",
    semester: subject?.semester || "S3",
    professorName: subject?.professorName || "",
    professorNotes: subject?.professorNotes || "",
    examDate: toDateInput(subject?.examDate),
    examFormat: subject?.examFormat || "",
    color: subject?.color || COLORS[0],
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    // Exam date is a local calendar day; store it at local noon so it never slips a day.
    const body = {
      ...form,
      examDate: form.examDate ? `${form.examDate}T12:00:00` : null,
    };
    const err = await onSave(body);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={tr("اسم المادة")}>
        <Input
          value={form.name}
          onChange={set("name")}
          required
          placeholder={tr("القانون المدني: الالتزامات")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("الاسم بالفرنسية")}>
          <Input
            dir="ltr"
            value={form.nameFr}
            onChange={set("nameFr")}
            placeholder="Droit des obligations"
          />
        </Field>
        <Field label={tr("الرمز")}>
          <Input dir="ltr" value={form.code} onChange={set("code")} />
        </Field>
      </div>
      <Field label={tr("الأستاذ(ة)")}>
        <Input value={form.professorName} onChange={set("professorName")} />
      </Field>
      <Field
        label={tr("ملاحظات عن الأستاذ")}
        hint={tr("المصطلحات التي يفضلها، طريقة التصحيح، تصميم المحاضرات…")}
      >
        <Textarea
          value={form.professorNotes}
          onChange={set("professorNotes")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("تاريخ الامتحان")}>
          <Input
            type="date"
            dir="ltr"
            value={form.examDate}
            onChange={set("examDate")}
          />
        </Field>
        <Field label={tr("نوع الامتحان")}>
          <Input
            value={form.examFormat}
            onChange={set("examFormat")}
            placeholder={tr("موضوع / حالة عملية")}
          />
        </Field>
      </div>
      <Field label={tr("اللون")}>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setForm((f) => ({ ...f, color: c }))}
              className="h-9 w-9 rounded-full"
              style={{
                background: c,
                outline:
                  form.color === c ? "3px solid var(--law-accent)" : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </Field>
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {tr("حفظ")}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {tr("إلغاء")}
        </Button>
      </div>
    </form>
  );
}
