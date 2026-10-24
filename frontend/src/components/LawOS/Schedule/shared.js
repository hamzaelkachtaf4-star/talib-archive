import { tr } from "@/components/LawOS/lib/i18n";

// Monday … Saturday: the faculty week (Sunday slots still show under "all days" if any exist).
export const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6];

export const KIND_LABELS = {
  amphi: tr("محاضرة"),
  TD: tr("أعمال موجهة TD"),
  TP: tr("أشغال تطبيقية TP"),
};

export const blankSlot = (weekday = 1) => ({
  weekday,
  startTime: "08:30",
  endTime: "10:00",
  kind: "amphi",
  room: "",
  subjectId: "",
  moduleId: "",
});

/** Shape PUT /law/timetable expects (ids kept so linked class sessions survive). */
export function toPayload(slots) {
  return slots.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    weekday: Number(s.weekday),
    startTime: s.startTime,
    endTime: s.endTime,
    kind: s.kind || "amphi",
    room: s.room || null,
    subjectId: s.subjectId || null,
    activeFrom: s.activeFrom || null,
    activeTo: s.activeTo || null,
    professor: s.professor || null,
    groupLabel: s.groupLabel || null,
    moduleId: s.moduleId || null,
    placeholder: !!s.placeholder && !s.subjectId,
  }));
}

export const byTime = (a, b) =>
  a.weekday - b.weekday || a.startTime.localeCompare(b.startTime);

export function timetableError(code) {
  if (code === "start must be before end") return tr("يجب أن يكون وقت البداية قبل وقت النهاية.");
  if (code === "invalid time") return tr("الوقت غير صحيح (HH:MM).");
  if (code === "unknown subject") return tr("مادة غير موجودة.");
  return tr("تعذّر الحفظ. أعد المحاولة.");
}
