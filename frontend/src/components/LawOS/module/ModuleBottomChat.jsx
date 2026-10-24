import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Brain,
  ChatCircleDots,
  ListChecks,
  PaperPlaneRight,
  Scales,
  Sparkle,
} from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import DiffViewer from "@/components/LawOS/hub/DiffViewer";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { lang, tr } from "@/components/LawOS/lib/i18n";
import { paragraphDiff } from "./treeModel";
import MemoryPanel from "./MemoryPanel";

/** Single diff proposal in build mode. */
function DiffProposal({ p, onDecide }) {
  const blocks =
    p.op === "edit"
      ? paragraphDiff(p.baseBody, p.body)
      : paragraphDiff("", p.body);
  return (
    <li className="law-card grid gap-2 p-3.5">
      <div className="flex flex-wrap items-center gap-2 font-bold">
        <Chip>{p.op === "edit" ? tr("تعديل") : tr("إضافة")}</Chip>
        <span className="text-sm"><bdi>{p.title}</bdi></span>
        <Chip>{tr("صياغة الذكاء الاصطناعي")}</Chip>
      </div>
      <DiffViewer blocks={blocks} />
      <div className="flex gap-2 pt-1">
        <Button3D onClick={() => onDecide(p, "accept")}>{tr("قبول")}</Button3D>
        <Button3D variant="neutral" onClick={() => onDecide(p, "reject")}>
          {tr("رفض")}
        </Button3D>
      </div>
    </li>
  );
}

/**
 * ModuleBottomChat: Embedded inline chat directly at the bottom of the learning workspace.
 * No floating circles, no drawer launchers: a clear, dignified chat box for the module.
 */
