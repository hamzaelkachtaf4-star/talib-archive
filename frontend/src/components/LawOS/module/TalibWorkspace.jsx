import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Check,
  Compass,
  FileText,
  Flag,
  Info,
  Microphone,
  PencilSimple,
  Plus,
  Scales,
  SlidersHorizontal,
  Sparkle,
  TreeStructure,
} from "@phosphor-icons/react";
import Law from "@/models/law";
import Button3D from "@/components/LawOS/kit/Button3D";
import Chip from "@/components/LawOS/kit/Chip";
import { Notice, Textarea } from "@/components/LawOS/ui";
import { lang, tr } from "@/components/LawOS/lib/i18n";
import { FORMATS, ordered } from "@/components/LawOS/Today/formats";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import SourceMixGrid from "./SourceMixGrid";
import { branchesOf, refsOf, shortTitle, unitsOf, withRoots } from "./angles";
import { childrenMap } from "./treeModel";
import {
  BriefBlock,
  DetailedBlock,
  FlipCards,
  FullBlock,
  QaList,
  TableBlock,
  TreeBlock,
} from "./blocks";
import FullCourseTree from "./FullCourseTree";
import ModuleBottomChat from "./ModuleBottomChat";

const DEFAULT_FORMATS = ["tree", "detailed"];
const edge = (c) => `color-mix(in srgb, ${c} 55%, black)`;

