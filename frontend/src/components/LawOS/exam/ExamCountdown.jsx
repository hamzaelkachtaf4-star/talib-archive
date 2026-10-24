import { CalendarCheck } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

export const daysLabel = (n) => (n === 0 ? tr("اليوم") : n === 1 ? tr("غداً") : tr("بعد {0} يوم", [n]));

/** The next confirmed exams as a countdown. */
export default function ExamCountdown({ exams }) {
  if (!exams?.length)
    return <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا امتحانات قادمة مضافة. أضف تاريخاً أو استورد جدول الامتحانات.")}</p>;
  const [next, ...rest] = exams;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "var(--law-primary)", color: "var(--law-on-primary)" }}>
        <CalendarCheck size={32} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm">{tr("الامتحان القادم")}</p>
          <p className="truncate text-lg font-bold"><bdi>{next.title}</bdi></p>
          <p className="text-2xl font-bold"><bdi>{daysLabel(next.daysTo)}</bdi></p>
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {rest.map((e) => <li key={e.id} className="flex justify-between gap-2"><span className="truncate"><bdi>{e.title}</bdi></span><span className="shrink-0 font-semibold"><bdi>{daysLabel(e.daysTo)}</bdi></span></li>)}
        </ul>
      )}
    </div>
  );
}
