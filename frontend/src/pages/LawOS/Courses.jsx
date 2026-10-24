import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import ImportNotebook from "@/components/LawOS/Course/ImportNotebook";
import { tr } from "@/components/LawOS/lib/i18n";

/** "دوراتي": the student's courses (imported notebooks) and the import form. */
export default function Courses() {
  const [courses, setCourses] = useState(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const r = await Law.courses();
    if (r.ok) { setCourses(r.data.courses); setOffline(false); setFailed(false); }
    else { setCourses((c) => c || []); setOffline(!!r.offline); setFailed(!r.offline); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(c) {
    if (!window.confirm(tr("حذف هذه المادة وملاحظاتها المستوردة وثغراتها نهائيا؟ دفترك الأصلي لا يتأثر."))) return;
    setDeleting(c.id);
    const r = await Law.courseDelete(c.id);
    setDeleting(null);
    setMsg(r.ok ? tr("حُذفت المادة.") : tr("تعذر الحذف."));
    load();
  }

  return (
    <>
      <PageTitle sub={tr("ملاحظاتك كمخطط، ومقارنتها بالنصوص القانونية لإبراز ما فاتك")}>{tr("دوراتي")}</PageTitle>
      {offline && <Notice tone="warn">{tr("لا اتصال بالخادم.")}</Notice>}
      {msg && <Notice tone="muted">{msg}</Notice>}
      {failed && <Notice tone="warn">{tr("تعذر تحميل المواد. أعد المحاولة لاحقا.")}</Notice>}
      {courses && courses.length === 0 && !offline && !failed && (
        <EmptyState title={tr("لا مواد بعد")} hint={tr("استورد دفتر ملاحظاتك لتظهر مواده هنا.")} />
      )}
      {courses && courses.length > 0 && (
        <ul className="mb-4 grid gap-3">
          {courses.map((c) => (
            <li key={c.id} className="law-card3d grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/law/path/courses/${encodeURIComponent(c.id)}`} className="min-w-0 flex-1 text-start text-lg font-bold no-underline" style={{ color: "var(--law-text)" }}><bdi>{c.title}</bdi></Link>
                {c.status === "ANALYZED" && <span className="law-chip" data-active="true">{tr("جرى تحليلها")}</span>}
              </div>
              <p className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{c.topicCount}</bdi> {tr("موضوعا")} · <bdi dir="ltr">{String(c.createdAt).slice(0, 10)}</bdi></p>
              <div className="flex flex-wrap gap-2">
                <Button3D to={`/law/path/courses/${encodeURIComponent(c.id)}`}>{tr("فتح")}</Button3D>
                <Button3D variant="danger" onClick={() => remove(c)} disabled={deleting === c.id}>{tr("حذف")}</Button3D>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ImportNotebook onImported={load} />
    </>
  );
}
