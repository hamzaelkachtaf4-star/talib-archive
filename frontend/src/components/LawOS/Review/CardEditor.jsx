import { useState } from "react";
import {
  Button,
  Field,
  Select,
  Textarea,
  Input,
  Notice,
  ORIGIN_LABELS,
  TYPE_LABELS,
} from "../ui";
import { toWesternDigits } from "../lib/digits";
import { tr } from "@/components/LawOS/lib/i18n";

const ID = /^[A-Z][A-Z0-9.-]*:[0-9A-Za-z-]+$/;

/** Create or edit a card. `card` null → create. */
export default function CardEditor({
  card,
  subjects,
  defaultSubjectId,
  onSave,
  onCancel,
  onDelete,
}) {
  const [form, setForm] = useState({
    subjectId: card?.subjectId || defaultSubjectId || subjects[0]?.id || "",
    origin: card?.origin || "definition",
    type: card?.type || "basic",
    front: card?.front || "",
    back: card?.back || "",
    canonicalIds: (card?.canonicalIds || []).join(" "),
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const ids = toWesternDigits(form.canonicalIds)
      .split(/[\s,،]+/)
      .filter(Boolean)
      .map((x) => x.toUpperCase());
    const bad = ids.find((x) => !ID.test(x));
    if (bad)
      return setError(tr("صيغة المرجع غير صحيحة: {0} (مثال: DOC:77)", [bad]));
    if (form.type === "cloze" && !/\[\[.+?\]\]/.test(form.front))
      return setError(tr("بطاقة ملء الفراغ تحتاج نصا بين [[ ]] في الوجه."));
    setSaving(true);
    const err = await onSave({ ...form, canonicalIds: ids });
    setSaving(false);
    if (err) setError(err);
  }

  if (!subjects.length)
    return <Notice tone="warn">{tr("أضف مادة أولا من تبويب المواد.")}</Notice>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("المادة")}>
          <Select
            value={form.subjectId}
            onChange={set("subjectId")}
            options={subjects.map((s) => [s.id, s.name])}
          />
        </Field>
        <Field label={tr("مصدر البطاقة")}>
          <Select
            value={form.origin}
            onChange={set("origin")}
            options={Object.entries(ORIGIN_LABELS)}
          />
        </Field>
      </div>
      <Field label={tr("النوع")}>
        <Select
          value={form.type}
          onChange={set("type")}
          options={Object.entries(TYPE_LABELS)}
        />
      </Field>
      <Field
        label={form.type === "qualification" ? tr("الوقائع") : tr("الوجه")}
        hint={
          form.type === "cloze" ? tr("ضع النص المخفي بين [[ و ]]") : undefined
        }
      >
        <Textarea value={form.front} onChange={set("front")} required />
      </Field>
      <Field
        label={
          form.type === "qualification" ? tr("التكييف والعناصر") : tr("الظهر")
        }
      >
        <Textarea value={form.back} onChange={set("back")} required />
      </Field>
      <Field
        label={tr("المراجع القانونية")}
        hint={tr("مثال: DOC:77 CP:392. يُتحقق منها في المرحلة الثالثة.")}
      >
        <Input
          dir="ltr"
          value={form.canonicalIds}
          onChange={set("canonicalIds")}
          placeholder="DOC:77"
        />
      </Field>
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {tr("حفظ")}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {tr("إلغاء")}
        </Button>
        {onDelete && (
          <Button variant="danger" className="ms-auto" onClick={onDelete}>
            {tr("حذف")}
          </Button>
        )}
      </div>
    </form>
  );
}
