import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import CardFace from "./CardFace";
import { recordReview } from "../lib/reviewSync";
import { previewDue, intervalLabel } from "../lib/fsrs";
import { tr } from "@/components/LawOS/lib/i18n";
import { playSound } from "../lib/prefs";

// Four ratings (spec §8.1). The student's "سهل / متوسط / صعب" map to Easy / Good / Hard; "لم أتذكر" is Again.
const RATINGS = [
  { grade: 1, label: tr("لم أتذكر"), color: "var(--law-danger)" },
  { grade: 2, label: tr("صعب"), color: "var(--law-warn)" },
  { grade: 3, label: tr("متوسط"), color: "var(--law-accent)" },
  { grade: 4, label: tr("سهل"), color: "var(--law-primary)" },
];
// Clock reads live outside the component: they only run in effects and event handlers.
const clock = () => Date.now();

const RELEARN_WINDOW_MS = 20 * 60000; // cards due again within 20 min come back in this session

/**
 * One-thumb review: tap anywhere to reveal, four large buttons in the bottom third, no confirmations.
 */
export default function ReviewSession({
  cards,
  retention = 0.9,
  subjectName,
  onExit,
}) {
  const [queue, setQueue] = useState(cards);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const shownAt = useRef(0);
  const card = queue[0];

  useEffect(() => {
    shownAt.current = clock();
    setRevealed(false);
  }, [card?.id, done]);

  const due = useMemo(
    () => (card ? previewDue(card, new Date(), retention) : null),
    [card, retention]
  );

  async function rate(grade) {
    if (!card) return;
    playSound(grade === 1 ? "again" : "good");
    const updated = await recordReview(card, grade, clock() - shownAt.current);
    const rest = queue.slice(1);
    const comesBack = new Date(updated.due) - clock() <= RELEARN_WINDOW_MS;
    setQueue(comesBack ? [...rest, updated] : rest);
    setDone((d) => d + 1);
  }

  const total = done + queue.length;
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col"
      style={{ background: "var(--law-bg)" }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <button
          type="button"
          onClick={onExit}
          aria-label={tr("إنهاء المراجعة")}
          className="flex h-11 w-11 items-center justify-center"
        >
          <X size={24} />
        </button>
        <span className="law-muted text-sm">
          {subjectName || tr("كل المواد")}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          <bdi dir="ltr">
            {done}/{total}
          </bdi>
        </span>
      </header>
      <div
        className="h-1 w-full"
        style={{ background: "var(--law-surface-2)" }}
      >
        <div
          className="h-1"
          style={{
            width: `${total ? (done / total) * 100 : 100}%`,
            background: "var(--law-accent)",
          }}
        />
      </div>

      {card ? (
        <>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="flex-1 overflow-y-auto px-5 py-6 text-start"
            aria-label={revealed ? tr("البطاقة") : tr("اضغط لإظهار الجواب")}
          >
            <CardFace card={card} revealed={revealed} />
            {!revealed && (
              <p className="law-muted mt-8 text-center text-sm">
                {tr("اضغط في أي مكان لإظهار الجواب")}
              </p>
            )}
          </button>
          <div
            className="law-safe-bottom grid grid-cols-4 gap-2 px-3 pb-3 pt-2"
            style={{ minHeight: "33vh", alignContent: "end" }}
          >
            {RATINGS.map(({ grade, label, color }) => (
              <button
                key={grade}
                type="button"
                disabled={!revealed}
                onClick={() => rate(grade)}
                className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl font-bold transition-opacity disabled:opacity-30"
                style={{
                  background: "var(--law-surface)",
                  border: `2px solid ${color}`,
                  color,
                }}
              >
                <span className="text-base">{label}</span>
                <span
                  className="text-xs font-semibold tabular-nums"
                  style={{ color: "var(--law-muted)" }}
                >
                  {due && intervalLabel(due[grade])}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-2xl font-bold">{tr("أحسنت!")}</p>
          <p className="law-muted leading-8">
            {tr("أنهيت")} {done}{" "}
            {tr("بطاقة. ستُزامن نتائجك تلقائيا عند توفر الاتصال.")}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="law-btn law-btn-primary"
          >
            {tr("رجوع")}
          </button>
        </div>
      )}
    </div>
  );
}
