import { useState } from "react";
import { FileArrowUp, DownloadSimple } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import ImportReview from "./ImportReview";

const MAX = 900 * 1024; // the server refuses more than 1 MB of ICS / 500 KB of CSV; fail early on the phone
/** UTF-8 first; an Excel export from an Arabic or French Windows is windows-1256 / 1252, so fall back instead of showing mojibake. */
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { /* not UTF-8 */ }
  for (const enc of ["windows-1256", "windows-1252"]) {
    try { return new TextDecoder(enc).decode(buf); } catch { /* label unsupported */ }
  }
  return new TextDecoder().decode(buf);
}

const ERRORS = () => ({
  empty_file: tr("الملف فارغ."),
  not_a_calendar: tr("هذا ليس ملف تقويم (.ics) صالحاً."),
  file_too_large: tr("الملف كبير جداً."),
  no_rows: tr("لا صفوف في الملف."),
  missing_columns: tr("ينقص الملف أعمدة ضرورية: اليوم، البداية، النهاية، المادة."),
  rate_limited: tr("بلغت حد الاستيراد اليومي."),
});

// The CSV template: the header row is the contract (day, start, end, subject, room, professor, group). One example row shows the shape.
const CSV_TEMPLATE = "day,start,end,subject,room,professor,group\nmonday,08:30,10:00,Responsabilité civile,Amphi 3,Pr. Alami,G01\n";
function downloadTemplate() {
  const url = URL.createObjectURL(new Blob(["\ufeff" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "talib-timetable-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A calendar (.ics) or spreadsheet (.csv) export, then candidates, then the same review step as every other import. */
export default function FileImport({ modules, semester, current, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const format = /\.ics$/i.test(file.name) || file.type === "text/calendar" ? "ics" : /\.csv$/i.test(file.name) || file.type === "text/csv" ? "csv" : null;
    if (!format) return setError(tr("اختر ملف .ics أو .csv."));
    if (file.size > MAX) return setError(ERRORS().file_too_large);
    setBusy(true);
    let r;
    try {
      r = await Law.timetableImport({ format, content: await readText(file) });
    } catch {
      r = { ok: false, offline: false, data: null };
    }
    setBusy(false);
    if (!r.ok) return setError(r.offline ? tr("لا يوجد اتصال بالخادم.") : ERRORS()[r.data?.error] || tr("حدث خطأ. أعد المحاولة."));
    if (!r.data.slots.length) return setError(tr("لم نجد أي حصة في الملف."));
    setResult(r.data);
  }

  if (result)
    return <ImportReview candidates={result.slots} notes={result.notes} warnings={result.warnings} rejected={result.rejected} modules={modules} semester={semester} current={current} onBack={() => setResult(null)} onSaved={(saved) => { setResult(null); onSaved(saved); }} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-7" style={{ color: "var(--law-muted)" }}>
        {tr("استورد جدولك من ملف تقويم (.ics) من Google أو Apple أو Outlook، أو من ملف جدول (.csv) بأعمدة: اليوم، البداية، النهاية، المادة، القاعة، الأستاذ، الفوج.")}
      </p>
      <label className="law-file flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center font-semibold" style={{ border: "2px dashed var(--law-border)", color: "var(--law-primary)" }}>
        <FileArrowUp size={36} aria-hidden="true" />
        {busy ? "…" : tr("اختيار ملف .ics أو .csv")}
        <input type="file" accept=".ics,.csv,text/calendar,text/csv" className="sr-only" onChange={pick} disabled={busy} />
      </label>
      <button type="button" onClick={downloadTemplate} className="law-btn law-btn-secondary flex items-center justify-center gap-2 self-start"><DownloadSimple size={18} aria-hidden="true" />{tr("تنزيل قالب CSV")}</button>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}
