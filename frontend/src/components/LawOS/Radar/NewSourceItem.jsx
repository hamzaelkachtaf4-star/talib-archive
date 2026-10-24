import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Input, Notice, Select } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

/** A scraped document awaiting the student's decision: import for review, or dismiss (spec §6.5). */
export default function NewSourceItem({ source, onDone }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState([]);
  const [codeSlug, setCodeSlug] = useState("DOC");
  const [validFrom, setValidFrom] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && !codes.length)
      Law.codes().then((r) => r.ok && setCodes(r.data.codes));
  }, [open, codes.length]);

  async function importIt() {
    setBusy(true);
    const r = await Law.importSource(source.id, { codeSlug, validFrom });
    setBusy(false);
    if (!r.ok) return setMsg(r.data?.error || tr("تعذر الاستيراد"));
    navigate(`/law/corpus/import/${r.data.import.id}`);
  }

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-3">
        <Newspaper size={22} style={{ color: "var(--law-accent)" }} />
        <span className="flex-1 text-sm">
          <span className="block font-semibold">{source.title}</span>
          <span className="law-muted text-xs">{source.parseNotes}</span>
        </span>
      </div>
      {open ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={codeSlug}
              onChange={(e) => setCodeSlug(e.target.value)}
              options={codes.map((c) => [c.slug, c.titleAr])}
            />
            <Input
              type="date"
              dir="ltr"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              aria-label={tr("ساري من")}
            />
          </div>
          {msg && <Notice tone="warn">{msg}</Notice>}
          <Button onClick={importIt} disabled={!validFrom || busy}>
            {tr("تنزيل ومراجعة")}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => setOpen(true)} style={{ minHeight: 36 }}>
            {tr("استيراد للمراجعة")}
          </Button>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="law-btn law-btn-secondary"
            style={{ minHeight: 36 }}
          >
            {tr("فتح")}
          </a>
          <Button
            variant="secondary"
            onClick={() => Law.dismissSource(source.id).then(onDone)}
            style={{ minHeight: 36 }}
          >
            {tr("تجاهل")}
          </Button>
        </div>
      )}
    </Card>
  );
}
