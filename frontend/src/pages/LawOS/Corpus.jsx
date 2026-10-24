import { useSearchParams } from "react-router-dom";
import { PageTitle } from "@/components/LawOS/EmptyState";
import ArticleSearch from "@/components/LawOS/Corpus/ArticleSearch";
import DecisionLedger from "@/components/LawOS/Corpus/DecisionLedger";
import DoctrineList from "@/components/LawOS/Corpus/DoctrineList";
import ImportList from "@/components/LawOS/Corpus/ImportList";
import RadarPanel from "@/components/LawOS/Radar/RadarPanel";
import { tr } from "@/components/LawOS/lib/i18n";

const TABS = [
  ["search", tr("النصوص")],
  ["decisions", tr("الاجتهاد")],
  ["doctrine", tr("الفقه")],
  ["import", tr("الاستيراد")],
  ["radar", tr("الرادار")],
];

export default function Corpus() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "search";
  return (
    <>
      <PageTitle
        sub={tr(
          "النصوص الرسمية المُراجعة، قرارات محكمة النقض، والمراجع الفقهية"
        )}
      >
        {tr("المرجع القانوني")}
      </PageTitle>
      <div
        className="mb-4 flex gap-1 rounded-xl p-1"
        style={{ background: "var(--law-surface-2)" }}
        role="tablist"
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams({ tab: key }, { replace: true })}
            className="min-h-[40px] flex-1 rounded-lg text-sm font-semibold"
            style={
              tab === key
                ? { background: "var(--law-surface)" }
                : { color: "var(--law-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "search" && <ArticleSearch />}
      {tab === "decisions" && <DecisionLedger />}
      {tab === "doctrine" && <DoctrineList />}
      {tab === "import" && <ImportList />}
      {tab === "radar" && <RadarPanel />}
    </>
  );
}
