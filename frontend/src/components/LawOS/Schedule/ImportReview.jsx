import { useRef, useState } from "react";
import Law from "@/models/law";
import { Button, Notice, Select, WEEKDAYS } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import { KIND_LABELS, byTime, toPayload } from "./shared";

const NEW = "__new__";
const norm = (t) => String(t || "").replace(/[\s\u064B-\u0652ـ]+/g, " ").trim().toLowerCase();
/** A module whose title is the same name the file gives (ignoring case, spacing and diacritics). */
const matchModule = (modules, name) => modules.find((m) => norm(m.title) === norm(name))?.id || "";
const SKIP = "";
const MAX_SESSIONS = 50; // the server refuses a timetable longer than this

/**
 * The review step shared by every import (photo, pasted text, ICS, CSV): the student corrects the candidates, picks a subject for
 * each, and only then is anything saved. Unknown subjects can be created on the way.
 */
export default function ImportReview({ candidates, notes, warnings = [], rejected = [], modules, semester, current, onSaved, onBack }) {
  const [rows, setRows] = useState(() => candidates.map((s) => ({ ...s, include: true, pick: matchModule(modules, s.subjectName) || (s.subjectName ? NEW : SKIP) })));
  const [replace, setReplace] = useState(current.length === 0 || current.every((s) => s.placeholder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const created = useRef(new Map()); // subjects already created, kept across retries so a failed save never creates them twice
  const setRow = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  async function confirm() {
    setBusy(true);
    setError(null);
    const chosen = rows.filter((r) => r.include);
    if ((replace ? 0 : current.length) + chosen.length > MAX_SESSIONS) {
      setBusy(false);
      return setError(tr("الحد الأقصى {0} حصة في الجدول. ألغِ تحديد بعض الحصص.", [MAX_SESSIONS]));
    }
    // Create each new module once, even if it appears in several slots.
    for (const r of chosen.filter((x) => x.pick === NEW)) {
      const key = r.subjectName.trim();
      if (created.current.has(key)) continue;
      const res = await Law.moduleAdd({ semester, title: key });
      if (!res.ok) {
        setBusy(false);
        return setError(tr("تعذّر إنشاء المادة: {0}", [key]));
      }
      created.current.set(key, res.data.module.id);
    }
    const imported = chosen.map((r) => ({
      weekday: r.weekday, startTime: r.startTime, endTime: r.endTime, kind: r.kind, room: r.room || "",
      professor: r.professor || "", groupLabel: r.groupLabel || "", activeFrom: r.activeFrom || null, activeTo: r.activeTo || null,
      moduleId: r.pick === NEW ? created.current.get(r.subjectName.trim()) : r.pick || "",
    }));
    const next = [...(replace ? [] : current), ...imported].sort(byTime);
    const res = await Law.saveTimetable(toPayload(next));
    setBusy(false);
    if (!res.ok) return setError(tr("تعذّر الحفظ. أعد المحاولة."));
    onSaved(res.data.slots);
  }

  const REASON = () => ({ invalid_weekday: tr("يوم غير مفهوم"), invalid_time: tr("وقت غير صحيح"), start_after_end: tr("البداية بعد النهاية"), missing_subject: tr("بلا مادة"), all_day_event: tr("حدث طوال اليوم"), invalid_end: tr("نهاية غير صالحة"), invalid_start: tr("بداية غير صالحة"), range_reversed: tr("نطاق التاريخ معكوس"), invalid_recurrence: tr("تكرار غير صالح"), invalid_event: tr("حدث غير مقروء") });
  const WARN = () => ({ unsupported_recurrence: tr("بعض الأحداث متكررة بطريقة غير مدعومة: أُخذ أول موعد فقط."), truncated: tr("الملف كبير: قُرئ جزء منه فقط."), unknown_timezone: tr("منطقة زمنية غير معروفة: قُرئت الأوقات بتوقيت الدار البيضاء."), exdate_ignored: tr("استثناءات التواريخ (EXDATE) غير مدعومة: راجع الحصص الملغاة."), override_ignored: tr("تعديلات حصة واحدة داخل سلسلة لم تُستورد."), times_follow_first_week: tr("جدول بمنطقة زمنية أخرى: طُبّق فرق التوقيت لأول أسبوع على كل الأسابيع. راجع الأوقات.") });

  return (
    <div className="flex flex-col gap-3">
      <Notice>{tr("راجع الحصص المستخرجة وصحّحها قبل الحفظ. لا يُحفظ شيء قبل تأكيدك.")}</Notice>
      {notes && <Notice tone="warn">{notes}</Notice>}
      {warnings.map((w) => <Notice key={w} tone="warn">{WARN()[w] || w}</Notice>)}
      {rejected.length > 0 && (
        <Notice tone="warn">
          {tr("تعذّرت قراءة {0} صفاً:", [rejected.length])}{" "}
          {rejected.slice(0, 5).map((r, i) => <span key={i}>{r.line ? tr("سطر {0}", [r.line]) : tr("حدث {0}", [r.event ?? (r.index ?? 0) + 1])}: {REASON()[r.reason] || r.reason}{i < Math.min(rejected.length, 5) - 1 ? "؛ " : ""}</span>)}
        </Notice>
      )}
      {rows.map((r, i) => (
        <div key={i} className="law-card flex flex-col gap-2 p-3" style={{ opacity: r.include ? 1 : 0.5 }}>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={r.include} onChange={(e) => setRow(i, { include: e.target.checked })} />
            {WEEKDAYS[r.weekday]} · <bdi dir="ltr">{r.startTime}–{r.endTime}</bdi>
            {r.room && <span className="text-sm font-normal" style={{ color: "var(--law-muted)" }}>· <bdi dir="auto">{r.room}</bdi></span>}
          </label>
          <p className="text-sm"><bdi dir="auto">{r.subjectName}</bdi>{r.professor && <span style={{ color: "var(--law-muted)" }}> · <bdi dir="auto">{r.professor}</bdi></span>}</p>
          {(r.activeFrom || r.activeTo) && <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{r.activeFrom || "…"}</bdi> <Forward /> <bdi dir="ltr">{r.activeTo || "…"}</bdi></p>}
          <div className="grid grid-cols-2 gap-2">
            <Select value={r.pick} onChange={(e) => setRow(i, { pick: e.target.value })} aria-label={tr("المادة")}
              options={[...(r.subjectName ? [[NEW, tr("+ مادة جديدة بهذا الاسم")]] : []), [SKIP, tr("بدون مادة")], ...modules.map((m) => [m.id, m.title])]} />
            <Select value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value })} aria-label={tr("النوع")} options={Object.entries(KIND_LABELS)} />
          </div>
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        {tr("استبدال جدولي الحالي (وإلا تُضاف هذه الحصص إليه)")}
      </label>
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="button" onClick={confirm} disabled={busy || !rows.some((r) => r.include)}>
          {busy ? "…" : tr("تأكيد وحفظ {0} حصة", [rows.filter((r) => r.include).length])}
        </Button>
        <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>{tr("رجوع")}</Button>
      </div>
    </div>
  );
}