/** The vertical rail of sessions: numbered 3D circles, a tick when understood, the active one in gold. */
function Rail({ units, activeId, onPick, onNew }) {
  return (
    <nav
      aria-label={tr("الحصص")}
      className="flex shrink-0 gap-3 overflow-x-auto pb-2 sm:w-44 sm:flex-col sm:items-center sm:gap-0 sm:overflow-visible sm:pb-0"
    >
      {units.map((u, i) => {
        const done = Boolean(u.doneAt || u.done);
        const active = u.id === activeId;
        const bg = done
          ? "var(--law-accent)"
          : active
          ? "var(--law-gold)"
          : "var(--law-surface-2)";
        const fg = done
          ? "var(--law-on-accent)"
          : active
          ? "var(--law-bg)"
          : "var(--law-muted)";
        const e = done
          ? edge("var(--law-accent)")
          : active
          ? edge("var(--law-gold)")
          : "var(--law-border)";
        return (
          <div key={u.id} className="flex shrink-0 flex-col items-center sm:w-full">
            {i > 0 && (
              <span
                aria-hidden="true"
                className="hidden h-5 w-0.5 sm:block"
                style={{ background: "var(--law-border)" }}
              />
            )}
            <button
              type="button"
              onClick={() => onPick(u.id)}
              aria-current={active ? "step" : undefined}
              aria-label={`${i + 1}. ${u.title}${done ? ` (${tr("منجز")})` : ""}`}
              title={u.title}
              className="flex items-center justify-center rounded-full text-xl font-bold"
              style={{
                inlineSize: 62,
                blockSize: 58,
                background: bg,
                color: fg,
                boxShadow: `0 6px 0 ${e}${
                  active
                    ? ", 0 0 0 6px color-mix(in srgb, var(--law-gold) 28%, transparent)"
                    : ""
                }`,
                transition: "transform 120ms, box-shadow 120ms",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {done ? (
                <Check size={26} weight="bold" aria-hidden="true" />
              ) : (
                <bdi dir="ltr">{i + 1}</bdi>
              )}
            </button>
            <span
              className="mt-1.5 line-clamp-2 w-24 text-center text-[11.5px] font-semibold leading-4"
              style={{ color: active ? "var(--law-text)" : "var(--law-muted)" }}
            >
              <bdi>{shortTitle(u.title)}</bdi>
            </span>
          </div>
        );
      })}
      <div className="flex shrink-0 flex-col items-center sm:mt-3 sm:w-full">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-xl border-2 border-dashed px-3 text-xs font-bold"
          style={{ borderColor: "var(--law-border)", color: "var(--law-muted)" }}
        >
          <Plus size={14} aria-hidden="true" />
          {tr("حصة جديدة")}
        </button>
      </div>
    </nav>
  );
}

/**
 * First-Time Session Onboarding: Friendly prompt asking what materials the student has
 * to co-construct the session content.
 */
function SessionOnboardingPrompt({ unit, onAdd, onOpen, onStartBuild }) {
  return (
    <section
      className="grid gap-3.5 rounded-2xl border-2 border-dashed p-4 sm:p-5"
      style={{
        borderColor: "var(--law-accent)",
        background: "color-mix(in srgb, var(--law-surface) 90%, var(--law-accent))",
      }}
      aria-label={tr("شنو عندك فهاد الحصة؟")}
    >
      <div>
        <h3 className="text-base font-bold leading-6">
          {tr("شنو عندك فهاد الحصة؟")}
        </h3>
        <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--law-muted)" }}>
          {tr("اختر المصدر المتوفر عندك باش نبنيو محتوى الحصة وتصميمها معاً:")}
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {/* Photos */}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-start gap-3 rounded-xl border p-3 text-start transition-all hover:shadow-sm"
          style={{ background: "var(--law-surface)", borderColor: "var(--law-border)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--law-surface-2)", color: "var(--law-primary)" }}
          >
            <Camera size={20} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-xs font-bold leading-5">
              {tr("تصاور الدفتر أو السبورة")}
            </strong>
            <span className="block text-[11px] leading-4" style={{ color: "var(--law-muted)" }}>
              {tr("صوّر صفحات الحصة بالهاتف وسيرتبها المساعد")}
            </span>
          </div>
        </button>

        {/* Text / PDF */}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-start gap-3 rounded-xl border p-3 text-start transition-all hover:shadow-sm"
          style={{ background: "var(--law-surface)", borderColor: "var(--law-border)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--law-surface-2)", color: "var(--law-primary)" }}
          >
            <FileText size={20} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-xs font-bold leading-5">
              {tr("مطبوع الأستاذ أو نص الحصة")}
            </strong>
            <span className="block text-[11px] leading-4" style={{ color: "var(--law-muted)" }}>
              {tr("الصق النص أو ارفع ملف PDF لتفريغ المحاور")}
            </span>
          </div>
        </button>

        {/* Audio recording */}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-start gap-3 rounded-xl border p-3 text-start transition-all hover:shadow-sm"
          style={{ background: "var(--law-surface)", borderColor: "var(--law-border)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--law-surface-2)", color: "var(--law-primary)" }}
          >
            <Microphone size={20} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-xs font-bold leading-5">
              {tr("تسجيل صوتي للحصة")}
            </strong>
            <span className="block text-[11px] leading-4" style={{ color: "var(--law-muted)" }}>
              {tr("سجل صوتياً أو ارفع تسجيلاً لتلخيصه")}
            </span>
          </div>
        </button>

        {/* AI Co-pilot */}
        <button
          type="button"
          onClick={onStartBuild}
          className="flex items-start gap-3 rounded-xl border p-3 text-start transition-all hover:shadow-sm"
          style={{ background: "var(--law-surface)", borderColor: "var(--law-border)" }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--law-surface-2)", color: "var(--law-accent)" }}
          >
            <Sparkle size={20} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <strong className="block text-xs font-bold leading-5">
              {tr("ابنِ الخطة مع المساعد")}
            </strong>
            <span className="block text-[11px] leading-4" style={{ color: "var(--law-muted)" }}>
              {tr("يقترح المساعد تقسيم الحصة وعناصرها القانونية")}
            </span>
          </div>
        </button>
      </div>

      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => onOpen(unit)}
          className="inline-flex items-center gap-1.5 text-xs font-bold"
          style={{ color: "var(--law-primary)" }}
        >
          <PencilSimple size={14} aria-hidden="true" />
          <span>{tr("أو اكتب الملاحظات بيدك مباشرة")}</span>
        </button>
      </div>
    </section>
  );
}

/**
 * TalibWorkspace: The unified learning environment for a subject.
 * Dual views: Duolingo-style session rail & Full curriculum tree (A to Z).
 * Includes first-time prompt, integrated bottom chat, and source mix grid.
 */
