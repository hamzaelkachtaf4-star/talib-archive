import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { ANALYSIS_ERRORS, CODE_NAME, GAP_KIND, GAP_STATUS, severityBand } from "./labels";

const FILTERS = () => [["ALL", tr("الكل")], ["OPEN", tr("مقترحة")], ["CONFIRMED", tr("مؤكدة")], ["DISMISSED", tr("مستبعدة")]];
const STUDENT_CAN_SET = new Set(["OPEN", "CONFIRMED", "DISMISSED"]);

function GapCard({ gap, onSet, busy }) {
  const band = severityBand(gap.severity);
  const kind = GAP_KIND()[gap.kind] || gap.kind;
  const sep = gap.canonicalId.indexOf(":");
  const [code, num] = [gap.canonicalId.slice(0, sep), gap.canonicalId.slice(sep + 1)]; // split on the first colon only
  const editable = STUDENT_CAN_SET.has(gap.status);
  return (
    <li className="law-card3d grid gap-2" data-status={gap.status} style={gap.status === "DISMISSED" ? { opacity: 0.75 } : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="law-chip" data-active={gap.status === "CONFIRMED" || undefined}>{GAP_STATUS()[gap.status] || gap.status}</span>
        <span className="law-chip">{kind}</span>
        {gap.partial && <span className="law-chip" title={tr("تناولت ملاحظاتك الموضوع لكنها أغفلت الأجل أو الجزاء الوارد في المادة")}>{tr("جزئية")}</span>}
        <span className="ms-auto flex items-center gap-2" title={`${gap.severity.toFixed(1)} / 10`}>
          <span className="h-2 overflow-hidden rounded-full" style={{ inlineSize: 64, background: "var(--law-surface-2)" }} aria-hidden="true">
            <span className="block h-full" style={{ inlineSize: `${Math.min(100, gap.severity * 10)}%`, background: band.color }} />
          </span>
          <span className="text-xs font-bold" style={{ color: band.color === "var(--law-muted)" ? "var(--law-text)" : band.color }}>{band.label}</span>
        </span>
      </div>
      <p className="text-sm leading-7"><Link to={`/law/corpus/a/${encodeURIComponent(gap.canonicalId)}`} className="font-bold" style={{ color: "var(--law-primary)" }}><bdi>{CODE_NAME(code)}</bdi> <bdi dir="ltr">{num}</bdi></Link>{gap.sectionTitle && <> · <bdi>{gap.sectionTitle}</bdi></>}</p>
      <p className="text-sm leading-7"><bdi>{gap.explanationAr}</bdi></p>
      <details>
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-bold" style={{ color: "var(--law-primary)" }}>{tr("نص المادة في المكتبة")}</summary>
        <blockquote className="whitespace-pre-wrap rounded-md p-3 text-sm leading-7" style={{ background: "var(--law-surface-2)", borderInlineStart: "3px solid var(--law-border)" }}><bdi>{gap.quote}</bdi></blockquote>
      </details>
      {editable && (
        <div className="flex flex-wrap gap-2">
          {gap.status !== "CONFIRMED" && <Button3D onClick={() => onSet(gap, "CONFIRMED")} disabled={busy}>{tr("أؤكد أنها ثغرة")}</Button3D>}
          {gap.status !== "DISMISSED" && <Button3D variant="neutral" onClick={() => onSet(gap, "DISMISSED")} disabled={busy}>{tr("ليست ثغرة")}</Button3D>}
          {gap.status !== "OPEN" && <Button3D variant="neutral" onClick={() => onSet(gap, "OPEN")} disabled={busy}>{gap.status === "DISMISSED" ? tr("إعادة فتحها") : tr("إعادتها إلى المقترحة")}</Button3D>}
        </div>
      )}
    </li>
  );
}

function CorpusEmpty({ codes }) {
  return (
    <div className="law-card3d grid gap-3" role="status">
      <h3 className="text-lg font-bold">{tr("لا نصوص قانونية للمقارنة بعد")}</h3>
      <p className="text-sm leading-7" style={{ color: "var(--law-muted)" }}>{tr("الرادار يقارن ملاحظاتك بمواد القانون المحفوظة في المكتبة، ولا يخمّن نصا غير موجود. استورد النص من الجريدة الرسمية ثم أعد المحاولة.")}</p>
      <ul className="grid gap-1 text-sm">
        {codes.map((c) => (
          <li key={c.slug} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold"><bdi>{CODE_NAME(c.slug)}</bdi></span>
            <span className="law-chip">{c.articles > 0 ? <><bdi dir="ltr">{c.articles}</bdi> {tr("مادة")}</> : c.found ? tr("لم تُستورد نصوصه بعد") : tr("غير موجود في المكتبة")}</span>
          </li>
        ))}
      </ul>
      <div><Button3D to="/law/library" variant="neutral">{tr("فتح المكتبة")}</Button3D></div>
    </div>
  );
}

/** Gap radar for one course: run the comparison ("أين مشكلتي؟"), then confirm or dismiss each gap. */
export default function GapRadar({ courseId }) {
  const [gaps, setGaps] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [running, setRunning] = useState(false);
  const [corpus, setCorpus] = useState(null); // { codes } when the corpus is empty
  const [ready, setReady] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(() => new Set()); // ids of gaps whose decision is still being saved
  const [loadFailed, setLoadFailed] = useState(false);
  const analysed = useRef(false);

  const loadReady = useCallback(async () => {
    const r = await Law.gapReadiness(courseId, 5);
    setReady(r.ok ? r.data : null);
  }, [courseId]);

  useEffect(() => {
    let alive = true;
    Law.gaps(courseId).then((r) => {
      if (!alive) return;
      if (r.ok) { setGaps(r.data.gaps); setLoadFailed(false); if (r.data.gaps.length) loadReady(); }
      else { setGaps([]); setLoadFailed(true); } // a failed load is not "no analysis yet": it must not invite a re-analysis
    });
    return () => { alive = false; };
  }, [courseId, loadReady]);

  async function analyse() {
    setRunning(true);
    setError(null);
    setCorpus(null);
    const r = await Law.gapsAnalyze(courseId);
    setRunning(false);
    if (!r.ok) {
      const code = r.data?.error;
      return setError(r.offline ? tr("لا اتصال بالخادم.") : ANALYSIS_ERRORS()[code] || tr("تعذر التحليل."));
    }
    analysed.current = true;
    if (r.data.status === "corpus_empty") {
      setCorpus({ codes: r.data.codes });
      setLive(tr("لا نصوص قانونية للمقارنة بعد."));
      return;
    }
    setGaps(r.data.gaps);
    setLive(`${r.data.gaps.length} ${tr("ثغرة")}`);
    loadReady();
  }

  // Decisions are applied and undone per gap with functional updates: two quick decisions on different gaps must not
  // undo each other, and each gap has its own "saving" flag.
  async function setStatus(gap, status) {
    const patch = (to) => setGaps((gs) => gs.map((g) => (g.id === gap.id ? { ...g, status: to } : g)));
    const flag = (on) => setBusy((b) => { const n = new Set(b); on ? n.add(gap.id) : n.delete(gap.id); return n; });
    flag(true);
    patch(status); // optimistic
    const r = await Law.gapSetStatus(courseId, gap.id, status);
    flag(false);
    if (!r.ok) {
      patch(gap.status);
      return setError(tr("تعذر حفظ قرارك. حاول مجددا."));
    }
    loadReady();
  }

  const shown = (gaps || []).filter((g) => filter === "ALL" || g.status === filter);
  const counts = (gaps || []).reduce((m, g) => ((m[g.status] = (m[g.status] || 0) + 1), m), {});

  return (
    <div className="grid gap-4">
      <section className="law-card3d grid gap-3" aria-labelledby="radar-title">
        <h2 id="radar-title" className="text-lg font-bold">{tr("رادار الثغرات")}</h2>
        <p className="text-sm leading-7" style={{ color: "var(--law-muted)" }}>{tr("يقارن ملاحظاتك بمواد قانون الالتزامات والعقود ومدونة التجارة المحفوظة في المكتبة، ويبرز ما لم تتناوله: الآجال والتقادم والجزاءات والشروط. لا يستعمل الذكاء الاصطناعي ولا يستشهد إلا بمواد موجودة.")}</p>
        <div><Button3D onClick={analyse} disabled={running}>{running ? tr("جارٍ التحليل…") : tr("أين مشكلتي؟")}</Button3D></div>
        {error && <Notice tone="warn">{error}</Notice>}
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
      </section>

      {corpus && <CorpusEmpty codes={corpus.codes} />}

      {ready && ready.candidates?.length > 0 && (
        <Notice tone="muted">
          <bdi dir="ltr">{ready.candidates.length}</bdi> {tr("ثغرات جاهزة لتكوين اختبار تشخيصي قصير.")}{" "}
          {ready.summary?.withConcept > 0 ? <><bdi dir="ltr">{ready.summary.withConcept}</bdi> {tr("منها مرتبطة بمفاهيم مراجَعة تغذي «ذاكرتي».")}</> : tr("لا مفاهيم مراجَعة مرتبطة بها بعد، فلن تُسجَّل في «ذاكرتي».")}{" "}
          {tr("الاختبار التشخيصي قيد الإعداد.")}
        </Notice>
      )}

      {gaps && gaps.length > 0 && (
        <>
          <div role="group" aria-label={tr("تصفية الثغرات")} className="flex flex-wrap gap-2">
            {FILTERS().map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} className="law-chip" data-active={filter === key || undefined} onClick={() => setFilter(key)}>
                {label} <bdi dir="ltr">{key === "ALL" ? gaps.length : counts[key] || 0}</bdi>
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("لا ثغرات في هذا التصنيف.")}</p> : (
            <ul className="grid gap-3">{shown.map((g) => <GapCard key={g.id} gap={g} onSet={setStatus} busy={busy.has(g.id)} />)}</ul>
          )}
        </>
      )}

      {loadFailed && <Notice tone="warn">{tr("تعذر تحميل الثغرات. تحقق من الاتصال ثم أعد فتح الصفحة.")}</Notice>}
      {gaps && gaps.length === 0 && !corpus && !running && !loadFailed && (
        <p className="text-sm" style={{ color: "var(--law-muted)" }}>{analysed.current ? tr("لم يجد الرادار ثغرات: ملاحظاتك تغطي ما قورن بها.") : tr("لم يُجرَ تحليل بعد. اضغط «أين مشكلتي؟».")}</p>
      )}
    </div>
  );
}