export default function ModuleBottomChat({
  moduleId,
  tree,
  onChanged,
  activeSessionTitle = "",
  seedPrompt = null,
}) {
  const [mode, setMode] = useState("qa");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [msg, setMsg] = useState(null);
  const [showMemory, setShowMemory] = useState(false);
  const [savedNotes, setSavedNotes] = useState({});

  useEffect(() => {
    if (seedPrompt) {
      if (seedPrompt.mode) setMode(seedPrompt.mode);
      if (seedPrompt.question) setQ(seedPrompt.question);
    }
  }, [seedPrompt]);

  const loadProposals = useCallback(async () => {
    const r = await Law.moduleProposals(moduleId, "pending");
    if (r.ok) setProposals(r.data.proposals);
  }, [moduleId]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  async function keepNote(i, text) {
    const r = await Law.moduleMemoryAdd(moduleId, {
      content: text,
      scope: "module",
      source: "mentor",
    });
    setSavedNotes((prev) => ({
      ...prev,
      [i]: r.ok || r.data?.error === "duplicate_note" ? "saved" : "failed",
    }));
  }

  async function send(e) {
    if (e) e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await Law.moduleMentor(moduleId, {
      mode,
      question,
      locale: lang(),
    });
    setBusy(false);
    if (!r.ok) {
      const code = r.data?.error?.code;
      return setMsg(
        code === "AI_QUOTA_EXCEEDED"
          ? tr("استنفدت حصتك اليومية من الأسئلة. تتجدد غداً.")
          : code === "too_many_pending"
          ? tr("لديك اقتراحات كثيرة غير محسومة. اقبل بعضها أو ارفضه أولاً.")
          : r.offline
          ? tr("يلزم الاتصال بالخادم.")
          : tr("المرشد غير متاح الآن. أعد المحاولة لاحقاً.")
      );
    }
    setQ("");
    if (mode === "qa") {
      setTurns((prev) => [...prev, { q: question, a: r.data }]);
    } else {
      if (!r.data.proposals || !r.data.proposals.length) {
        setMsg(
          r.data.answer || tr("لم يجد المرشد في مصادرك ما يكفي لاقتراح تعديلات.")
        );
      }
      await loadProposals();
    }
  }

  async function decide(p, verb) {
    const r =
      verb === "accept"
        ? await Law.moduleProposalAccept(moduleId, p.id)
        : await Law.moduleProposalReject(moduleId, p.id);
    if (!r.ok) {
      const code = r.data?.error?.code;
      setMsg(
        code === "stale"
          ? tr("تغيّرت هذه العقدة بعد الاقتراح. رُفض الاقتراح حتى لا يُلغي تعديلك.")
          : code === "node_missing"
          ? tr("العقدة المعنية لم تعد موجودة.")
          : tr("تعذر تنفيذ العملية.")
      );
      if (code === "stale" || code === "node_missing") {
        await Law.moduleProposalReject(moduleId, p.id);
      }
    } else if (verb === "accept") {
      await tree.reload();
      onChanged?.();
    }
    await loadProposals();
  }

  const quickAction = (newMode, text) => {
    setMode(newMode);
    setQ(text);
  };

  return (
    <section
      className="law-card grid gap-4 p-4 sm:p-5"
      aria-label={tr("شات المادة ومساعد الطالب")}
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--law-border)" }}>
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}
          >
            <ChatCircleDots size={20} weight="bold" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold leading-6">{tr("شات المادة")}</h2>
            <p className="text-xs" style={{ color: "var(--law-muted)" }}>
              {tr("يقرأ مصادر وملاحظات هذه المادة وذاكرة تفضيلاتك في التعلم")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={mode === "qa"} onClick={() => setMode("qa")}>
            {tr("سؤال واستشارة")}
          </Chip>
          <Chip active={mode === "build"} onClick={() => setMode("build")}>
            {tr("بناء خطة الدرس")}
          </Chip>
          <button
            type="button"
            onClick={() => setShowMemory((v) => !v)}
            aria-pressed={showMemory}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors"
            style={{
              borderColor: "var(--law-border)",
              background: showMemory ? "var(--law-surface-2)" : "transparent",
              color: showMemory ? "var(--law-primary)" : "var(--law-muted)",
            }}
          >
            <Brain size={14} aria-hidden="true" />
            <span>{tr("ذاكرتي")}</span>
          </button>
        </div>
      </header>

      {/* Memory panel inline toggle */}
      {showMemory && (
        <div
          className="rounded-xl border p-4"
          style={{ background: "var(--law-surface-2)", borderColor: "var(--law-border)" }}
        >
          <MemoryPanel moduleId={moduleId} />
        </div>
      )}

      {/* Quick suggestions pills */}
      <div
        role="group"
        aria-label={tr("اقتراحات سريعة")}
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-xs font-bold" style={{ color: "var(--law-muted)" }}>
          {tr("اقتراحات:")}
        </span>
        {activeSessionTitle && (
          <button
            type="button"
            className="law-chip"
            onClick={() =>
              quickAction(
                "qa",
                tr("لخّص لي الحصة «{0}» في نقاط واضحة وموجزة بحسب المصادر.", [
                  activeSessionTitle.slice(0, 80),
                ])
              )
            }
          >
            <ListChecks size={13} aria-hidden="true" />
            <span>{tr("لخّص هذه الحصة")}</span>
          </button>
        )}
        <button
          type="button"
          className="law-chip"
          onClick={() =>
            quickAction(
              "qa",
              tr(
                "ما هي أهم الفصول والنصوص القانونية المرتبطة بموضوع هذه الحصة؟"
              )
            )
          }
        >
          <Scales size={13} aria-hidden="true" />
          <span>{tr("الفصول القانونية")}</span>
        </button>
        <button
          type="button"
          className="law-chip"
          onClick={() =>
            quickAction(
              "build",
              tr(
                "ساعدني في تنظيم عناصر الدرس واقتراح عناوين فرعية من مصادري."
              )
            )
          }
        >
          <Brain size={13} aria-hidden="true" />
          <span>{tr("ابنِ معي خطة الدرس")}</span>
        </button>
      </div>

      {msg && <Notice tone="warn">{msg}</Notice>}

      {/* Pending Diff Proposals (Build Mode) */}
      {proposals.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-bold" style={{ color: "var(--law-accent)" }}>
            {tr("اقتراحات لتنظيم الدرس بحاجة لموافقتك ({0}):", [proposals.length])}
          </h3>
          <ul className="grid gap-2">
            {proposals.map((p) => (
              <DiffProposal key={p.id} p={p} onDecide={decide} />
            ))}
          </ul>
        </div>
      )}

      {/* Conversation stream */}
      {turns.length > 0 && (
        <div className="grid gap-3" aria-label={tr("محادثات الشات")}>
          {turns.map((t, i) => (
            <div key={i} className="grid gap-2">
              {/* User question */}
              <div
                className="ms-auto max-w-[85%] rounded-2xl p-3 text-sm font-semibold"
                style={{
                  background: "var(--law-surface-2)",
                  border: "1px solid var(--law-border)",
                }}
              >
                <p dir="auto" className="whitespace-pre-wrap leading-6">
                  {t.q}
                </p>
              </div>

              {/* AI response */}
              <div
                className="me-auto max-w-[95%] rounded-2xl border p-4 text-sm sm:max-w-[88%]"
                style={{
                  background: "var(--law-surface)",
                  borderColor: "var(--law-border)",
                }}
              >
                <div className="flex items-center gap-1.5 pb-2 text-xs font-bold" style={{ color: "var(--law-accent)" }}>
                  <Sparkle size={14} aria-hidden="true" />
                  <span>{tr("إجابة الذكاء الاصطناعي بحسب مصادرك:")}</span>
                </div>
                <div
                  dir="auto"
                  className="whitespace-pre-wrap leading-7 text-sm"
                  style={{ color: "var(--law-text)" }}
                >
                  {t.a.answer}
                </div>

                {t.a.legalRefs && t.a.legalRefs.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2" style={{ borderColor: "var(--law-border)" }}>
                    <span className="text-xs font-bold" style={{ color: "var(--law-muted)" }}>
                      {tr("السند القانوني:")}
                    </span>
                    {t.a.legalRefs.map((ref, rIdx) => (
                      <span
                        key={rIdx}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          background: "var(--law-surface-2)",
                          color: "var(--law-gold-ink)",
                        }}
                      >
                        <Scales size={12} aria-hidden="true" />
                        <bdi dir="auto">{ref}</bdi>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 pt-1 text-xs">
                  {savedNotes[i] === "saved" ? (
                    <span className="font-bold" style={{ color: "var(--law-ok)" }}>
                      {tr("حُفظت في ذاكرتك")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => keepNote(i, `${t.q} -> ${t.a.answer.slice(0, 140)}`)}
                      className="font-bold underline hover:opacity-80"
                      style={{ color: "var(--law-muted)" }}
                    >
                      {tr("احفظ خلاصة الجواب في ذاكرتي")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input box */}
      <form onSubmit={send} className="grid gap-2 pt-1">
        <label htmlFor="bottom-chat-input" className="sr-only">
          {tr("اكتب سؤالك في شات المادة")}
        </label>
        <div className="relative">
          <Textarea
            id="bottom-chat-input"
            rows={2}
            maxLength={1000}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            dir="auto"
            placeholder={
              mode === "qa"
                ? tr("اكتب سؤالك، اطلب شرح نقطة، أو نظّم أفكارك مع الذكاء الاصطناعي...")
                : tr("اطلب من المساعد اقتراح تنظيم أو تقسيم محاور الدرس...")
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>
            {tr("للامتحانات والتمارين المنظمة انتقل إلى")} <Link to="/law/exam" className="font-bold underline" style={{ color: "var(--law-primary)" }}>{tr("مركز الامتحانات")}</Link>.
          </p>
          <div className="flex items-center gap-2">
            {turns.length > 0 && (
              <Button3D
                type="button"
                variant="neutral"
                onClick={() => setTurns([])}
              >
                {tr("مسح الشات")}
              </Button3D>
            )}
            <Button3D type="submit" disabled={busy || !q.trim()}>
              <span className="flex items-center gap-1.5">
                <PaperPlaneRight size={16} aria-hidden="true" />
                <span>{busy ? tr("جارٍ التفكير…") : tr("إرسال")}</span>
              </span>
            </Button3D>
          </div>
        </div>
      </form>
    </section>
  );
}
