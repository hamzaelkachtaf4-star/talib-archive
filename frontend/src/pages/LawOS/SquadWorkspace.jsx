import { useEffect, useState } from "react";
import MascotSlot from "@/components/LawOS/kit/MascotSlot";
import { Back } from "@/components/LawOS/kit/DirArrow";
import { Link, useParams } from "react-router-dom";
import { NotePencil, Plus, Cards, Trash } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import { squadError } from "./Squad";
import NoteBadges from "@/components/LawOS/Squad/NoteBadges";
import SessionSynthesis from "@/components/LawOS/Squad/SessionSynthesis";
import { intlLocale, tr } from "@/components/LawOS/lib/i18n";

function SquadDeck({ workspaceId }) {
  const [deck, setDeck] = useState(null);
  const [form, setForm] = useState({ front: "", back: "" });
  const [msg, setMsg] = useState(null);
  const load = () => Law.squadCards(workspaceId).then((r) => (r.ok ? setDeck(r.data) : setMsg({ tone: "warn", text: squadError(r) })));
  useEffect(() => {
    load();
  }, [workspaceId]);

  async function add(e) {
    e.preventDefault();
    const r = await Law.createSquadCard(workspaceId, form);
    if (!r.ok) return setMsg({ tone: "warn", text: squadError(r) });
    setForm({ front: "", back: "" });
    load();
  }

  async function subscribe() {
    const r = await Law.subscribeSquadDeck(workspaceId);
    if (!r.ok) return setMsg({ tone: "warn", text: squadError(r) });
    setMsg({ tone: "ok", text: tr("أضيفت {0} بطاقة إلى مراجعتك. جدول المراجعة خاص بك.", [r.data.created]) });
    load();
  }

  async function remove(id) {
    if (!window.confirm(tr("حذف هذه البطاقة من مجموعة الفرقة؟"))) return;
    const r = await Law.deleteSquadCard(id);
    if (!r.ok) return setMsg({ tone: "warn", text: squadError(r) });
    load();
  }

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <Cards size={20} style={{ color: "var(--law-accent)" }} /> {tr("بطاقات الفرقة")}
      </h2>
      <p className="mb-3 text-xs leading-6" style={{ color: "var(--law-muted)" }}>
        {tr("المحتوى مشترك بين الأعضاء، وكل واحد يراجع بحسب جدوله الشخصي.")}
      </p>
      {deck && !deck.subscribed && deck.cards.length > 0 && (
        <Button type="button" onClick={subscribe} className="mb-3 w-full">
          {tr("أضف بطاقات الفرقة إلى مراجعتي")}
        </Button>
      )}
      {deck?.subscribed && (
        <p className="mb-2 text-xs font-semibold" style={{ color: "var(--law-ok)" }}>
          {tr("✓ هذه البطاقات ضمن مراجعتك، وتُحدَّث تلقائياً.")}
        </p>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <ul className="mb-3 flex flex-col">
        {(deck?.cards || []).map((c) => (
          <li key={c.id} className="flex items-start gap-2 py-2" style={{ borderBottom: "1px solid var(--law-border)" }}>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">
                <bdi>{c.front}</bdi>
              </span>
              <span className="block" style={{ color: "var(--law-muted)" }}>
                <bdi>{c.back}</bdi>
              </span>
              <span className="text-xs" style={{ color: "var(--law-muted)" }}>
                — <bdi>{c.createdBy}</bdi>
              </span>
            </span>
            <button type="button" onClick={() => remove(c.id)} aria-label={tr("حذف")} className="p-1" style={{ color: "var(--law-muted)" }}>
              <Trash size={16} />
            </button>
          </li>
        ))}
        {deck && !deck.cards.length && <p className="law-muted text-sm">{tr("لا بطاقات بعد.")}</p>}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2">
        <Field label={tr("السؤال")}>
          <Input value={form.front} maxLength={5000} onChange={(e) => setForm((f) => ({ ...f, front: e.target.value }))} />
        </Field>
        <Field label={tr("الجواب")}>
          <Textarea rows={2} value={form.back} maxLength={5000} onChange={(e) => setForm((f) => ({ ...f, back: e.target.value }))} />
        </Field>
        <Button type="submit" variant="secondary" disabled={!form.front.trim() || !form.back.trim()}>
          {tr("إضافة بطاقة للفرقة")}
        </Button>
      </form>
    </Card>
  );
}

/** One module + professor: the master notes by session, and the squad deck. */
export default function SquadWorkspace() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    Law.masterNotes(id).then((r) => (r.ok ? setData(r.data) : setError(squadError(r))));
  }, [id]);
  const ws = data?.workspace;
  const fmt = new Intl.DateTimeFormat(intlLocale(), { day: "numeric", month: "short" });

  return (
    <>
      <PageTitle sub={ws ? <><bdi>{ws.professorName}</bdi> · <bdi dir="ltr">{ws.academicYear}</bdi></> : null}>
        {ws ? <bdi>{ws.moduleName}</bdi> : tr("المادة")}
      </PageTitle>
      <Link to="/law/community/squads" className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}>
        <Back /> {tr("الفرقة")}
      </Link>
      {error && <Notice tone="warn">{error}</Notice>}
      {data && (
        <>
          <h2 className="mb-2 font-bold">{tr("المحاضرات الجامعة")}</h2>
          <div className="mb-4 flex flex-col gap-3">
            {data.notes.map((n) => (
              <Link key={n.id} to={`/law/squad/notes/${n.id}`} className="law-card flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold" style={{ background: "var(--law-surface-2)" }}>
                  <bdi dir="ltr">{n.sessionNumber}</bdi>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    <bdi>{n.title}</bdi>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--law-muted)" }}>
                    {fmt.format(new Date(n.date))}
                    <NoteBadges note={n} showVisibility />
                  </span>
                  {n.forkedFromAuthorName && (
                    <span className="block text-xs" style={{ color: "var(--law-muted)" }}>
                      {tr("مقتبسة ومطورة عن تلخيص الطالب")} <bdi>{n.forkedFromAuthorName}</bdi>
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {!data.notes.length && (
              <MascotSlot message={tr("لا محاضرات بعد. اكتبوا أول محاضرة جامعة بكلماتكم الخاصة.")} />
            )}
            <Link to={`/law/squad/w/${id}/new`} className="law-btn law-btn-secondary flex items-center justify-center gap-2">
              <Plus size={18} /> <NotePencil size={18} /> {tr("محاضرة جامعة جديدة")}
            </Link>
          </div>
          <SessionSynthesis
            workspaceId={id}
            defaultSession={Math.max(0, ...data.notes.map((n) => n.sessionNumber)) + 1}
          />
          <SquadDeck workspaceId={id} />
        </>
      )}
    </>
  );
}
