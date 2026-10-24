import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import CaseList from "@/components/LawOS/Method/CaseList";
import DissertationList from "@/components/LawOS/Method/DissertationList";
import QualificationDrill from "@/components/LawOS/Method/QualificationDrill";
import { tr } from "@/components/LawOS/lib/i18n";

const TABS = [
  ["cases", tr("حالات عملية")],
  ["dissertations", tr("مواضيع")],
  ["drills", tr("تدريب التكييف")],
];

/** `embedded` hides the page title when the methodology sits inside a module workspace. */
export default function Method({ embedded = false }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "cases";
  const [subjects, setSubjects] = useState([]);
  useEffect(() => {
    Law.subjects().then((r) => r.ok && setSubjects(r.data.subjects));
  }, []);
  return (
    <>
      {!embedded && (
        <PageTitle sub={tr("اكتب أنت أولا، ثم يأتي التصحيح")}>
          {tr("المنهجية")}
        </PageTitle>
      )}
      <div
        className="mb-4 flex gap-1 rounded-xl p-1"
        style={{ background: "var(--law-surface-2)" }}
      >
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setParams({ tab: k }, { replace: true })}
            className="min-h-[40px] flex-1 rounded-lg text-sm font-semibold"
            style={
              tab === k
                ? { background: "var(--law-surface)" }
                : { color: "var(--law-muted)" }
            }
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "cases" && <CaseList subjects={subjects} />}
      {tab === "dissertations" && <DissertationList />}
      {tab === "drills" && <QualificationDrill />}
    </>
  );
}
