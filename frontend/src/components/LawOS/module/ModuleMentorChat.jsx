import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import DiffViewer from "@/components/LawOS/hub/DiffViewer";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { lang, tr } from "@/components/LawOS/lib/i18n";
import { paragraphDiff } from "./treeModel";

/** One proposal of the mentor as a diff the student accepts or rejects. Nothing is applied before that. */
export function Proposal({ p, onDecide }) {
  const blocks = p.op === "edit" ? paragraphDiff(p.baseBody, p.body) : paragraphDiff("", p.body);
  return (
    <li className="law-card grid gap-2 p-3">
      <p className="flex flex-wrap items-center gap-2 font-bold">
        <Chip>{p.op === "edit" ? tr("تعديل") : tr("إضافة")}</Chip>
        <bdi>{p.title}</bdi>
        <Chip>{tr("صياغة الذكاء الاصطناعي")}</Chip>
      </p>
      <DiffViewer blocks={blocks} />
      <div className="flex gap-2">
        <Button3D onClick={() => onDecide(p, "accept")}>{tr("قبول")}</Button3D>
        <Button3D variant="neutral" onClick={() => onDecide(p, "reject")}>{tr("رفض")}</Button3D>
      </div>
    </li>
  );
}

/**
 * Mentor scoped to this module: it only reads the module's own notes and sources. "Q&A" answers questions; "build" proposes
 * changes to the notes as diffs. Drills and grading live in the Exam Center, not here.
 */
