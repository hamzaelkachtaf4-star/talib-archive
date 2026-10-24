import { DOC_TYPES } from "@/components/LawOS/lib/docTypes";
import { useEffect, useState } from "react";
import { Forward, Back } from "@/components/LawOS/kit/DirArrow";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/LawOS/ui";
import { PageTitle } from "@/components/LawOS/EmptyState";
import MasterNoteView from "@/components/LawOS/Squad/MasterNoteView";
import { VISIBILITY } from "@/components/LawOS/Squad/NoteBadges";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { squadError } from "./Squad";
import { tr } from "@/components/LawOS/lib/i18n";

const SNIPPETS = [
  [tr("مبحث"), "\n## المبحث الأول: \n"],
  [tr("مطلب"), "\n### المطلب الأول: \n"],
  [tr("فقرة"), "\n#### الفقرة الأولى: \n"],
];

const nextPinId = (pins) => `pin-${pins.reduce((m, p) => Math.max(m, Number(p.id.slice(4)) || 0), 0) + 1}`;

/** Create or edit a master note. A save that races a squad-mate's is refused, never silently overwritten. */
function Editor({ initial, draft, workspaceId, onSaved, onCancel }) {
  const seed = initial || draft; // an AI synthesis draft pre-fills a new note
  const [form, setForm] = useState({
    title: seed?.title || "",
    sessionNumber: seed?.sessionNumber || 1,
    date: (initial?.date ? new Date(initial.date) : new Date()).toISOString().slice(0, 10),
    content: seed?.content || "",
    sourcePins: (seed?.sourcePins || []).map(({ id, type, ref, label }) => ({ id, type, ref, label: label || "" })),
    visibility: "squad", // new notes only; existing ones change through VisibilityControl
    docType: initial?.docType || "",
  });
  const [version, setVersion] = useState(initial?.version);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPin = (i, patch) =>
    setForm((f) => ({ ...f, sourcePins: f.sourcePins.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));

  function insert(text) {
    setForm((f) => ({ ...f, content: f.content + text }));
  }

  async function save(overVersion = version) {
    setBusy(true);
    setError(null);
    const body = {
      title: form.title,
      sessionNumber: Number(form.sessionNumber),
      date: form.date,
      content: form.content,
      sourcePins: form.sourcePins.map((p) => ({ ...p, label: p.label || undefined })),
      ...(initial || form.docType ? { docType: form.docType || null } : {}),
    };
    const r = initial
      ? await Law.updateMasterNote(initial.id, { ...body, version: overVersion })
      : await Law.createMasterNote(workspaceId, { ...body, visibility: form.visibility });
    setBusy(false);
    if (r.ok) return onSaved(r.data.note);
    if (r.data?.error === "edit_conflict") return setConflict(r.data.current);
    setError(squadError(r));
  }

  return (
    <div className="flex flex-col gap-3">
      {draft && (
        <Notice tone="warn">
          {tr("مسودة من الذكاء الاصطناعي: راجعوها وصحّحوها قبل الحفظ. قد تحتوي أخطاء.")}
          {draft.strippedRefs?.length > 0 && (
            <>
              {" "}
              {tr("حُذفت إحالات إلى فصول غير موجودة في النصوص المحفوظة:")} <bdi dir="ltr">{draft.strippedRefs.join(", ")}</bdi>
            </>
          )}
          {draft.gaps?.length > 0 && (
            <span className="mt-1 block">
              {tr("نقاط ناقصة أو متعارضة:")} {draft.gaps.join(" · ")}
            </span>
          )}
        </Notice>
      )}
      <Notice>{tr("اكتبوا ملخصكم بكلماتكم الخاصة. لا تنقلوا كلام الأستاذ حرفياً ولا ملفاته: أضيفوا مراجع (فصل، صفحة) بدلاً من ذلك.")}</Notice>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label={tr("العنوان")}>
            <Input value={form.title} onChange={set("title")} maxLength={200} />
          </Field>
        </div>
        <Field label={tr("رقم الحصة")}>
          <Input type="number" dir="ltr" min={1} max={200} value={form.sessionNumber} onChange={set("sessionNumber")} />
        </Field>
      </div>
      <Field label={tr("التاريخ")}>
        <Input type="date" dir="ltr" value={form.date} onChange={set("date")} />
      </Field>
      <Field label={tr("نوع الوثيقة")}>
        <Select value={form.docType} onChange={set("docType")} options={[["", tr("بدون نوع")], ...DOC_TYPES()]} />
      </Field>
      {!initial && (
        <Field label={tr("من يرى هذه المحاضرة؟")}>
          <Select
            value={form.visibility}
            onChange={set("visibility")}
            options={[
              ["squad", VISIBILITY.squad.label],
              ["private", VISIBILITY.private.label],
            ]}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        {SNIPPETS.map(([label, text]) => (
          <button key={label} type="button" className="law-btn law-btn-secondary px-3 text-xs" onClick={() => insert(text)}>
            + {label}
          </button>
        ))}
      </div>
      <Field label={tr("المحتوى (Markdown)")}>
        <Textarea rows={16} dir="auto" value={form.content} onChange={set("content")} maxLength={200000} />
      </Field>

      <div>
        <p className="mb-2 text-sm font-bold">{tr("المراجع")}</p>
        <p className="mb-2 text-xs" style={{ color: "var(--law-muted)" }}>
          {tr("أشر إلى مرجع في النص بكتابة")} <bdi dir="ltr">[^pin-1]</bdi>
        </p>
        {form.sourcePins.map((p, i) => (
          <div key={p.id} className="mb-2 grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
            <bdi dir="ltr" className="text-xs font-bold">
              {p.id}
            </bdi>
            <Select
              value={p.type}
              onChange={(e) => setPin(i, { type: e.target.value })}
              options={[
                ["ref", tr("فصل قانوني")],
                ["document", tr("وثيقة / مرجع")],
              ]}
            />
            <Input
              dir="auto"
              value={p.ref}
              placeholder={p.type === "ref" ? "DOC:77" : tr("المطبوع، ص. 12")}
              onChange={(e) => setPin(i, { ref: e.target.value })}
            />
            <button
              type="button"
              aria-label={tr("حذف")}
              className="p-1"
              onClick={() => setForm((f) => ({ ...f, sourcePins: f.sourcePins.filter((_, k) => k !== i) }))}
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="law-btn law-btn-secondary flex items-center gap-1 px-3 text-xs"
          onClick={() =>
            setForm((f) => ({ ...f, sourcePins: [...f.sourcePins, { id: nextPinId(f.sourcePins), type: "ref", ref: "", label: "" }] }))
          }
        >
          <Plus size={14} /> {tr("مرجع")}
        </button>
      </div>

      {conflict && (
        <Notice tone="warn">
          {tr("عدّل عضو آخر هذه المحاضرة أثناء كتابتك. نسختك ما تزال هنا.")}{" "}
          <button
            type="button"
            className="font-bold underline"
            onClick={() => {
              setVersion(conflict.version);
              setConflict(null);
              save(conflict.version);
            }}
          >
            {tr("احفظ نسختي فوق نسخته")}
          </button>{" "}
          ·{" "}
          <button type="button" className="font-bold underline" onClick={() => onSaved(conflict)}>
            {tr("تخلَّ عن تعديلاتي واعرض نسخته")}
          </button>
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="button" disabled={busy || !form.title.trim()} onClick={() => save()}>
          {busy ? "…" : tr("حفظ")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tr("إلغاء")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Who sees the note: only its creator decides. Going public asks for confirmation (all students of the
 * platform can read it; squad-mates stay anonymous unless their own profile is public).
 */
function VisibilityControl({ note, onChange }) {
  const [error, setError] = useState(null);
  async function change(e) {
    const visibility = e.target.value;
    if (
      visibility === "public" &&
      !window.confirm(
        tr("نشر هذه المحاضرة في منصة الكلية؟ سيقرؤها كل الطلبة. يظهر اسمك، ويبقى أعضاء فرقتك مجهولين ما لم يجعلوا ملفهم عاماً.")
      )
    )
      return;
    setError(null);
    const r = await Law.updateMasterNote(note.id, { version: note.version, visibility });
    if (!r.ok) return setError(squadError(r));
    onChange(r.data.note);
  }
  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{tr("من يرى هذه المحاضرة؟")}</span>
        <select className="law-input w-auto" value={note.visibility} onChange={change}>
          {Object.entries(VISIBILITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

/** /law/squad/notes/:id (view, edit) and /law/squad/w/:workspaceId/new (create). */
export default function SquadNote() {
  const { id, workspaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const draft = !id ? location.state?.draft || null : null;
  const [note, setNote] = useState(null);
  const [editing, setEditing] = useState(!id);
  const [error, setError] = useState(null);
  const user = useLawUser();

  useEffect(() => {
    if (id) Law.masterNote(id).then((r) => (r.ok ? setNote(r.data.note) : setError(squadError(r))));
  }, [id]);

  const backTo = `/law/squad/w/${note?.workspaceId || workspaceId}`;

  async function remove() {
    if (!window.confirm(tr("حذف هذه المحاضرة الجامعة نهائياً؟"))) return;
    const r = await Law.deleteMasterNote(note.id);
    if (!r.ok) return setError(squadError(r));
    navigate(backTo, { replace: true });
  }

  return (
    <>
      <PageTitle sub={note ? tr("الحصة {0}", [note.sessionNumber]) : null}>
        {note ? <bdi>{note.title}</bdi> : tr("محاضرة جامعة جديدة")}
      </PageTitle>
      <Link to={backTo} className="mb-3 inline-block text-sm font-semibold" style={{ color: "var(--law-primary)" }}>
        <Back /> {tr("المادة")}
      </Link>
      {error && <Notice tone="warn">{error}</Notice>}
      {editing ? (
        <Editor
          initial={note}
          draft={draft}
          workspaceId={workspaceId}
          onCancel={() => (note ? setEditing(false) : navigate(backTo))}
          onSaved={(saved) => {
            setNote(saved);
            setEditing(false);
            if (!id) navigate(`/law/squad/notes/${saved.id}`, { replace: true });
          }}
        />
      ) : (
        note && (
          <>
            <div className="mb-4 flex gap-2">
              <Button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2">
                <PencilSimple size={18} /> {tr("تعديل")}
              </Button>
              <Button type="button" variant="danger" onClick={remove} className="flex items-center gap-2">
                <Trash size={18} />
              </Button>
            </div>
            {note.createdById === user?.id ? (
              <VisibilityControl note={note} onChange={setNote} />
            ) : null}
            {note.visibility === "public" && (
              <Link to={`/law/hub/notes/${note.id}`} className="mb-3 inline-block text-xs font-semibold" style={{ color: "var(--law-primary)" }}>
                {tr("عرضها كما تظهر في منصة الكلية")} <Forward />
              </Link>
            )}
            <MasterNoteView note={note} showVisibility />
          </>
        )
      )}
    </>
  );
}
