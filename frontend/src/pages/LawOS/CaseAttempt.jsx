import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import BackLink from "@/components/LawOS/kit/BackLink";
import { Timer, CheckCircle } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Notice, Textarea } from "@/components/LawOS/ui";
import ArticlePicker from "@/components/LawOS/Method/ArticlePicker";
import CitationPanel from "@/components/LawOS/Method/CitationPanel";
import RefChip from "@/components/LawOS/Method/RefChip";
import { formatClock } from "@/components/LawOS/lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

// Spec §8.2: the five phases.
const PHASES = [
  tr("عرض الوقائع المنتجة"),
  tr("التكييف القانوني وتحديد الإشكالات"),
  tr("استدعاء القاعدة القانونية"),
  tr("المناقشة والإسقاط"),
  tr("المنطوق والحل النهائي"),
];
const RUBRIC = {
  facts: tr("الوقائع"),
  qualification: tr("التكييف"),
  rule: tr("القاعدة"),
  application: tr("الإسقاط"),
  conclusion: tr("المنطوق"),
};
const clock = () => Date.now();

function Critique({ attempt, onCardAccepted }) {
  const [model, setModel] = useState(attempt.modelAnswer);
  const [msg, setMsg] = useState(null);
  const c = attempt.critique;
  async function askModel() {
    const r = await Law.modelAnswer(attempt.id);
    if (r.ok) setModel(r.data.modelAnswer);
    else setMsg(r.data?.error);
  }
  async function accept(i) {
    const r = await Law.acceptAttemptCard(attempt.id, i);
    if (r.ok) onCardAccepted();
  }
  return (
    <div className="flex flex-col gap-3">
      <CitationPanel check={attempt.citationCheck} />
      {attempt.rubricScores && (
        <Card className="grid grid-cols-5 gap-1 p-3 text-center">
          {Object.entries(RUBRIC).map(([k, l]) => (
            <div key={k}>
              <p className="text-xl font-bold tabular-nums">
                <bdi dir="ltr">{attempt.rubricScores[k]}/4</bdi>
              </p>
              <p className="law-muted text-[11px]">{l}</p>
            </div>
          ))}
        </Card>
      )}
      <Card className="p-4">
        <p className="leading-8">{c.overall}</p>
      </Card>
      {(c.phases || []).map((p) => (
        <Card key={p.phase} className="flex flex-col gap-2 p-3">
          <span className="text-sm font-bold">
            {p.phase}. {PHASES[p.phase - 1]}
          </span>
          {[
            ["correct", tr("صحيح"), "var(--law-ok)"],
            ["missing", tr("ناقص"), "var(--law-warn)"],
            ["wrong", tr("خطأ"), "var(--law-danger)"],
          ].map(([k, l, color]) =>
            (p[k] || []).length ? (
              <div key={k}>
                <span className="text-xs font-bold" style={{ color }}>
                  {l}
                </span>
                <ul className="list-inside list-disc text-sm leading-7">
                  {p[k].map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
          {(p.rules || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.rules.map((r) => (
                <RefChip key={r.canonicalId} r={r} />
              ))}
            </div>
          )}
        </Card>
      ))}
      {attempt.suggestedCards?.length > 0 && (
        <Card className="flex flex-col gap-2 p-3">
          <span className="text-sm font-bold">
            {tr("بطاقات مقترحة من أخطائك")}
          </span>
          {attempt.suggestedCards.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="flex-1">
                <span className="block font-semibold">{s.front}</span>
                <span className="law-muted">{s.back}</span>
              </span>
              {s.acceptedCardId ? (
                <CheckCircle size={22} style={{ color: "var(--law-ok)" }} />
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => accept(i)}
                  style={{ minHeight: 36 }}
                >
                  {tr("إضافة")}
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      {msg && <Notice tone="warn">{msg}</Notice>}
      {model ? (
        <Card className="flex flex-col gap-2 p-3">
          <span className="text-sm font-bold">
            {tr("حل مرجعي (بعد محاولتك)")}
          </span>
          <CitationPanel check={model.citationCheck} />
          {(model.phases || []).map((p) => (
            <p key={p.phase} className="text-sm leading-7">
              <b>{PHASES[p.phase - 1]}:</b> {p.text}
            </p>
          ))}
        </Card>
      ) : (
        <Button variant="secondary" onClick={askModel}>
          {tr("إظهار حل مرجعي للمقارنة")}
        </Button>
      )}
    </div>
  );
}

export default function CaseAttempt() {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [phase, setPhase] = useState(1);
  const [phases, setPhases] = useState({});
  const [saved, setSaved] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const r = await Law.attempt(id);
    if (!r.ok) return;
    setA(r.data.attempt);
    setPhases(r.data.attempt.phases);
    const t = clock();
    setLoadedAt(t);
    setNow(t);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // Poll while the critique is being produced.
  useEffect(() => {
    if (a?.status !== "submitted") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [a?.status, load]);

  // Autosave (debounced) while drafting.
  useEffect(() => {
    if (saved || a?.status !== "draft") return;
    const t = setTimeout(async () => {
      const r = await Law.saveAttempt(id, phases);
      if (r.ok) setSaved(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [phases, saved, a?.status, id]);

  useEffect(() => {
    if (!a?.timed || a.status !== "draft") return;
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [a?.timed, a?.status]);

  if (!a) return null;
  const editable = a.status === "draft";
  const p = phases[String(phase)] || { text: "", citedIds: [] };
  const setP = (patch) => {
    setPhases((all) => ({ ...all, [String(phase)]: { ...p, ...patch } }));
    setSaved(false);
  };
  const remaining =
    a.remainingSec != null
      ? a.remainingSec - Math.floor((now - loadedAt) / 1000)
      : null;

  async function submit() {
    await Law.saveAttempt(id, phases);
    const r = await Law.submitAttempt(id);
    if (r.ok) load();
    setConfirm(false);
  }

  return (
    <div className="pb-44 lg:pb-8">
      <BackLink>{tr("المنهجية")}</BackLink>
      <h1 className="mb-2 text-xl font-bold">{a.exercise.title}</h1>
      <Card className="mb-3 p-3">
        <p className="whitespace-pre-wrap text-sm leading-7">
          {a.exercise.factsAr}
        </p>
      </Card>
      {remaining != null && (
        <p
          className="mb-2 flex items-center gap-1 text-sm font-semibold"
          style={{ color: remaining < 600 ? "var(--law-danger)" : undefined }}
        >
          <Timer size={16} />{" "}
          <bdi dir="ltr">{formatClock(Math.max(0, remaining))}</bdi>
        </p>
      )}

      {editable ? (
        <>
          <div className="mb-3 flex gap-1 overflow-x-auto">
            {PHASES.map((name, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPhase(i + 1)}
                className="min-h-[40px] shrink-0 rounded-lg px-3 text-sm font-semibold"
                style={
                  phase === i + 1
                    ? {
                        background: "var(--law-primary)",
                        color: "var(--law-on-primary)",
                      }
                    : { background: "var(--law-surface-2)" }
                }
              >
                <bdi dir="ltr">{i + 1}</bdi>
              </button>
            ))}
          </div>
          <h2 className="mb-2 font-bold">{PHASES[phase - 1]}</h2>
          <Textarea
            value={p.text}
            onChange={(e) => setP({ text: e.target.value })}
            style={{ minHeight: "14rem" }}
          />
          {phase === 3 && (
            <div className="mt-3">
              <ArticlePicker
                value={p.citedIds || []}
                onChange={(citedIds) => setP({ citedIds })}
              />
            </div>
          )}
          <p className="law-muted mt-2 text-xs">
            {saved ? tr("محفوظ") : tr("جارٍ الحفظ…")}
          </p>
          <div
            className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex gap-2 p-3 shadow-lg lg:static lg:mt-4 lg:p-0 lg:shadow-none"
            style={{ background: "var(--law-surface)" }}
          >
            {phase < 5 && (
              <Button variant="secondary" onClick={() => setPhase(phase + 1)}>
                {tr("المرحلة التالية")}
              </Button>
            )}
            {confirm ? (
              <Button className="flex-1" onClick={submit}>
                {tr("تأكيد التسليم (لا يمكن التعديل بعده)")}
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => setConfirm(true)}>
                {tr("تسليم للتصحيح")}
              </Button>
            )}
          </div>
        </>
      ) : a.status === "critiqued" ? (
        <Critique attempt={a} onCardAccepted={load} />
      ) : (
        <Notice
          tone={
            a.critiqueJob?.status === "failed" ||
            a.critiqueJob?.status === "paused_budget"
              ? "warn"
              : "muted"
          }
        >
          {a.critiqueJob?.status === "paused_budget"
            ? tr(
                "التصحيح متوقف مؤقتاً: المساعد القانوني الذكي غير متاح الآن. محاولتك محفوظة."
              )
            : a.critiqueJob?.status === "failed"
              ? tr("تعذر التصحيح: {0}", [a.critiqueJob.error || ""])
              : tr("سُلّمت المحاولة. جارٍ التصحيح…")}
        </Notice>
      )}
    </div>
  );
}
