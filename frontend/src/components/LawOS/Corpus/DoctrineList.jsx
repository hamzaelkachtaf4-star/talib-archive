import { useCallback, useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Field, Input, Textarea, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

const blank = {
  author: "",
  work: "",
  edition: "",
  year: "",
  page: "",
  paraphrase: "",
  shortQuote: "",
};

/** Doctrine as references + the student's paraphrase; quotes ≤ 300 chars (spec §12). */
export default function DoctrineList() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const r = await Law.doctrine({ q: q || undefined });
    if (r.ok) setList(r.data.doctrine);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const body = { ...form, year: form.year ? Number(form.year) : null };
    delete body.id;
    delete body.createdAt;
    delete body.updatedAt;
    const r = form.id
      ? await Law.updateDoctrine(form.id, body)
      : await Law.createDoctrine(body);
    if (!r.ok) return setMsg(r.data?.error || tr("تعذر الحفظ"));
    setForm(null);
    setMsg(null);
    load();
  }

  if (form)
    return (
      <Card className="p-4">
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("المؤلف")}>
              <Input value={form.author} onChange={set("author")} required />
            </Field>
            <Field label={tr("المؤلَّف")}>
              <Input value={form.work} onChange={set("work")} required />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label={tr("الطبعة")}>
              <Input value={form.edition || ""} onChange={set("edition")} />
            </Field>
            <Field label={tr("السنة")}>
              <Input
                type="number"
                dir="ltr"
                value={form.year || ""}
                onChange={set("year")}
              />
            </Field>
            <Field label={tr("الصفحة")}>
              <Input dir="ltr" value={form.page || ""} onChange={set("page")} />
            </Field>
          </div>
          <Field label={tr("الفكرة بصياغتك")}>
            <Textarea
              value={form.paraphrase}
              onChange={set("paraphrase")}
              required
            />
          </Field>
          <Field
            label={tr("اقتباس قصير (اختياري)")}
            hint={`${(form.shortQuote || "").length}/300`}
          >
            <Textarea
              value={form.shortQuote || ""}
              onChange={set("shortQuote")}
              maxLength={300}
            />
          </Field>
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
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("بحث في المراجع الفقهية")}
        />
        <Button onClick={() => setForm(blank)} aria-label={tr("مرجع جديد")}>
          <Plus size={20} weight="bold" />
        </Button>
      </div>
      {!list.length && (
        <EmptyState title={tr("لا مراجع فقهية بعد")}>
          {tr(
            "سجّل المرجع (المؤلف، المؤلَّف، الصفحة) والفكرة بكلماتك. لا تُنسخ الكتب."
          )}
        </EmptyState>
      )}
      {list.map((d) => (
        <Card key={d.id} className="p-0">
          <button
            type="button"
            className="flex w-full flex-col gap-1 p-3 text-start"
            onClick={() => setForm({ ...d, year: d.year ?? "" })}
          >
            <span className="font-bold">
              {d.author} · {d.work}
            </span>
            <span className="law-muted text-xs">
              {[d.edition, d.year, d.page && tr("ص {0}", [d.page])]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="line-clamp-3 text-sm leading-7">
              {d.paraphrase}
            </span>
          </button>
        </Card>
      ))}
    </div>
  );
}
