import { useCallback, useEffect, useState } from "react";
import { Plus, ArrowSquareOut } from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Field, Input, Textarea, Notice } from "../ui";
import { VerifiedBadge, fmtDate } from "./shared";
import { tr } from "@/components/LawOS/lib/i18n";

const blank = {
  court: tr("محكمة النقض"),
  decisionNumber: "",
  decisionDate: "",
  chamber: "",
  fileNumber: "",
  subjectMatter: "",
  principle: "",
  sourceUrl: "",
};

/** Court of Cassation ledger (spec §3.2): verified only after opening the official record. */
export default function DecisionLedger() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [opened, setOpened] = useState({});
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const r = await Law.decisions({ q: q || undefined });
    if (r.ok) setList(r.data.decisions);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const r = form.id
      ? await Law.updateDecision(form.id, form)
      : await Law.createDecision(form);
    if (!r.ok) return setMsg(r.data?.error || tr("تعذر الحفظ"));
    setForm(null);
    setMsg(null);
    load();
  }

  async function verify(d) {
    const r = await Law.updateDecision(d.id, { verified: true });
    if (!r.ok) setMsg(r.data?.error);
    load();
  }

  if (form)
    return (
      <Card className="p-4">
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("رقم القرار")}>
              <Input
                dir="ltr"
                value={form.decisionNumber}
                onChange={set("decisionNumber")}
                required
              />
            </Field>
            <Field label={tr("التاريخ")}>
              <Input
                type="date"
                dir="ltr"
                value={form.decisionDate}
                onChange={set("decisionDate")}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("الغرفة")}>
              <Input value={form.chamber || ""} onChange={set("chamber")} />
            </Field>
            <Field label={tr("رقم الملف")}>
              <Input
                dir="ltr"
                value={form.fileNumber || ""}
                onChange={set("fileNumber")}
              />
            </Field>
          </div>
          <Field label={tr("الموضوع")}>
            <Input
              value={form.subjectMatter || ""}
              onChange={set("subjectMatter")}
            />
          </Field>
          <Field label={tr("المبدأ (بصياغتك)")}>
            <Textarea
              value={form.principle || ""}
              onChange={set("principle")}
            />
          </Field>
          <Field label={tr("رابط المصدر الرسمي")} hint="juriscassation.cspj.ma">
            <Input
              dir="ltr"
              type="url"
              value={form.sourceUrl || ""}
              onChange={set("sourceUrl")}
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
          placeholder={tr("بحث في القرارات")}
        />
        <Button onClick={() => setForm(blank)} aria-label={tr("قرار جديد")}>
          <Plus size={20} weight="bold" />
        </Button>
      </div>
      {msg && <Notice tone="warn">{msg}</Notice>}
      {!list.length && (
        <EmptyState title={tr("لا قرارات بعد")}>
          {tr(
            "سجّل قرارات محكمة النقض: الرقم، التاريخ، الغرفة، والمبدأ بصياغتك."
          )}
        </EmptyState>
      )}
      {list.map((d) => (
        <Card key={d.id} className="flex flex-col gap-2 p-3">
          <button
            type="button"
            className="text-start"
            onClick={() =>
              setForm({ ...d, decisionDate: d.decisionDate.slice(0, 10) })
            }
          >
            <span className="block font-bold">
              {d.court} {tr("· قرار")} <bdi dir="ltr">{d.decisionNumber}</bdi>
            </span>
            <span className="law-muted text-xs">
              {fmtDate(d.decisionDate)} {d.chamber && `· ${d.chamber}`}
            </span>
            {d.principle && (
              <span className="mt-1 line-clamp-3 block text-sm leading-7">
                {d.principle}
              </span>
            )}
          </button>
          <div className="flex items-center justify-between gap-2">
            <VerifiedBadge verified={d.verified} />
            {!d.verified && d.sourceUrl && (
              <span className="flex gap-2">
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpened((o) => ({ ...o, [d.id]: true }))}
                  className="law-btn law-btn-secondary"
                  style={{ minHeight: 36 }}
                >
                  <ArrowSquareOut size={16} /> {tr("فتح المصدر")}
                </a>
                <Button
                  onClick={() => verify(d)}
                  disabled={!opened[d.id]}
                  style={{ minHeight: 36 }}
                >
                  {tr("تحققت")}
                </Button>
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
