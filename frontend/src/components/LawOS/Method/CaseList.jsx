import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Timer } from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Field, Input, Select, Textarea, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const SOURCES = [
  ["prof_td", tr("أعمال موجهة للأستاذ")],
  ["past_exam", tr("امتحان سابق")],
  ["self_written", tr("من إعدادي")],
];

export default function CaseList({ subjects }) {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const r = await Law.cases();
    if (r.ok) setList(r.data.exercises);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    const r = await Law.createCase({
      ...form,
      subjectId: form.subjectId || null,
      difficulty: Number(form.difficulty),
    });
    if (!r.ok) return setMsg(r.data?.error || tr("تعذر الحفظ"));
    setForm(null);
    load();
  }

  async function start(ex, timed, preset) {
    const r = await Law.startAttempt(ex.id, { timed, preset });
    if (r.ok) navigate(`/law/method/attempt/${r.data.attempt.id}`);
  }

  if (form)
    return (
      <Card className="p-4">
        <form onSubmit={create} className="flex flex-col gap-3">
          <Field label={tr("العنوان")}>
            <Input value={form.title} onChange={set("title")} required />
          </Field>
          <Field label={tr("الوقائع")}>
            <Textarea
              value={form.factsAr}
              onChange={set("factsAr")}
              required
              style={{ minHeight: "10rem" }}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label={tr("المادة")}>
              <Select
                value={form.subjectId}
                onChange={set("subjectId")}
                options={[["", "—"], ...subjects.map((s) => [s.id, s.name])]}
              />
            </Field>
            <Field label={tr("المصدر")}>
              <Select
                value={form.source}
                onChange={set("source")}
                options={SOURCES}
              />
            </Field>
            <Field label={tr("الصعوبة")}>
              <Select
                value={form.difficulty}
                onChange={set("difficulty")}
                options={[1, 2, 3, 4, 5].map((n) => [n, String(n)])}
              />
            </Field>
          </div>
          {msg && <Notice tone="warn">{msg}</Notice>}
          <div className="flex gap-2">
            <Button type="submit">{tr("حفظ")}</Button>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {tr("إلغاء")}
            </Button>
          </div>
        </form>
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={() =>
          setForm({
            title: "",
            factsAr: "",
            subjectId: "",
            source: "prof_td",
            difficulty: 2,
          })
        }
        className="self-start"
      >
        <Plus size={18} /> {tr("حالة عملية جديدة")}
      </Button>
      {!list.length && (
        <EmptyState title={tr("لا توجد تمارين بعد")}>
          {tr(
            "أضف حالة من الأعمال الموجهة أو امتحان سابق. تكتب الحل أولا في خمس مراحل، ثم يأتي التصحيح."
          )}
        </EmptyState>
      )}
      {list.map((ex) => (
        <Card key={ex.id} className="flex flex-col gap-2 p-3">
          <span className="font-bold">{ex.title}</span>
          <span className="law-muted line-clamp-2 text-sm">{ex.factsAr}</span>
          <span className="law-muted text-xs">
            {tr("محاولات:")} <bdi dir="ltr">{ex.attempts.length}</bdi>
          </span>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => start(ex, false)} style={{ minHeight: 36 }}>
              {tr("محاولة")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => start(ex, true, "faculty")}
              style={{ minHeight: 36 }}
            >
              <Timer size={16} /> {tr("3 س")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => start(ex, true, "attache")}
              style={{ minHeight: 36 }}
            >
              <Timer size={16} /> {tr("4 س (ملحق قضائي)")}
            </Button>
            {ex.attempts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/law/method/attempt/${a.id}`)}
                className="law-muted text-xs underline"
              >
                {a.status === "critiqued"
                  ? tr("مُصحّحة")
                  : a.status === "draft"
                    ? tr("مسودة")
                    : tr("قيد التصحيح")}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
