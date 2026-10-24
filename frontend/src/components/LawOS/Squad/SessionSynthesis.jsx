import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MagicWand, Trash, LockSimple } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

const KINDS = {
  transcript: tr("تفريغ صوتي"),
  board_ocr: tr("صورة السبورة"),
  text: tr("نص مرجعي"),
};

const ERRORS = {
  need_two_sources: tr("يلزم مصدران على الأقل (من عضو أو أكثر)."),
  too_many_sources: tr("5 مصادر كحد أقصى لكل عضو في الحصة."),
  ai_budget_reached: tr("بلغ استهلاك الذكاء الاصطناعي حدّه الشهري."),
  ai_unavailable: tr("الذكاء الاصطناعي غير مفعّل على الخادم."),
  ai_failed: tr("تعذّر التجميع. أعد المحاولة."),
  too_many_attempts: tr("محاولات كثيرة. انتظر بضع دقائق."),
};
const err = (r) => (r.offline ? tr("لا يوجد اتصال بالخادم.") : ERRORS[r.data?.error] || tr("حدث خطأ. أعد المحاولة."));

/**
 * التجميع الذكي: each member drops their own raw input for a session (kept private to them); the AI merges
 * all of them into one structured draft that opens in the note editor. Nothing is saved until a member saves.
 */
export default function SessionSynthesis({ workspaceId, defaultSession = 1 }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(defaultSession);
  const [sources, setSources] = useState(null);
  const [form, setForm] = useState({ kind: "transcript", label: "", content: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    Law.sessionSources(workspaceId, session).then((r) => (r.ok ? setSources(r.data.sources) : setMsg(err(r))));
  useEffect(() => {
    if (session >= 1) load();
  }, [workspaceId, session]);

  async function add(e) {
    e.preventDefault();
    setMsg(null);
    const r = await Law.addSessionSource(workspaceId, session, form);
    if (!r.ok) return setMsg(err(r));
    setForm((f) => ({ ...f, label: "", content: "" }));
    load();
  }

  async function synthesize() {
    setBusy(true);
    setMsg(null);
    const r = await Law.synthesizeSession(workspaceId, session);
    setBusy(false);
    if (!r.ok) return setMsg(err(r));
    navigate(`/law/squad/w/${workspaceId}/new`, { state: { draft: r.data.draft } });
  }

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <MagicWand size={20} style={{ color: "var(--law-accent)" }} /> {tr("التجميع الذكي لمصادر المحاضرة")}
      </h2>
      <p className="mb-3 flex items-start gap-1 text-xs leading-6" style={{ color: "var(--law-muted)" }}>
        <LockSimple size={14} className="mt-1 shrink-0" />
        {tr("كل عضو يضيف مصدره (تفريغه، صورة السبورة، نصاً). مصدرك يبقى خاصاً بك: لا يرى زملاؤك إلا نوعه وحجمه، ويُرسل إلى الذكاء الاصطناعي لصياغة المسودة فقط.")}
      </p>
      <Field label={tr("رقم الحصة")}>
        <Input type="number" dir="ltr" min={1} max={200} value={session} onChange={(e) => setSession(Number(e.target.value) || 1)} />
      </Field>
      <ul className="my-3 flex flex-col text-sm">
        {(sources || []).map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--law-border)" }}>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{KINDS[s.kind] || s.kind}</span> · <bdi>{s.label}</bdi>
              <span className="text-xs" style={{ color: "var(--law-muted)" }}>
                {" "}
                · <bdi>{s.mine ? tr("أنت") : s.author}</bdi> · <bdi dir="ltr">{s.chars}</bdi> {tr("حرف")}
              </span>
            </span>
            {s.mine && (
              <button
                type="button"
                aria-label={tr("حذف")}
                className="p-1"
                style={{ color: "var(--law-muted)" }}
                onClick={async () => {
                  await Law.deleteSessionSource(s.id);
                  load();
                }}
              >
                <Trash size={16} />
              </button>
            )}
          </li>
        ))}
        {sources && !sources.length && <p className="law-muted text-sm">{tr("لا مصادر لهذه الحصة بعد.")}</p>}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} options={Object.entries(KINDS)} aria-label={tr("النوع")} />
          <Input value={form.label} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder={tr("وصف قصير")} />
        </div>
        <Textarea rows={4} dir="auto" value={form.content} maxLength={20000} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder={tr("الصق نص مصدرك هنا")} />
        <Button type="submit" variant="secondary" disabled={!form.label.trim() || !form.content.trim()}>
          {tr("إضافة مصدري")}
        </Button>
      </form>
      {msg && <Notice tone="warn">{msg}</Notice>}
      <Button type="button" onClick={synthesize} disabled={busy || (sources?.length || 0) < 2} className="mt-3 flex w-full items-center justify-center gap-2">
        <MagicWand size={18} /> {busy ? tr("جارٍ التجميع…") : tr("صياغة مسودة المحاضرة الجامعة")}
      </Button>
    </Card>
  );
}
