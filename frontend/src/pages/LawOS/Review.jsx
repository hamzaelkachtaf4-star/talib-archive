import { useCallback, useEffect, useState } from "react";
import { Forward } from "@/components/LawOS/kit/DirArrow";
import { Link } from "react-router-dom";
import { Cards, ArrowsClockwise } from "@phosphor-icons/react";
import EmptyState, { PageTitle } from "@/components/LawOS/EmptyState";
import { Button, Card } from "@/components/LawOS/ui";
import ReviewSession from "@/components/LawOS/Review/ReviewSession";
import CardBrowser from "@/components/LawOS/Review/CardBrowser";
import ReviewStats from "@/components/LawOS/Review/ReviewStats";
import {
  localQueue,
  onPackChange,
  onQueueChange,
  pendingCount,
  syncNow,
} from "@/components/LawOS/lib/reviewSync";
import { interleave } from "@/components/LawOS/lib/interleave";
import useOnline from "@/components/LawOS/lib/useOnline";
import { tr } from "@/components/LawOS/lib/i18n";

const TABS = [
  ["review", tr("مراجعة")],
  ["cards", tr("البطاقات")],
  ["stats", tr("إحصائيات")],
];

export default function Review() {
  const online = useOnline();
  const [tab, setTab] = useState("review");
  const [subjectId, setSubjectId] = useState(
    () => localStorage.getItem("lawos_review_subject") || ""
  );
  const [local, setLocal] = useState({
    due: [],
    fresh: [],
    subjects: [],
    settings: {},
  });
  const [pending, setPending] = useState(0);
  const [session, setSession] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    setLocal(await localQueue({ subjectId: subjectId || undefined }));
    setPending(await pendingCount());
  }, [subjectId]);

  useEffect(() => {
    reload();
    const offPack = onPackChange(reload);
    const offQueue = onQueueChange(setPending);
    return () => {
      offPack();
      offQueue();
    };
  }, [reload]);

  function pickSubject(id) {
    setSubjectId(id);
    try {
      localStorage.setItem("lawos_review_subject", id);
    } catch {}
  }

  async function manualSync() {
    setSyncing(true);
    await syncNow().catch(() => {});
    setSyncing(false);
    reload();
  }

  function start() {
    const cards = subjectId
      ? [...local.due, ...local.fresh]
      : [...interleave(local.due), ...interleave(local.fresh)];
    setSession(cards);
  }

  if (session)
    return (
      <ReviewSession
        cards={session}
        retention={local.settings.desiredRetention}
        subjectName={local.subjects.find((s) => s.id === subjectId)?.name}
        onExit={() => {
          setSession(null);
          reload();
          if (online)
            syncNow()
              .then(reload)
              .catch(() => {});
        }}
      />
    );

  const total = local.due.length + local.fresh.length;
  return (
    <>
      <PageTitle sub={tr("تكرار متباعد، يعمل بدون إنترنت")}>
        {tr("المراجعة")}
      </PageTitle>
      <Link to="/law/exam/weak-spots" className="mb-3 inline-block text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("تمارين نقاط ضعفي")} <Forward /></Link>
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
            onClick={() => setTab(key)}
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

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[{ id: "", name: tr("كل المواد") }, ...local.subjects].map((s) => (
          <button
            key={s.id || "all"}
            type="button"
            onClick={() => pickSubject(s.id)}
            className="min-h-[36px] shrink-0 rounded-full px-4 text-sm font-semibold"
            style={
              subjectId === s.id
                ? {
                    background: "var(--law-primary)",
                    color: "var(--law-on-primary)",
                  }
                : {
                    background: "var(--law-surface)",
                    border: "1px solid var(--law-border)",
                  }
            }
          >
            {s.name}
          </button>
        ))}
      </div>

      {tab === "review" && (
        <div className="flex flex-col gap-4">
          {total === 0 ? (
            <EmptyState Icon={Cards} title={tr("لا توجد بطاقات مستحقة")}>
              {tr(
                "البطاقات تُنشأ من أخطائك، ومن تأكيدات الأستاذ، والتعاريف، والشروط، والآجال. ليس من كل محاضرة."
              )}
            </EmptyState>
          ) : (
            <Card className="flex flex-col items-center gap-4 p-6 text-center">
              <div className="flex gap-8">
                <div>
                  <p className="text-3xl font-bold tabular-nums">
                    <bdi dir="ltr">{local.due.length}</bdi>
                  </p>
                  <p className="law-muted text-xs">{tr("للمراجعة")}</p>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums">
                    <bdi dir="ltr">{local.fresh.length}</bdi>
                  </p>
                  <p className="law-muted text-xs">{tr("جديدة")}</p>
                </div>
              </div>
              <Button
                className="w-full text-lg"
                style={{ minHeight: 56 }}
                onClick={start}
              >
                {tr("ابدأ المراجعة")}
              </Button>
            </Card>
          )}
          <div className="law-muted flex items-center justify-between text-xs">
            <span>
              {pending > 0
                ? tr("{0} مراجعة بانتظار المزامنة", [pending])
                : tr("كل المراجعات متزامنة")}
            </span>
            <button
              type="button"
              onClick={manualSync}
              disabled={!online || syncing}
              className="flex min-h-[36px] items-center gap-1 disabled:opacity-40"
            >
              <ArrowsClockwise
                size={16}
                className={syncing ? "animate-spin" : ""}
              />
              {tr("مزامنة")}
            </button>
          </div>
        </div>
      )}
      {tab === "cards" && (
        <CardBrowser
          subjects={local.subjects}
          subjectId={subjectId || undefined}
          onChanged={manualSync}
        />
      )}
      {tab === "stats" && <ReviewStats />}
    </>
  );
}
