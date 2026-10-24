import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import EmptyState, { PageTitle } from "@/components/LawOS/EmptyState";
import { Card } from "@/components/LawOS/ui";
import { WEEKDAYS } from "@/components/LawOS/ui";
import { weekdayOfDate } from "@/components/LawOS/lib/dates";
import { tr } from "@/components/LawOS/lib/i18n";

function Stat({ n, label }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold tabular-nums">
        <bdi dir="ltr">{n}</bdi>
      </p>
      <p className="law-muted text-[11px]">{label}</p>
    </div>
  );
}

/** Sunday recap screen (spec §8.5). */
export default function Recap() {
  const [recap, setRecap] = useState(undefined);
  useEffect(() => {
    Law.latestRecap().then((r) => {
      setRecap(r.ok ? r.data.recap : null);
      if (r.ok && r.data.recap && !r.data.recap.viewedAt)
        Law.recapViewed(r.data.recap.id);
    });
  }, []);
  if (recap === undefined) return null;
  if (!recap)
    return (
      <>
        <PageTitle>{tr("ملخص الأسبوع")}</PageTitle>
        <EmptyState title={tr("لا ملخص بعد")}>
          {tr("يُنشأ الملخص كل أحد على الساعة الثامنة مساء.")}
        </EmptyState>
      </>
    );
  const c = recap.content;
  return (
    <>
      <PageTitle sub={`${c.weekStart} – ${c.weekEnd}`}>
        {tr("ملخص الأسبوع")}
      </PageTitle>
      {c.aiSummary && (
        <Card className="mb-3 p-4">
          <p className="leading-8">{c.aiSummary}</p>
        </Card>
      )}
      <Card className="mb-3 grid grid-cols-4 gap-2 p-4">
        <Stat n={c.minutes} label={tr("دقيقة")} />
        <Stat n={c.goalDays} label={tr("يوم هدف")} />
        <Stat n={c.cardsLearned} label={tr("بطاقة جديدة")} />
        <Stat n={c.casesSolved} label={tr("حالة عملية")} />
      </Card>
      {c.weakest.length > 0 && (
        <Card className="mb-3 p-3">
          <p className="mb-1 text-sm font-bold">{tr("أضعف المواضيع")}</p>
          {c.weakest.map((w) => (
            <p key={w.subjectId} className="text-sm">
              {w.subject}: <bdi dir="ltr">{Math.round(w.lapseRate * 100)}%</bdi>{" "}
              {tr("نسيان")}
            </p>
          ))}
          {c.lapsedCards.map((x) => (
            <p key={x.cardId} className="law-muted text-xs">
              {x.front}
            </p>
          ))}
        </Card>
      )}
      {c.articles.length > 0 && (
        <Card className="mb-3 p-3">
          <p className="mb-1 text-sm font-bold">{tr("نصوص صادفتها")}</p>
          <div className="flex flex-wrap gap-1">
            {c.articles.map((id) => (
              <Link
                key={id}
                to={`/law/corpus/a/${encodeURIComponent(id)}`}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--law-surface-2)" }}
              >
                <bdi dir="ltr">{id}</bdi>
              </Link>
            ))}
          </div>
        </Card>
      )}
      {c.inboxPending > 0 && (
        <Link
          to="/law/capture?tab=inbox"
          className="law-card mb-3 block p-3 text-sm"
        >
          {tr("صندوق الوارد:")} <bdi dir="ltr">{c.inboxPending}</bdi>{" "}
          {tr("عنصر بانتظارك")}
        </Link>
      )}
      <Card className="p-3">
        <p className="mb-1 text-sm font-bold">{tr("حصص الأسبوع القادم")}</p>
        {c.nextWeek.length ? (
          c.nextWeek.map((s, i) => (
            <p key={i} className="text-sm">
              {WEEKDAYS[weekdayOfDate(s.date)]}{" "}
              <bdi dir="ltr">{s.startTime}</bdi> ·{" "}
              {s.subject || tr("حصة غير محددة")}
            </p>
          ))
        ) : (
          <p className="law-muted text-sm">{tr("لا حصص في الجدول.")}</p>
        )}
      </Card>
    </>
  );
}
