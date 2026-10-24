import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Law from "@/models/law";
import EmptyState from "../EmptyState";
import { Card, Input, Select, Notice, Field } from "../ui";
import { ArticleTitle, VerifiedBadge, todayStr } from "./shared";
import CodeTree from "./CodeTree";
import { tr } from "@/components/LawOS/lib/i18n";

const TIER_LABELS = {
  number: tr("رقم"),
  exact: tr("تطابق تام"),
  normalized: tr("تطابق"),
  stemmed: tr("قريب"),
};

export default function ArticleSearch() {
  const [codes, setCodes] = useState([]);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [code, setCode] = useState(params.get("code") || "");
  const [at, setAt] = useState(todayStr());
  const [res, setRes] = useState(null);
  const [offline, setOffline] = useState(false);

  const urlQ = params.get("q") || "";
  useEffect(() => { setQ(urlQ); }, [urlQ]); // the header search can change ?q= while this page is open
  useEffect(() => {
    Law.codes().then((r) => r.ok && setCodes(r.data.codes));
  }, []);

  useEffect(() => {
    if (!q.trim()) return setRes(null);
    const t = setTimeout(async () => {
      const r = await Law.searchCorpus({ q, code, at });
      setOffline(r.offline);
      if (r.ok) setRes(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q, code, at]);

  const families = [...new Map(codes.map((c) => [c.family, c])).values()];
  const options = [
    ["", tr("كل النصوص")],
    ...families.flatMap((f) => {
      const members = codes.filter((c) => c.family === f.family);
      return members.length > 1
        ? [
            [f.family, tr("{0} (حسب التاريخ)", [f.family])],
            ...members.map((m) => [m.slug, m.titleAr]),
          ]
        : [[f.slug, f.titleAr]];
    }),
  ];
  const empty = codes.length > 0 && codes.every((c) => !c.articleCount);
  const picked = codes.find((c) => c.slug === code); // a single code (not a family or "all") can be browsed as an outline
  const [marks, setMarks] = useState([]);
  useEffect(() => { Law.bookmarks().then((r) => r.ok && setMarks(r.data.bookmarks)); }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("الفصل 77، المادة ٣٢، أو كلمات من النص")}
        />
        <MagnifyingGlass
          className="law-muted pointer-events-none absolute end-3 top-3"
          size={20}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          options={options}
          aria-label={tr("النص")}
        />
        <Field label="">
          <Input
            type="date"
            dir="ltr"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            aria-label={tr("بتاريخ")}
          />
        </Field>
      </div>
      {offline && (
        <Notice tone="warn">
          {tr("البحث في النصوص يحتاج اتصالا بالخادم.")}
        </Notice>
      )}
      {picked && !q.trim() && <CodeTree slug={picked.slug} at={at} />}
      {!q.trim() && !picked && marks.length > 0 && (
        <section aria-label={tr("المحفوظات")} className="law-card p-3">
          <h2 className="mb-2 font-bold">{tr("المحفوظات")}</h2>
          <ul>{marks.map((b) => (
            <li key={b.canonicalId}><Link to={`/law/corpus/a/${encodeURIComponent(b.canonicalId)}?at=${at}`} className="flex items-center justify-between gap-2 py-1.5 no-underline"><span className="font-semibold"><bdi>{b.code.numberingLabel} <bdi dir="ltr">{b.number}</bdi></bdi></span><span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi>{b.code.titleAr}</bdi></span></Link></li>
          ))}</ul>
        </section>
      )}
      {!q.trim() && !picked && !empty && marks.length === 0 && <Notice>{tr("اختر نصاً من القائمة لتصفح فصوله، أو ابحث برقم الفصل أو بكلمات من كل النصوص.")}</Notice>}
      {empty && (
        <EmptyState title={tr("لم تُستورد أي نصوص بعد")}>
          {tr(
            "استورد النصوص الرسمية (PDF من الجريدة الرسمية أو نص موحد) من تبويب «الاستيراد»، ثم راجع الفصول وأكدها."
          )}
        </EmptyState>
      )}
      {res && !res.results.length && !empty && (
        <Notice>
          {tr("لا نتائج في النصوص السارية بتاريخ")} {res.at}.
        </Notice>
      )}
      {res?.results.map((r) => (
        <Card key={r.canonicalId} className="p-0">
          <Link
            to={`/law/corpus/a/${encodeURIComponent(r.canonicalId)}?at=${at}`}
            className="flex flex-col gap-1.5 p-3"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-bold">
                <ArticleTitle
                  label={r.numberingLabel}
                  number={r.articleNumber}
                  codeTitle={r.codeTitle}
                />
              </span>
              <span className="law-muted shrink-0 text-[11px]">
                {TIER_LABELS[r.tierName]}
              </span>
            </span>
            <span className="line-clamp-3 text-sm leading-7">{r.snippet}</span>
            <VerifiedBadge verified={r.verifiedByUser} />
          </Link>
        </Card>
      ))}
    </div>
  );
}
