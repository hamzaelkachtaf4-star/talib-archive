import { useState } from "react";
import { Button, Field, Input, Select, WEEKDAYS } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { KIND_LABELS, SCHOOL_DAYS } from "./shared";

/** Add / edit one weekly slot. */
export default function SlotForm({ initial, modules, onSave, onCancel, busy }) {
  const [s, setS] = useState(initial);
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }));
  const valid = /^\d{2}:\d{2}$/.test(s.startTime) && /^\d{2}:\d{2}$/.test(s.endTime) && s.startTime < s.endTime;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...s, weekday: Number(s.weekday) });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("اليوم")}>
          <Select
            value={s.weekday}
            onChange={set("weekday")}
            options={SCHOOL_DAYS.map((d) => [d, WEEKDAYS[d]])}
          />
        </Field>
        <Field label={tr("النوع")}>
          <Select
            value={s.kind}
            onChange={set("kind")}
            options={Object.entries(KIND_LABELS)}
          />
        </Field>
        <Field label={tr("من")}>
          <Input type="time" dir="ltr" value={s.startTime} onChange={set("startTime")} required />
        </Field>
        <Field label={tr("إلى")}>
          <Input type="time" dir="ltr" value={s.endTime} onChange={set("endTime")} required />
        </Field>
      </div>
      <Field label={tr("المادة")}>
        <Select
          value={s.moduleId || ""}
          onChange={set("moduleId")}
          options={[["", tr("— اختر المادة —")], ...modules.map((x) => [x.id, x.title])]}
        />
      </Field>
      <Field label={tr("القاعة (مدرج / قاعة)")}>
        <Input dir="auto" value={s.room || ""} onChange={set("room")} maxLength={80} placeholder="Amphi 3 / Salle 12" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("الأستاذ")}>
          <Input dir="auto" value={s.professor || ""} onChange={set("professor")} maxLength={120} />
        </Field>
        <Field label={tr("الفوج")}>
          <Input dir="auto" value={s.groupLabel || ""} onChange={set("groupLabel")} maxLength={40} placeholder="G01" />
        </Field>
      </div>
      {!valid && (
        <p className="text-xs" style={{ color: "var(--law-warn)" }}>
          {tr("يجب أن يكون وقت البداية قبل وقت النهاية.")}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!valid || busy}>
          {busy ? "…" : tr("حفظ")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tr("إلغاء")}
        </Button>
      </div>
    </form>
  );
}