export default function ModuleMentorChat({ moduleId, tree, onChanged, seed }) {
  const [mode, setMode] = useState("qa");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]); // { q, a }
  const [proposals, setProposals] = useState([]);
  const [msg, setMsg] = useState(null);
  const [offered, setOffered] = useState({}); // turn index -> "saved" | "dismissed"

  // A quick action from outside (summarise, co-build the plan) pre-fills the box and the mode; the student still presses send.
  useEffect(() => { if (seed) { setMode(seed.mode); setQ(seed.question); } }, [seed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  async function keepNote(i, text) {
    const r = await Law.moduleMemoryAdd(moduleId, { content: text, scope: "module", source: "mentor" });
    setOffered((o) => ({ ...o, [i]: r.ok || r.data?.error === "duplicate_note" ? "saved" : "failed" }));
  }

  const loadProposals = useCallback(async () => {
    const r = await Law.moduleProposals(moduleId, "pending");
    if (r.ok) setProposals(r.data.proposals);
  }, [moduleId]);
  useEffect(() => { loadProposals(); }, [loadProposals]);

  async function send(e) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await Law.moduleMentor(moduleId, { mode, question, locale: lang() });
    setBusy(false);
    if (!r.ok) {
      const code = r.data?.error?.code;
      return setMsg(code === "AI_QUOTA_EXCEEDED" ? tr("استنفدت حصتك اليومية من الأسئلة. تتجدد غداً.") : code === "too_many_pending" ? tr("لديك اقتراحات كثيرة غير محسومة. اقبل بعضها أو ارفضه أولاً.") : r.offline ? tr("يلزم الاتصال.") : tr("المرشد غير متاح الآن. أعد المحاولة لاحقاً."));
    }
    setQ("");
    if (mode === "qa") setTurns((t) => [...t, { q: question, a: r.data }]);
    else {
      if (!r.data.proposals.length) setMsg(r.data.answer || tr("لم يجد المرشد في مصادرك ما يكفي لاقتراح تعديلات."));
      await loadProposals();
    }
  }

  async function decide(p, verb) {
    const r = verb === "accept" ? await Law.moduleProposalAccept(moduleId, p.id) : await Law.moduleProposalReject(moduleId, p.id);
    if (!r.ok) {
      const code = r.data?.error?.code;
      setMsg(code === "stale" ? tr("تغيّرت هذه العقدة بعد الاقتراح. رُفض الاقتراح حتى لا يُلغي تعديلك.") : code === "node_missing" ? tr("العقدة المعنية لم تعد موجودة.") : tr("تعذر تنفيذ العملية."));
      if (code === "stale" || code === "node_missing") await Law.moduleProposalReject(moduleId, p.id);
    } else if (verb === "accept") {
      await tree.reload();
      onChanged?.();
    }
    await loadProposals();
  }

  return (
    <section className="grid gap-4" aria-label={tr("المرشد")}>
      <div role="group" aria-label={tr("الوضع")} className="flex flex-wrap gap-2">
        <Chip active={mode === "qa"} onClick={() => setMode("qa")}>{tr("طرح سؤال أو استشارة منهجية")}</Chip>
        <Chip active={mode === "build"} onClick={() => setMode("build")}>{tr("متابعة بناء وتلخيص الدرس")}</Chip>
      </div>
      <Notice tone="muted">{tr("المرشد يقرأ ملاحظات هذه المادة ومصادرها فقط. للتمارين والتصحيح انتقل إلى")} <Link to="/law/exam" className="font-bold underline">{tr("مركز الامتحانات")}</Link>.</Notice>
      {msg && <Notice tone="warn">{msg}</Notice>}

      {turns.map((t, i) => (
        <div key={i} className="grid gap-2">
          <p className="law-card p-3 font-semibold" dir="auto">{t.q}</p>
          <div className="law-card grid gap-2 p-3">
            <p dir="auto" className="whitespace-pre-wrap leading-8">{t.a.answer}</p>
            {t.a.aiGenerated && <Chip>{tr("صياغة الذكاء الاصطناعي من مصادرك")}</Chip>}
            {t.a.refs?.length > 0 && <p className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--law-muted)" }}>{tr("المصادر:")} {t.a.refs.map((r) => <Chip key={r.label}><bdi>{r.title}</bdi></Chip>)}</p>}
            {t.a.unverifiedCitations?.length > 0 && <Notice tone="warn">{tr("حُذفت إحالات قانونية لا يمكن التحقق منها في مصادرك.")}</Notice>}
            {t.a.memorySuggestion && !offered[i] && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl p-2.5 text-sm" style={{ background: "var(--law-surface-2)" }}>
                <span className="min-w-0 flex-1">{tr("هل أتذكّر هذا عنك؟")} <strong><bdi>{t.a.memorySuggestion}</bdi></strong></span>
                <Button3D onClick={() => keepNote(i, t.a.memorySuggestion)}>{tr("احتفظ بها")}</Button3D>
                <Button3D variant="neutral" onClick={() => setOffered((o) => ({ ...o, [i]: "dismissed" }))}>{tr("لا")}</Button3D>
              </div>
            )}
            {offered[i] === "saved" && <p className="text-xs font-bold" style={{ color: "var(--law-ok)" }}>{tr("حُفظت الملاحظة في ذاكرة المساعد.")}</p>}
          </div>
        </div>
      ))}

      {mode === "build" && proposals.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-bold">{tr("اقتراحات بانتظار قرارك")}</h3>
          <ul className="grid gap-3">{proposals.map((p) => <Proposal key={p.id} p={p} onDecide={decide} />)}</ul>
        </div>
      )}

      <form onSubmit={send} className="grid gap-2">
        <Textarea rows={3} maxLength={1000} value={q} onChange={(e) => setQ(e.target.value)} dir="auto" aria-label={mode === "qa" ? tr("اسأل عن هذه المادة") : tr("ماذا تريد أن يبني المرشد؟")} placeholder={mode === "qa" ? tr("اسأل عن هذه المادة") : tr("ماذا تريد أن يبني المرشد؟")} />
        <div><Button3D type="submit" disabled={busy || !q.trim()}>{busy ? tr("جارٍ التفكير…") : mode === "qa" ? tr("اسأل") : tr("اقترح")}</Button3D></div>
      </form>
    </section>
  );
}
