import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import Button3D from "@/components/LawOS/kit/Button3D";
import EmptyState from "@/components/LawOS/kit/EmptyState";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** Contrast drills built from the student's active weaknesses (item bank first; AI-written items are labelled). */
export default function WeakSpots() {
  const [items, setItems] = useState(null);
  const [i, setI] = useState(0);
  const [res, setRes] = useState(null);
  const [mem, setMem] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => { Law.brainDrills().then((r) => { setItems(r.ok ? r.data.drills : []); setI(0); setRes(null); }); Law.brainToday().then((r) => r.ok && setMem(r.data)); };
  useEffect(load, []);
  const cur = items?.[i];
  const answer = async (idx) => { const r = await Law.brainAnswer(cur.id, idx); if (r.ok) setRes({ ...r.data, chosen: idx }); };
  const gen = async () => {
    const pairId = mem?.memory?.pairId;
    if (!pairId) return;
    const r = await Law.brainGenerate(pairId);
    setMsg(r.ok ? tr("أُنشئ تمرين جديد من نصوص المرجع.") : r.data?.error?.code === "no_corpus_refs" ? tr("لا نصوص مرجعية مرتبطة بهذا الموضوع بعد.") : tr("تعذر إنشاء تمرين الآن."));
    if (r.ok) load();
  };
  const report = async () => { await Law.brainReportDrill(cur.id); setMsg(tr("شكراً، سُحب هذا التمرين للمراجعة.")); setRes(null); load(); };
  const next = () => { setRes(null); if (i + 1 < items.length) setI(i + 1); else load(); };
  return (
    <>
      <PageTitle sub={tr("قارن بين المفهومين اللذين تخلط بينهما")}>{tr("تمارين نقاط ضعفي")}</PageTitle>
      <Link to="/law/memory" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}>{tr("ذاكرتي")}</Link>
      {msg && <Notice tone="muted">{msg}</Notice>}
      {items && !items.length && <EmptyState title={tr("لا تمارين الآن")} hint={mem?.enabled === false ? tr("الذاكرة موقوفة.") : tr("حين تظهر نقطة ضعف ستجد هنا تمارين مقارنة.")} action={mem?.memory ? <Button3D variant="neutral" onClick={gen}>{tr("أنشئ تمرينا من نصوص المرجع")}</Button3D> : null} />}
      {cur && (
        <div className="law-card3d grid gap-3">
          {cur.aiGenerated && <p className="text-xs"><span className="law-chip">{tr("مولَّد آلياً")}</span> <button type="button" className="underline" onClick={report}>{tr("إبلاغ عن خطأ")}</button></p>}
          <p className="font-bold" style={{ unicodeBidi: "plaintext" }}>{cur.prompt}</p>
          <div className="grid gap-2" role="group" aria-label={tr("الخيارات")}>
            {cur.options.map((o, idx) => (
              <button key={idx} type="button" disabled={!!res} onClick={() => answer(idx)} className="law-btn3d" data-variant="neutral" style={res && (idx === res.correctIndex ? { borderColor: "var(--law-ok)" } : idx === res.chosen ? { borderColor: "var(--law-danger)" } : undefined)}>
                {res && idx === res.correctIndex ? "✓ " : res && idx === res.chosen ? "✗ " : ""}{o.text}
              </button>
            ))}
          </div>
          {res && (<>
            <p role="status" className="font-bold" style={{ color: res.correct ? "var(--law-ok)" : "var(--law-danger)" }}>{res.correct ? tr("أحسنت!") : tr("ليس تماما، تراجع التفسير.")}</p>
            {res.explanation && <p className="text-sm" style={{ unicodeBidi: "plaintext" }}>{res.explanation}</p>}
            {res.citedIds?.length > 0 && <p className="text-xs">{res.citedIds.map((c) => <Link key={c} className="law-chip" to={`/law/corpus/a/${encodeURIComponent(c)}`}><bdi dir="ltr">{c}</bdi></Link>)}</p>}
            <Button3D onClick={next}>{tr("التالي")}</Button3D>
          </>)}
        </div>
      )}
    </>
  );
}
