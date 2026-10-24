import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Trash, ArrowLineDown } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Card, Input, Textarea, Notice } from "@/components/LawOS/ui";
import { fmtDate } from "@/components/LawOS/Corpus/shared";
import { tr } from "@/components/LawOS/lib/i18n";

const WARN = (w) =>
  w === "empty"
    ? tr("نص فارغ")
    : w === "duplicate"
      ? tr("رقم مكرر")
      : w.startsWith("gap:")
        ? tr("فصول ناقصة {0}", [w.slice(4)])
        : w;

/**
 * Review before anything enters the corpus (spec §6.5): fix boundaries/numbers/text, confirm each
 * article against the official source. Confirmation is unchecked by default; only confirmed articles
 * are stored as verifiedByUser.
 */
export default function CorpusImportReview() {
  const { id } = useParams();
  const [imp, setImp] = useState(null);
  const [articles, setArticles] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let t;
    const load = async () => {
      const r = await Law.getImport(id);
      if (!r.ok)
        return setMsg(
          r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("غير موجود.")
        );
      setImp(r.data.import);
      setArticles(r.data.import.articles);
      if (r.data.import.status === "parsing") t = setTimeout(load, 3000);
    };
    load();
    return () => clearTimeout(t);
  }, [id]);

  const edit = (i, patch) =>
    setArticles((all) => all.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const mergeNext = (i) =>
    setArticles((all) => [
      ...all.slice(0, i),
      { ...all[i], text: `${all[i].text}\n${all[i + 1].text}`.trim() },
      ...all.slice(i + 2),
    ]);

  async function save(action) {
    setSaving(true);
    const r = await Law.saveImport(id, { articles, ...(action && { action }) });
    setSaving(false);
    if (!r.ok) return setMsg(r.data?.error || tr("تعذر الحفظ"));
    setImp(r.data.import);
    setArticles(r.data.import.articles);
    setMsg(
      action === "commit"
        ? tr(
            "أُدرج: {0} جديد، {1} صيغة جديدة، {2} دون تغيير، {3} مُتحقق منه.",
            [
              r.data.summary.created,
              r.data.summary.versioned,
              r.data.summary.unchanged,
              r.data.summary.verified,
            ]
          )
        : tr("حُفظت المراجعة.")
    );
  }

  const confirmed = articles.filter(
    (a) => a.confirmed && a.include !== false
  ).length;
  const editable = imp?.status === "review";
  return (
    <div className="pb-36 lg:pb-0">
      <Link
        to="/law/corpus?tab=import"
        className="mb-3 flex items-center gap-1 text-sm"
      >
        <ArrowRight size={18} className="law-flip" /> {tr("الاستيراد")}
      </Link>
      {imp && (
        <>
          <h1 className="text-xl font-bold">{imp.code.titleAr}</h1>
          <p className="law-muted mb-3 text-sm">
            {tr("ساري من")} {fmtDate(imp.validFrom)}
            {imp.amendedByLaw && (
              <>
                {" "}
                {tr("· القانون")} <bdi dir="ltr">{imp.amendedByLaw}</bdi>
              </>
            )}
          </p>
          {imp.status === "parsing" && (
            <Notice>{tr("جارٍ استخراج النص من الملف…")}</Notice>
          )}
          {imp.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w === "no articles detected"
                ? tr(
                    "لم يُتعرف على أي فصل. تأكد أن الملف نص قانوني، أو الصق النص يدويا."
                  )
                : w}
            </Notice>
          ))}
          {editable && (
            <Notice>
              {tr(
                "قارن كل فصل بالمصدر الرسمي ثم أشّر عليه. الفصول غير المؤشر عليها تُدرج «غير مُتحقق منها»."
              )}
            </Notice>
          )}
        </>
      )}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {articles.map((a, i) => (
        <Card
          key={i}
          className="mb-3 flex flex-col gap-2 p-3"
          style={{ opacity: a.include === false ? 0.5 : 1 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {imp?.code.numberingLabel}
            </span>
            <div className="w-28">
              <Input
                dir="ltr"
                value={a.number}
                disabled={!editable}
                onChange={(e) => edit(i, { number: e.target.value })}
              />
            </div>
            {a.warnings?.map((w) => (
              <span
                key={w}
                className="text-xs"
                style={{ color: "var(--law-warn)" }}
              >
                {WARN(w)}
              </span>
            ))}
            {editable && (
              <span className="ms-auto flex">
                {i < articles.length - 1 && (
                  <button
                    type="button"
                    aria-label={tr("دمج مع التالي")}
                    className="law-muted h-11 w-11"
                    onClick={() => mergeNext(i)}
                  >
                    <ArrowLineDown size={20} className="mx-auto" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={tr("استبعاد")}
                  className="law-muted h-11 w-11"
                  onClick={() => edit(i, { include: a.include === false })}
                >
                  <Trash size={20} className="mx-auto" />
                </button>
              </span>
            )}
          </div>
          {a.headingPath?.length > 0 && (
            <span className="law-muted text-xs">
              {a.headingPath.join(" › ")}
            </span>
          )}
          <Textarea
            value={a.text}
            disabled={!editable}
            onChange={(e) => edit(i, { text: e.target.value })}
          />
          {editable && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={!!a.confirmed}
                onChange={(e) => edit(i, { confirmed: e.target.checked })}
              />
              {tr("قارنته بالمصدر الرسمي")}
            </label>
          )}
        </Card>
      ))}
      {editable && articles.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex flex-wrap gap-2 p-3 shadow-lg lg:static lg:p-0 lg:shadow-none"
          style={{ background: "var(--law-surface)" }}
        >
          <Button
            variant="secondary"
            onClick={() =>
              setArticles((all) => all.map((a) => ({ ...a, confirmed: true })))
            }
          >
            {tr("تأكيد الكل")}
          </Button>
          <Button variant="secondary" onClick={() => save()} disabled={saving}>
            {tr("حفظ")}
          </Button>
          <Button
            onClick={() => save("commit")}
            disabled={saving}
            className="flex-1"
          >
            {tr("إدراج (")}
            {confirmed}/{articles.filter((a) => a.include !== false).length}{" "}
            {tr("مُتحقق)")}
          </Button>
        </div>
      )}
    </div>
  );
}
