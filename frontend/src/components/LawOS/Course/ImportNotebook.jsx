import { useState } from "react";
import { Link } from "react-router-dom";
import Law from "@/models/law";
import { uploadFileNow } from "@/components/LawOS/lib/directUpload";
import Button3D from "@/components/LawOS/kit/Button3D";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";
import { IMPORT_ERRORS } from "./labels";

const MAX_BYTES = 20 * 1024 * 1024; // the server refuses larger notebooks
const STATUS = () => ({
  created: tr("أُضيفت"),
  unchanged: tr("موجودة دون تغيير"),
  exists: tr("موجودة بنسخة مختلفة"),
  replaced: tr("استُبدلت"),
  importing: tr("قيد الاستيراد"),
});
const WARNING = () => ({
  dropped_objects: tr("جداول أو صناديق شيفرة في الدفتر لا تُستورد (النص فقط)."),
  title_truncated: tr("قُصّت بعض العناوين الطويلة."),
  text_truncated: tr("قُصّت بعض الملاحظات الطويلة جدا."),
  orphan: tr("وُجدت عقد بلا أب وأُلحقت بالجذر."),
  unreachable: tr("تعذر الوصول إلى بعض العقد (دورة في الشجرة)."),
  too_deep: tr("قُطعت الفروع الأعمق من 32 مستوى."),
});

/** Upload a CherryTree notebook, preview its courses, import the ones the student picks. */
export default function ImportNotebook({ onImported }) {
  const [phase, setPhase] = useState("idle"); // idle | uploading | preview | importing
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState(null);
  const [asset, setAsset] = useState(null);
  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const errors = IMPORT_ERRORS();
  const fail = (code) => setError(errors[code] || tr("تعذر إتمام العملية."));

  function reset() {
    setPhase("idle");
    setFile(null);
    setAsset(null);
    setPreview(null);
    setPicked(new Set());
    setProgress(0);
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setResult(null);
    if (f.size > MAX_BYTES) return fail("too_large");
    setFile(f);
    setPhase("uploading");
    setProgress(0);
    try {
      const a = await uploadFileNow(f, setProgress);
      setAsset(a);
      const r = await Law.coursePreview(a.id);
      if (!r.ok) {
        reset();
        return fail(r.data?.error || (r.offline ? "offline" : "unreadable"));
      }
      setPreview(r.data);
      setPicked(new Set(r.data.roots.map((x) => x.nodeId)));
      setPhase("preview");
    } catch {
      reset();
      setError(tr("تعذر رفع الملف. تحقق من الاتصال وأعد المحاولة."));
    }
  }

  async function run(replace = false) {
    setError(null);
    setPhase("importing");
    const r = await Law.courseImport({ assetId: asset.id, rootNodeIds: [...picked], sourceName: file?.name, replace });
    setPhase("preview");
    if (!r.ok) {
      if (r.data?.courses?.length) { setResult(r.data.courses); onImported?.(r.data.courses); } // some were created before it failed
      return fail(r.data?.error || (r.offline ? "offline" : "import_failed"));
    }
    setResult(r.data.courses);
    onImported?.(r.data.courses);
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const busy = phase === "uploading" || phase === "importing";
  const hasExisting = result?.some((c) => c.status === "exists");

  return (
    <section className="law-card3d grid gap-3" aria-labelledby="import-title">
      <h2 id="import-title" className="text-lg font-bold">{tr("استيراد دفتر ملاحظات")}</h2>
      <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("ارفع دفتر CherryTree (ملف .ctb) لتصبح كل مادة فيه دورة بمخططها. لا يُغيَّر ملفك ولا يغادر حسابك.")}</p>
      {error && <Notice tone="warn">{error}</Notice>}

      {phase === "idle" && (
        <label className="grid gap-1 text-sm font-bold">
          <span>{tr("اختر ملف الدفتر")}</span>
          <input type="file" accept=".ctb" onChange={onFile} className="min-h-[44px] text-sm" />
        </label>
      )}

      {phase === "uploading" && (
        <div role="status" aria-live="polite" className="grid gap-2">
          <p className="text-sm">{tr("جارٍ رفع الدفتر وقراءته…")}</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-2 overflow-hidden rounded-full" style={{ background: "var(--law-surface-2)" }}>
            <div className="h-full" style={{ inlineSize: `${Math.round(progress * 100)}%`, background: "var(--law-primary)" }} />
          </div>
        </div>
      )}

      {(phase === "preview" || phase === "importing") && preview && (
        <div className="grid gap-3">
          <p className="text-sm font-bold">{tr("المواد الموجودة في الدفتر")}</p>
          <ul className="grid gap-1">
            {preview.roots.map((r) => (
              <li key={r.nodeId}>
                <label className="flex min-h-[44px] items-center gap-3 rounded-md px-2" style={{ border: "1px solid var(--law-border)" }}>
                  <input type="checkbox" checked={picked.has(r.nodeId)} disabled={busy} onChange={() => toggle(r.nodeId)} />
                  <span className="min-w-0 flex-1 text-start">
                    <span className="block font-semibold"><bdi>{r.title}</bdi></span>
                    <span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{r.topics}</bdi> {tr("موضوعا")} · <bdi dir="ltr">{r.boldRuns}</bdi> {tr("مقطعا مُبرَزا")}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {preview.warnings?.length > 0 && (
            <ul className="text-xs" style={{ color: "var(--law-muted)" }}>
              {[...new Set(preview.warnings.map((w) => w.code))].map((c) => WARNING()[c] && <li key={c}>{WARNING()[c]}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button3D onClick={() => run(false)} disabled={busy || picked.size === 0}>{phase === "importing" ? tr("جارٍ الاستيراد…") : tr("استيراد المواد المختارة")}</Button3D>
            <Button3D variant="neutral" onClick={reset} disabled={busy}>{tr("إلغاء")}</Button3D>
          </div>
        </div>
      )}

      {result && (
        <div className="grid gap-2" role="status" aria-live="polite">
          <ul className="grid gap-1">
            {result.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><bdi className="font-semibold">{c.title}</bdi> <span className="law-chip">{STATUS()[c.status] || c.status}</span>{c.carriedGaps > 0 && <span className="text-xs" style={{ color: "var(--law-muted)" }}> · {tr("حُفظت قراراتك في")} <bdi dir="ltr">{c.carriedGaps}</bdi> {tr("ثغرة")}</span>}</span>
                {c.status !== "importing" && <Link to={`/law/path/courses/${encodeURIComponent(c.id)}`} className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("فتح")}</Link>}
              </li>
            ))}
          </ul>
          {hasExisting && phase === "preview" && (
            <div className="grid gap-2">
              <Notice tone="muted">{tr("بعض المواد موجودة بنسخة مختلفة. الاستبدال يحل النسخة الجديدة محل القديمة، وتبقى قراراتك في الثغرات (التأكيد والاستبعاد).")}</Notice>
              <div><Button3D variant="neutral" onClick={() => run(true)} disabled={busy}>{tr("استبدال النسخ الموجودة")}</Button3D></div>
            </div>
          )}
          <div><Button3D variant="neutral" onClick={() => { reset(); setResult(null); }}>{tr("استيراد دفتر آخر")}</Button3D></div>
        </div>
      )}
    </section>
  );
}
