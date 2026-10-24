import { Select } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** Optional subject; "automatic" lets the server label from the timetable (spec §6.1). */
export default function SubjectPicker({ subjects, value, onChange }) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={tr("المادة")}
      options={[
        ["", tr("تلقائي حسب الجدول")],
        ...subjects.map((s) => [s.id, s.name]),
      ]}
    />
  );
}
