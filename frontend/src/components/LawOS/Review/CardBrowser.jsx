import { useEffect, useState, useCallback } from "react";
import { Plus, MagnifyingGlass, Pause, Play } from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Button, Card, Input, Notice, ORIGIN_LABELS } from "../ui";
import CardEditor from "./CardEditor";
import { tr } from "@/components/LawOS/lib/i18n";

const STATE_LABELS = {
  new: tr("جديدة"),
  learning: tr("قيد التعلم"),
  review: tr("مراجعة"),
  relearning: tr("إعادة تعلم"),
};

export default function CardBrowser({ subjects, subjectId, onChanged }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ cards: [], total: 0 });
  const [editing, setEditing] = useState(null); // null | "new" | card
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const res = await Law.cards({ subjectId, q });
    setOffline(res.offline);
    if (res.ok) setData(res.data);
  }, [subjectId, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function save(form) {
    const res =
      editing === "new"
        ? await Law.createCard(form)
        : await Law.updateCard(editing.id, form);
    if (!res.ok)
      return res.offline
        ? tr("يلزم الاتصال لحفظ البطاقات.")
        : res.data?.error || tr("تعذر الحفظ");
    setEditing(null);
    load();
    onChanged?.();
    return null;
  }

  async function toggleSuspend(card) {
    const res = await Law.updateCard(card.id, { suspended: !card.suspended });
    if (res.ok) load();
  }

  async function remove() {
    const res = await Law.deleteCard(editing.id);
    if (res.ok) {
      setEditing(null);
      load();
      onChanged?.();
    }
  }

  if (editing)
    return (
      <Card className="p-4">
        <h2 className="mb-4 text-lg font-bold">
          {editing === "new" ? tr("بطاقة جديدة") : tr("تعديل البطاقة")}
        </h2>
        <CardEditor
          card={editing === "new" ? null : editing}
          subjects={subjects}
          defaultSubjectId={subjectId}
          onSave={save}
          onCancel={() => setEditing(null)}
          onDelete={editing === "new" ? null : remove}
        />
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("بحث في البطاقات")}
          />
          <MagnifyingGlass
            className="law-muted pointer-events-none absolute end-3 top-3"
            size={20}
          />
        </div>
        <Button
          onClick={() => setEditing("new")}
          aria-label={tr("بطاقة جديدة")}
        >
          <Plus size={20} weight="bold" />
        </Button>
      </div>
      {offline && (
        <Notice tone="warn">
          {tr(
            "إدارة البطاقات تحتاج اتصالا بالخادم. المراجعة تعمل بدون إنترنت."
          )}
        </Notice>
      )}
      {!offline && data.cards.length === 0 && (
        <EmptyState title={q ? tr("لا نتائج") : tr("لا توجد بطاقات بعد")}>
          {tr(
            "أنشئ بطاقة من خطأ ارتكبته، أو من تعريف، أو من شروط وعناصر، أو من أجل يجب حفظه."
          )}
        </EmptyState>
      )}
      {data.cards.map((c) => (
        <Card
          key={c.id}
          className="flex items-start gap-3 p-3"
          style={{ opacity: c.suspended ? 0.55 : 1 }}
        >
          <button
            type="button"
            className="flex-1 text-start"
            onClick={() => setEditing(c)}
          >
            <p className="line-clamp-2 font-semibold leading-7">{c.front}</p>
            <p className="law-muted mt-1 text-xs">
              {subjects.find((s) => s.id === c.subjectId)?.name} ·{" "}
              {ORIGIN_LABELS[c.origin]} · {STATE_LABELS[c.state]}
            </p>
          </button>
          <button
            type="button"
            onClick={() => toggleSuspend(c)}
            aria-label={c.suspended ? tr("استئناف") : tr("تعليق")}
            className="law-muted flex h-11 w-11 items-center justify-center"
          >
            {c.suspended ? <Play size={20} /> : <Pause size={20} />}
          </button>
        </Card>
      ))}
      {data.total > data.cards.length && (
        <p className="law-muted text-center text-xs">
          {tr("تُعرض")} {data.cards.length} {tr("من")} {data.total}
        </p>
      )}
    </div>
  );
}
