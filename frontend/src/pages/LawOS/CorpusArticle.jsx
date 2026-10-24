import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Warning } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Card, Input, Notice } from "@/components/LawOS/ui";
import {
  ArticleTitle,
  VerifiedBadge,
  fmtDate,
  todayStr,
} from "@/components/LawOS/Corpus/shared";
import { findSavedArticle } from "@/components/LawOS/lib/legalOffline";
import { tr } from "@/components/LawOS/lib/i18n";

const RELATIONS = {
  references: tr("يحيل على"),
  applies: tr("يطبق"),
  interprets: tr("يفسر"),
  confirms: tr("يؤكد"),
  reverses: tr("يتراجع عن"),
  contradicts: tr("يعارض"),
  cites: tr("يستشهد بـ"),
  divergesFrom: tr("يخالف"),
};

/** Copy, share, bookmark and link-to-module for the article on screen. */
function ArticleActions({ canonicalId, text, label, code }) {
  const [marked, setMarked] = useState(null); // null = not known yet
  const [copied, setCopied] = useState(false);
  const [modules, setModules] = useState([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    Law.bookmarks().then((r) => r.ok && setMarked(r.data.bookmarks.some((b) => b.canonicalId === canonicalId)));
    Law.myAcademic().then(async (a) => {
      const r = await Law.moduleList((a.ok && a.data.academic?.semester) || "S3");
      if (r.ok) { setModules(r.data.modules); setPick(r.data.modules[0]?.id || ""); }
    });
  }, [canonicalId]);
  const btn = "law-btn law-btn-secondary";
  async function copy() {
    try { await navigator.clipboard.writeText(`${label} — ${code.titleAr}\n${text || ""}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setMsg(tr("تعذر النسخ.")); }
  }
  async function toggleMark() {
    const next = !marked;
    setMarked(next);
    const r = next ? await Law.addBookmark(canonicalId) : await Law.removeBookmark(canonicalId);
    if (!r.ok) { setMarked(!next); setMsg(r.offline ? tr("يحتاج اتصالا بالخادم.") : tr("تعذر الحفظ.")); }
  }
  async function link() {
    const r = await Law.linkArticle(pick, canonicalId);
    setMsg(r.ok ? tr("رُبط النص بالمادة. سيقرؤه المرشد والتمارين.") : tr("تعذر الربط."));
  }
  return (
    <div className="mb-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className={btn} onClick={copy}>{copied ? tr("تم النسخ") : tr("نسخ")}</button>
        <button type="button" className={btn} onClick={() => { const url = location.href; if (navigator.share) navigator.share({ title: label, url }).catch(() => {}); else navigator.clipboard?.writeText(url); }}>{tr("مشاركة")}</button>
        <button type="button" className={btn} aria-pressed={!!marked} onClick={toggleMark} disabled={marked === null}>{marked ? tr("محفوظ") : tr("حفظ")}</button>
        <Link to={`/law/library/chat?code=${encodeURIComponent(code.slug)}`} className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("اسأل عن هذا النص")}</Link>
      </div>
      {modules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="law-input" style={{ inlineSize: "auto" }} aria-label={tr("المادة")}>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <button type="button" className={btn} onClick={link}>{tr("اربط بمادة")}</button>
        </div>
      )}
      {msg && <p role="status" className="text-xs" style={{ color: "var(--law-muted)" }}>{msg}</p>}
    </div>
  );
}

/** Article text at a date, version timeline, verification state, repeal banner, links (spec §10.2). */
/** Last articles opened, kept per account in the offline store (wiped with the rest on a device-owner change). */
async function rememberArticle(entry) {
  try {
    const { getMeta, setMeta } = await import("@/components/LawOS/lib/idb");
    const { pushRecent } = await import("@/components/LawOS/lib/citation");
    const { RECENTS_KEY } = await import("@/components/LawOS/Corpus/LibraryFinder");
    await setMeta(RECENTS_KEY, pushRecent(await getMeta(RECENTS_KEY), entry));
  } catch { /* recents are a convenience only */ }
}

export default function CorpusArticle() {
  const { canonicalId } = useParams();
  const [params, setParams] = useSearchParams();
  const at = params.get("at") || todayStr();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    Law.article(canonicalId, at).then((r) => {
      if (r.ok) {
        setData(r.data);
        rememberArticle({ canonicalId: r.data.article.canonicalId || canonicalId, label: `${r.data.article.code.numberingLabel} ${r.data.article.articleNumber} · ${r.data.article.code.titleAr}` });
        setError(null);
      } else if (r.offline) {
        // Offline: fall back to a statute pack saved from the Library.
        findSavedArticle(canonicalId).then((f) => {
          if (f) { setSaved(f); setError(tr("بدون اتصال: نسخة محفوظة بتاريخ {0}.", [f.at])); }
          else setError(tr("يحتاج اتصالا بالخادم."));
        });
      } else setError(tr("الفصل غير موجود في النصوص المستوردة."));
    });
  }, [canonicalId, at]);

  const a = data?.article;
  return (
    <>
      <Link to="/law/library/corpus" className="mb-3 flex items-center gap-1 text-sm">
        <ArrowRight size={18} className="law-flip" /> {tr("المرجع القانوني")}
      </Link>
      {error && <Notice tone="warn">{error}</Notice>}
      {saved && (
        <>
          <h1 className="mb-1 text-2xl font-bold"><ArticleTitle label={saved.code.numberingLabel} number={saved.article.articleNumber} /></h1>
          <p className="law-muted mb-2 text-sm">{saved.code.titleAr}</p>
          {saved.article.headingPath.length > 0 && <p className="law-muted mb-3 text-xs leading-6">{saved.article.headingPath.join(" › ")}</p>}
          <Card className="whitespace-pre-wrap p-4 leading-8"><bdi>{saved.article.text}</bdi></Card>
        </>
      )}
      {a && (
        <>
          <h1 className="mb-1 text-2xl font-bold">
            <ArticleTitle
              label={a.code.numberingLabel}
              number={a.articleNumber}
            />
          </h1>
          <p className="law-muted mb-2 text-sm">{a.code.titleAr}</p>
          <ArticleActions canonicalId={canonicalId} text={a.current?.textAr} label={`${a.code.numberingLabel} ${a.articleNumber}`} code={a.code} />
          {a.headingPath.length > 0 && (
            <p className="law-muted mb-3 text-xs leading-6">
              {a.headingPath.join(" › ")}
            </p>
          )}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm">{tr("بتاريخ")}</span>
            <div className="w-44">
              <Input
                type="date"
                dir="ltr"
                value={at}
                onChange={(e) =>
                  setParams({ at: e.target.value }, { replace: true })
                }
              />
            </div>
          </div>
          {!a.codeInForceAtDate && (
            <Notice tone="warn">
              <Warning size={16} className="inline" />{" "}
              {tr("هذا النص غير ساري في هذا التاريخ.")}
              {a.code.notes ? ` ${a.code.notes}` : ""}
            </Notice>
          )}
          <Card className="mb-4 p-4">
            {a.current ? (
              <>
                <p className="whitespace-pre-wrap text-lg leading-9">
                  {a.current.textAr}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <VerifiedBadge verified={a.current.verifiedByUser} />
                  <span className="law-muted">
                    {tr("ساري من")} {fmtDate(a.current.validFrom)}
                    {a.current.validTo &&
                      tr("إلى {0}", [fmtDate(a.current.validTo)])}
                  </span>
                </div>
              </>
            ) : (
              <p className="law-muted">
                {tr("لا توجد صيغة سارية لهذا الفصل في هذا التاريخ.")}
              </p>
            )}
          </Card>
          <h2 className="mb-2 text-sm font-bold">{tr("تاريخ الصيغ")}</h2>
          <ol className="mb-4 flex flex-col gap-2">
            {a.versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() =>
                    setParams(
                      { at: v.validFrom.slice(0, 10) },
                      { replace: true }
                    )
                  }
                  className="law-card w-full p-3 text-start text-sm"
                  style={
                    a.current?.id === v.id
                      ? { borderColor: "var(--law-accent)" }
                      : undefined
                  }
                >
                  <span className="block font-semibold">
                    {fmtDate(v.validFrom)} –{" "}
                    {v.validTo ? fmtDate(v.validTo) : tr("الآن")}
                  </span>
                  <span className="law-muted text-xs">
                    {v.amendedByLaw && (
                      <>
                        {tr("القانون")} <bdi dir="ltr">{v.amendedByLaw}</bdi>{" "}
                      </>
                    )}
                    {v.amendedByBoRef}
                    {v.sourceDocument?.title && ` · ${v.sourceDocument.title}`}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {data.links.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-bold">{tr("روابط")}</h2>
              {data.links.map((l) => (
                <p key={l.id} className="law-muted text-sm">
                  {l.direction === "in"
                    ? tr("{0} {1} هذا الفصل", [
                        l.fromType,
                        RELATIONS[l.relation],
                      ])
                    : `${RELATIONS[l.relation]} ${l.toType}`}
                  {l.note && ` · ${l.note}`}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
