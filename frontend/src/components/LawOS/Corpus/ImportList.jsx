import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Law from "@/models/law";
import { Button, Card, Field, Input, Select, Textarea, Notice } from "../ui";
import { uploadFileNow } from "../lib/directUpload";
import { fmtDate } from "./shared";
import { tr } from "@/components/LawOS/lib/i18n";

const STATUS = {
  parsing: tr("قيد القراءة"),
  review: tr("بانتظار مراجعتك"),
  committed: tr("أُدرج"),
  failed: tr("فشل"),
};

/**
 * Manual-first corpus import (spec §6.5): an official PDF or pasted official text → review screen.
 * Nothing reaches the corpus before the student reviews and commits it.
 */
export default function ImportList() {
  const navigate = useNavigate();
  const [codes, setCodes] = useState([]);
  const [imports, setImports] = useState([]);
  const [form, setForm] = useState({
    codeSlug: "DOC",
    validFrom: "",
    amendedByLaw: "",
    amendedByBoRef: "",
    text: "",
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => {
    Law.codes().then((r) => r.ok && setCodes(r.data.codes));
    Law.imports().then((r) => r.ok && setImports(r.data.imports));
  };
  useEffect(load, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function start(e) {
    e.preventDefault();
    setMsg(null);
    try {
      let body = { ...form, text: form.text || undefined };
      if (file) {
        setBusy(tr("رفع الملف…"));
        const asset = await uploadFileNow(file, (p) =>
          setBusy(tr("رفع الملف… {0}%", [Math.round(p * 100)]))
        );
        body = {
          ...body,
          text: undefined,
          assetId: asset.id,
          title: file.name,
        };
      }
      setBusy(tr("إنشاء جلسة المراجعة…"));
      const r = await Law.createImport(body);
      setBusy(null);
      if (!r.ok) return setMsg(r.data?.error || tr("تعذر الاستيراد"));
      navigate(`/law/corpus/import/${r.data.import.id}`);
    } catch (err) {
      setBusy(null);
      setMsg(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <form onSubmit={start} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("النص")}>
              <Select
                value={form.codeSlug}
                onChange={set("codeSlug")}
                options={codes.map((c) => [c.slug, c.titleAr])}
              />
            </Field>
            <Field label={tr("ساري ابتداء من")}>
              <Input
                type="date"
                dir="ltr"
                value={form.validFrom}
                onChange={set("validFrom")}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("القانون المعدِّل (إن وجد)")}>
              <Input
                dir="ltr"
                value={form.amendedByLaw}
                onChange={set("amendedByLaw")}
                placeholder="58.25"
              />
            </Field>
            <Field label={tr("مرجع الجريدة الرسمية")}>
              <Input
                value={form.amendedByBoRef}
                onChange={set("amendedByBoRef")}
                placeholder={tr("ج.ر عدد …")}
              />
            </Field>
          </div>
          <Field
            label={tr("ملف PDF رسمي")}
            hint={tr("أو الصق النص الموحد أدناه")}
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Field>
          {!file && (
            <Field label={tr("النص الرسمي")}>
              <Textarea
                value={form.text}
                onChange={set("text")}
                style={{ minHeight: "10rem" }}
                placeholder={tr("الفصل 1 …")}
              />
            </Field>
          )}
          {busy && <Notice>{busy}</Notice>}
          {msg && <Notice tone="warn">{msg}</Notice>}
          <Button
            type="submit"
            disabled={!!busy || (!file && !form.text.trim())}
          >
            {tr("بدء المراجعة")}
          </Button>
        </form>
      </Card>
      {imports.map((i) => (
        <Card key={i.id} className="p-0">
          <Link
            to={`/law/corpus/import/${i.id}`}
            className="flex items-center justify-between gap-2 p-3 text-sm"
          >
            <span>
              <span className="block font-semibold">{i.code.titleAr}</span>
              <span className="law-muted text-xs">
                {tr("ساري من")} {fmtDate(i.validFrom)} ·{" "}
                <bdi dir="ltr">{i.articleCount}</bdi> {tr("فصل/مادة")}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold">
              {STATUS[i.status]}
            </span>
          </Link>
        </Card>
      ))}
    </div>
  );
}
