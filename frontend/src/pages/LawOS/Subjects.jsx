import { useCallback, useEffect, useState } from "react";
import { Books, Plus, LockSimple, Scales } from "@phosphor-icons/react";
import { Link, useNavigate } from "react-router-dom";
import Law from "@/models/law";
import EmptyState, { PageTitle } from "@/components/LawOS/EmptyState";
import { Button, Card, Notice } from "@/components/LawOS/ui";
import SubjectForm from "@/components/LawOS/Subjects/SubjectForm";
import * as idb from "@/components/LawOS/lib/idb";
import { tr } from "@/components/LawOS/lib/i18n";

function ExamChip({ subject }) {
  if (subject.daysToExam === null || subject.daysToExam < 0) return null;
  return (
    <span
      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        background: "var(--law-surface-2)",
        color: subject.lockdown ? "var(--law-warn)" : "var(--law-muted)",
      }}
    >
      {subject.lockdown && <LockSimple size={12} weight="bold" />}
      {tr("الامتحان بعد")} <bdi dir="ltr">{subject.daysToExam}</bdi> {tr("يوم")}
    </span>
  );
}

export default function Subjects() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState(null); // null | "new" | subject

  const load = useCallback(async () => {
    const res = await Law.subjects();
    if (res.ok) {
      setSubjects(res.data.subjects);
      setOffline(false);
      idb.setMeta("subjects", res.data.subjects).catch(() => {});
    } else {
      setOffline(res.offline);
      setSubjects((await idb.getMeta("subjects")) || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(body) {
    const res =
      editing === "new"
        ? await Law.createSubject(body)
        : await Law.updateSubject(editing.id, body);
    if (!res.ok)
      return res.offline
        ? tr("يلزم الاتصال لحفظ المادة.")
        : res.data?.error || tr("تعذر الحفظ");
    setEditing(null);
    load();
    return null;
  }

  if (editing)
    return (
      <>
        <PageTitle>
          {editing === "new" ? tr("مادة جديدة") : editing.name}
        </PageTitle>
        <Card className="p-4">
          <SubjectForm
            subject={editing === "new" ? null : editing}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </Card>
      </>
    );

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageTitle sub={tr("نسخة الامتحان ونسخة الباحث لكل مادة")}>
          {tr("المواد")}
        </PageTitle>
        <Button
          onClick={() => setEditing("new")}
          disabled={offline}
          aria-label={tr("مادة جديدة")}
        >
          <Plus size={20} weight="bold" />
        </Button>
      </div>
      <Link
        to="/law/library/corpus"
        className="law-card mb-4 flex items-center gap-3 p-3 text-sm font-semibold"
      >
        <Scales size={22} style={{ color: "var(--law-accent)" }} />
        {tr("المرجع القانوني: النصوص، الاجتهاد، الفقه")}
      </Link>
      {offline && (
        <Notice tone="warn">
          {tr("بدون اتصال: تُعرض آخر نسخة محفوظة من المواد.")}
        </Notice>
      )}
      {subjects && subjects.length === 0 && (
        <EmptyState Icon={Books} title={tr("لا توجد مواد بعد")}>
          {tr(
            "أضف مواد السداسي الثالث: اسم المادة، الأستاذ، وتاريخ الامتحان. ستُرتب المادة لاحقا حسب تصميم الأستاذ."
          )}
        </EmptyState>
      )}
      <div className="flex flex-col gap-3">
        {(subjects || []).map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => navigate(`/law/subjects/${s.id}`)}
              className="flex w-full items-stretch text-start"
            >
              <span
                className="w-1.5 shrink-0"
                style={{ background: s.color }}
              />
              <span className="flex flex-1 flex-col gap-2 p-4">
                <span className="text-lg font-bold">{s.name}</span>
                {s.nameFr && (
                  <bdi dir="ltr" className="law-muted text-sm">
                    {s.nameFr}
                  </bdi>
                )}
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  {s.professorName && (
                    <span className="law-muted">{s.professorName}</span>
                  )}
                  {s.dueCount > 0 && (
                    <span
                      className="rounded-full px-2.5 py-1 font-semibold"
                      style={{ background: "var(--law-surface-2)" }}
                    >
                      <bdi dir="ltr">{s.dueCount}</bdi> {tr("للمراجعة")}
                    </span>
                  )}
                  <ExamChip subject={s} />
                </span>
              </span>
            </button>
          </Card>
        ))}
      </div>
    </>
  );
}
