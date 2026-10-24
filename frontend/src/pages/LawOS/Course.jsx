import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import { Notice } from "@/components/LawOS/ui";
import OutlineTree from "@/components/LawOS/Course/OutlineTree";
import GapRadar from "@/components/LawOS/Course/GapRadar";
import { tr } from "@/components/LawOS/lib/i18n";

/** One course: its outline (with the notes) and its gap radar. */
export default function Course() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(undefined); // undefined = loading, null = not found / failed
  const [offline, setOffline] = useState(false);
  const tab = params.get("tab") === "gaps" ? "gaps" : "outline";

  useEffect(() => {
    let alive = true;
    setData(undefined); // another course: never show the previous one's data
    Law.courseOutline(id).then((r) => {
      if (!alive) return;
      setOffline(!!r.offline);
      setData(r.ok && r.data?.course && Array.isArray(r.data.topics) ? r.data : null);
    });
    return () => { alive = false; };
  }, [id]);

  const back = (
    <Link to="/law/path/courses" className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-bold" style={{ color: "var(--law-primary)" }}>
      <CaretRight size={16} className="law-flip" aria-hidden="true" />{tr("دوراتي")}
    </Link>
  );

  if (data === undefined) return <>{back}<p role="status" className="py-6 text-sm" style={{ color: "var(--law-muted)" }}>…</p></>;
  if (data === null) return <>{back}<Notice tone="warn">{offline ? tr("لا اتصال بالخادم.") : tr("لم يُعثر على هذه المادة.")}</Notice></>;

  const { course, topics } = data;
  const setTab = (t) => setParams(t === "outline" ? {} : { tab: t }, { replace: true });
  return (
    <>
      {back}
      <PageTitle sub={`${topics.length} ${tr("موضوعا")}`}><bdi>{course.title}</bdi></PageTitle>
      <div role="tablist" aria-label={tr("أقسام المادة")} className="mb-4 flex flex-wrap gap-2">
        <button type="button" role="tab" id="tab-outline" aria-selected={tab === "outline"} className="law-chip" data-active={tab === "outline" || undefined} onClick={() => setTab("outline")}>{tr("المخطط")}</button>
        <button type="button" role="tab" id="tab-gaps" aria-selected={tab === "gaps"} className="law-chip" data-active={tab === "gaps" || undefined} onClick={() => setTab("gaps")}>{tr("رادار الثغرات")}</button>
      </div>
      {tab === "outline" ? (
        <div role="tabpanel" id="panel-outline" aria-labelledby="tab-outline"><OutlineTree key={course.id} courseId={course.id} topics={topics} /></div>
      ) : (
        <div role="tabpanel" id="panel-gaps" aria-labelledby="tab-gaps"><GapRadar key={course.id} courseId={course.id} /></div>
      )}
    </>
  );
}