export default function TalibWorkspace({
  moduleId,
  nodes,
  profile,
  tree,
  onOpen,
  onAdd,
  onChanged,
}) {
  const me = useLawUser();
  const [workspaceView, setWorkspaceView] = useState("stepper"); // "stepper" | "tree"
  const [showMix, setShowMix] = useState(false);
  const [mixNow, setMixNow] = useState(undefined);
  const rooted = useMemo(() => withRoots(nodes), [nodes]);
  const units = useMemo(() => unitsOf(nodes), [nodes]);

  const storeKey = `lawos_unit_${moduleId}`;
  const [unitId, setUnitId] = useState(() => {
    try {
      return localStorage.getItem(storeKey);
    } catch {
      return null;
    }
  });

  const unit =
    units.find((u) => u.id === unitId) ||
    units.find((u) => !u.done && !u.doneAt) ||
    units[0] ||
    null;

  useEffect(() => {
    try {
      if (unit) localStorage.setItem(storeKey, unit.id);
    } catch {}
  }, [unit?.id]);

  const [say, setSay] = useState(null); // { text, busy, answer, error }
  const [report, setReport] = useState(null); // { note, sent }
  const [notice, setNotice] = useState(null);
  const [seedChat, setSeedChat] = useState(null);

  const formats = ordered(
    profile?.formats?.length ? profile.formats : DEFAULT_FORMATS
  );
  const info = FORMATS();
  const labelOf = (k) => info.find((f) => f[0] === k);
  const branches = useMemo(
    () => (unit ? branchesOf(nodes, unit.id) : []),
    [nodes, unit?.id]
  );
  const kids = useMemo(() => childrenMap(rooted), [rooted]);
  const subtreeText = useMemo(() => {
    if (!unit) return "";
    const walk = (n) =>
      `${n.title} ${n.body || ""} ${(kids.get(n.id) || []).map(walk).join(" ")}`;
    return walk(unit);
  }, [unit, kids]);

  const refs = unit ? refsOf(subtreeText, 2) : [];
  const idx = unit ? units.findIndex((u) => u.id === unit.id) : -1;
  const next = idx >= 0 ? units[idx + 1] : null;

  useEffect(() => {
    setSay(null);
    setReport(null);
    setNotice(null);
  }, [unit?.id]);

  async function markDone(u, done = true) {
    const r = await tree.edit(u.id, { done });
    if (!r.ok) {
      setNotice(r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر الحفظ."));
      return false;
    }
    onChanged?.();
    return true;
  }

  async function newSession() {
    const t = window.prompt(tr("عنوان الحصة"));
    if (!t || !t.trim()) return;
    const r = await tree.add({ title: t.trim() });
    if (r.ok) {
      setUnitId(r.data.node.id);
      onOpen(r.data.node);
    }
  }

  async function understood(e) {
    e.preventDefault();
    const text = say.text.trim();
    if (!text || say.busy) return;
    setSay((s) => s && { ...s, busy: true, error: null });
    const question = tr(
      "شنو فهمت من «{0}»؟ هذا ما فهمته: {1}. صحّح لي وبيّن ما فاتني بحسب نص الحصة.",
      [unit.title.slice(0, 80), text]
    ).slice(0, 1000);
    const r = await Law.moduleMentor(moduleId, {
      mode: "qa",
      question,
      locale: lang(),
    });
    if (!r.ok) {
      const code = r.data?.error?.code;
      return setSay(
        (s) =>
          s && {
            ...s,
            busy: false,
            error:
              code === "AI_QUOTA_EXCEEDED"
                ? tr("استنفدت حصتك اليومية من الأسئلة. تتجدد غداً.")
                : r.offline
                ? tr("يحتاج اتصالا بالخادم.")
                : tr("المرشد غير متاح الآن. أعد المحاولة لاحقاً."),
          }
      );
    }
    setSay((s) => s && { ...s, busy: false, answer: r.data });
  }

  async function sendReport(e) {
    e.preventDefault();
    if (report.busy) return;
    setReport((x) => x && { ...x, busy: true });
    const r = await Law.moduleNodeReport(moduleId, unit.id, {
      note: report.note,
    });
    setReport(
      (x) =>
        x && {
          ...x,
          sent: r.ok,
          error: r.ok
            ? null
            : r.data?.error?.code === "too_many_reports"
            ? tr("وصلتنا بلاغاتك. شكراً.")
            : tr("تعذر إرسال البلاغ."),
          busy: false,
        }
    );
  }

  if (!unit && units.length === 0) return null;

  const hasText = branches.length > 0 || (unit && Boolean(unit.body));
  const doneCount = units.filter((u) => u.done || u.doneAt).length;
  const first = (me?.fullName || "").trim().split(/\s+/)[0];

  const triggerChatBuild = () => {
    setSeedChat({
      mode: "build",
      question: tr(
        "ساعدني في تنظيم عناصر وخطة الحصة «{0}» واقتراح محاورها من مصادري.",
        [unit?.title || ""]
      ),
      nonce: Date.now(),
    });
    const chatEl = document.getElementById("bottom-chat-input");
    if (chatEl) {
      chatEl.scrollIntoView({ behavior: "smooth" });
      chatEl.focus();
    }
  };

  return (
    <div className="grid gap-5">
      {/* Top Greeting & View Switcher Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
        style={{ borderColor: "var(--law-border)" }}
        aria-label={tr("فضاء التعلم")}
      >
        <div className="min-w-0">
          <p className="text-base font-bold leading-6">
            {first ? tr("أهلاً {0}", [first]) : tr("أهلاً بك")}
          </p>
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>
            {doneCount === units.length
              ? tr("أنهيت كل حصص هذه المادة.")
              : tr("أنجزت {0} من {1} حصص.", [doneCount, units.length])}
          </p>
        </div>

        {/* View Mode Switcher: Duolingo Rail vs Full Curriculum Tree (A to Z) */}
        <div
          role="group"
          aria-label={tr("طريقة العرض")}
          className="flex flex-wrap items-center gap-2"
        >
          <Chip
            active={workspaceView === "stepper"}
            onClick={() => setWorkspaceView("stepper")}
          >
            <Compass size={14} aria-hidden="true" />
            <span>{tr("مسار الحصص")}</span>
          </Chip>
          <Chip
            active={workspaceView === "tree"}
            onClick={() => setWorkspaceView("tree")}
          >
            <TreeStructure size={14} aria-hidden="true" />
            <span>{tr("شجرة المادة (من أ إلى ز)")}</span>
          </Chip>
          <Button3D
            variant="neutral"
            onClick={() => setShowMix((v) => !v)}
            aria-expanded={showMix}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>{tr("مصادر المادة")}</span>
          </Button3D>
          <Button3D onClick={onAdd}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            <span>{tr("إضافة محتوى")}</span>
          </Button3D>
        </div>
      </div>

      {/* Sources Allocation Grid */}
      {showMix && (
        <div className="law-card p-4 sm:p-5">
          <SourceMixGrid
            moduleId={moduleId}
            initial={mixNow !== undefined ? mixNow : profile?.sourceMix}
            onSaved={setMixNow}
          />
        </div>
      )}

      {/* VIEW 1: Full Curriculum Tree (من أ حتى لـ ز) */}
      {workspaceView === "tree" && (
        <FullCourseTree
          nodes={nodes}
          onOpen={onOpen}
          onSelectUnit={(selectedId) => {
            setUnitId(selectedId);
            setWorkspaceView("stepper");
          }}
        />
      )}

      {/* VIEW 2: Duolingo Stepper & Active Session Workspace */}
      {workspaceView === "stepper" && unit && (
        <section
          className="law-card flex flex-col gap-5 p-4 sm:flex-row sm:p-5"
          aria-label={tr("فضاء المادة")}
        >
          {/* Vertical Stepper Rail */}
          <Rail
            units={units}
            activeId={unit.id}
            onPick={setUnitId}
            onNew={newSession}
          />

          {/* Active Session Content */}
          <article className="min-w-0 flex-1 grid content-start gap-5">
            <header>
              <p
                className="text-xs font-bold"
                style={{ color: "var(--law-accent)" }}
              >
                {tr("الحصة {0} من {1}", [idx + 1, units.length])}
              </p>
              <h2 className="mt-0.5 text-[1.375rem] font-bold leading-9">
                <bdi>{unit.title}</bdi>
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {refs.length > 0 && (
                  <span
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      background: "var(--law-surface-2)",
                      color: "var(--law-gold-ink)",
                    }}
                  >
                    <Scales size={14} aria-hidden="true" />
                    <bdi dir="auto">{refs.join(" · ")}</bdi>
                  </span>
                )}
                <span
                  title={
                    unit.aiDraft
                      ? tr("صاغه المساعد من مصادرك.")
                      : tr("ملاحظاتك الخاصة.")
                  }
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: "var(--law-surface-2)",
                    color: unit.aiDraft
                      ? "var(--law-accent)"
                      : "var(--law-gold-ink)",
                  }}
                >
                  {unit.aiDraft ? (
                    <Sparkle size={14} aria-hidden="true" />
                  ) : (
                    <Info size={14} aria-hidden="true" />
                  )}
                  {unit.aiDraft ? tr("صاغه المساعد") : tr("محتوى للمراجعة")}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(unit)}
                  className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border-2 px-3 text-xs font-bold"
                  style={{ borderColor: "var(--law-border)" }}
                >
                  <PencilSimple size={14} aria-hidden="true" />
                  {tr("عدّل بيدك")}
                </button>
              </div>
            </header>

            {/* First-time prompt when session is empty */}
            {!hasText && (
              <SessionOnboardingPrompt
                unit={unit}
                onAdd={onAdd}
                onOpen={onOpen}
                onStartBuild={triggerChatBuild}
              />
            )}

            {/* Session content in selected formats */}
            {hasText &&
              formats.map((k) => {
                const f = labelOf(k);
                if (!f) return null;
                const Icon = f[4];
                return (
                  <section key={k} className="grid gap-3" aria-label={f[1]}>
                    {formats.length > 1 && (
                      <div className="flex items-center gap-2 pt-1">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{
                            background: "var(--law-surface-2)",
                            color: "var(--law-accent)",
                          }}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <h3 className="text-sm font-bold">{f[1]}</h3>
                        <span
                          aria-hidden="true"
                          className="h-px flex-1"
                          style={{ background: "var(--law-border)" }}
                        />
                      </div>
                    )}
                    {k === "tree" && (
                      <TreeBlock
                        unit={unit}
                        branches={branches}
                        onOpen={onOpen}
                        onViewFullTree={() => setWorkspaceView("tree")}
                      />
                    )}
                    {k === "table" && (
                      <TableBlock branches={branches} onOpen={onOpen} />
                    )}
                    {k === "full" && (
                      <FullBlock unit={unit} branches={branches} />
                    )}
                    {k === "brief" && <BriefBlock branches={branches} />}
                    {k === "detailed" && (
                      <DetailedBlock unit={unit} branches={branches} />
                    )}
                    {k === "cards" && <FlipCards branches={branches} />}
                    {k === "qa" && <QaList branches={branches} />}
                  </section>
                );
              })}

            {notice && <Notice tone="muted">{notice}</Notice>}

            {/* "شنو فهمت؟" formative check */}
            {say && (
              <form
                onSubmit={understood}
                className="grid gap-2 rounded-2xl border-2 p-4"
                style={{ borderColor: "var(--law-border)" }}
                aria-label={tr("شنو فهمت؟")}
              >
                <label className="text-sm font-bold" htmlFor="say-box">
                  {tr(
                    "اكتب بكلماتك ما فهمته من هذه الحصة، ثم يصحّحه المرشد."
                  )}
                </label>
                <Textarea
                  id="say-box"
                  rows={4}
                  maxLength={700}
                  value={say.text}
                  onChange={(e) =>
                    setSay((s) => ({ ...s, text: e.target.value }))
                  }
                  dir="auto"
                />
                {say.error && <Notice tone="warn">{say.error}</Notice>}
                {say.answer && (
                  <div
                    className="rounded-xl p-3 text-sm leading-8"
                    style={{ background: "var(--law-surface-2)" }}
                  >
                    <p dir="auto" className="whitespace-pre-wrap">
                      {say.answer.answer}
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--law-muted)" }}
                    >
                      {tr("صياغة الذكاء الاصطناعي من مصادرك")}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button3D
                    type="submit"
                    disabled={say.busy || !say.text.trim()}
                  >
                    {say.busy ? tr("جارٍ التفكير…") : tr("صحّح فهمي")}
                  </Button3D>
                  <Button3D variant="neutral" onClick={() => setSay(null)}>
                    {tr("إغلاق")}
                  </Button3D>
                </div>
              </form>
            )}

            {/* Clean Completion Controls (Quiz removed) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--law-border)" }}>
              <div className="flex flex-wrap items-center gap-2">
                {unit.done || unit.doneAt ? (
                  <>
                    <Button3D
                      onClick={() => next && setUnitId(next.id)}
                      variant={next ? undefined : "neutral"}
                    >
                      {next ? (
                        <>
                          <span>{tr("الحصة التالية:")}</span>{" "}
                          <bdi>{shortTitle(next.title, 16)}</bdi>
                        </>
                      ) : (
                        tr("أكملت كل حصص المادة")
                      )}
                    </Button3D>
                    <button
                      type="button"
                      onClick={() => markDone(unit, false)}
                      className="text-xs font-bold"
                      style={{ color: "var(--law-muted)" }}
                    >
                      {tr("إلغاء الإنجاز")}
                    </button>
                  </>
                ) : (
                  <Button3D onClick={() => markDone(unit, true)}>
                    <Check size={18} weight="bold" aria-hidden="true" />
                    <span>{tr("إتمام هذه الحصة")}</span>
                  </Button3D>
                )}
                <Button3D
                  variant="neutral"
                  onClick={() => setSay({ text: "", busy: false })}
                >
                  {tr("«شنو فهمت؟»")}
                </Button3D>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to="/law/exam"
                  className="text-xs font-bold underline"
                  style={{ color: "var(--law-primary)" }}
                >
                  {tr("مركز الامتحانات")}
                </Link>
                <button
                  type="button"
                  onClick={() => setReport({ note: "" })}
                  className="inline-flex items-center gap-1 text-xs font-bold"
                  style={{ color: "var(--law-muted)" }}
                >
                  <Flag size={14} aria-hidden="true" />
                  <span>{tr("بلّغ عن خطأ")}</span>
                </button>
              </div>
            </div>

            {report && (
              <form
                onSubmit={sendReport}
                className="grid gap-2 rounded-2xl border-2 p-4"
                style={{ borderColor: "var(--law-border)" }}
                aria-label={tr("بلّغ عن خطأ")}
              >
                {report.sent ? (
                  <p className="text-sm font-bold" style={{ color: "var(--law-ok)" }}>
                    {tr("شكراً، سُجّل بلاغك.")}
                  </p>
                ) : (
                  <>
                    <Textarea
                      rows={3}
                      maxLength={500}
                      value={report.note}
                      onChange={(e) =>
                        setReport((x) => ({ ...x, note: e.target.value }))
                      }
                      dir="auto"
                      aria-label={tr("ما الخطأ في هذه الحصة؟")}
                      placeholder={tr("ما الخطأ في هذه الحصة؟")}
                    />
                    {report.error && <Notice tone="warn">{report.error}</Notice>}
                    <div className="flex gap-2">
                      <Button3D
                        type="submit"
                        disabled={!report.note.trim() || report.busy}
                      >
                        {tr("إرسال البلاغ")}
                      </Button3D>
                      <Button3D
                        variant="neutral"
                        onClick={() => setReport(null)}
                      >
                        {tr("إغلاق")}
                      </Button3D>
                    </div>
                  </>
                )}
              </form>
            )}
          </article>
        </section>
      )}

      {/* Integrated Bottom Chat Section */}
      <ModuleBottomChat
        moduleId={moduleId}
        tree={tree}
        onChanged={onChanged}
        activeSessionTitle={unit?.title}
        seedPrompt={seedChat}
      />
    </div>
  );
}
