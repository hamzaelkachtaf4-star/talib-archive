import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CaretDown, CaretRight, ChatsCircle, DownloadSimple, CheckCircle, Funnel, Star, ArrowSquareOut } from "@phosphor-icons/react";
import Law from "@/models/law";
import { PageTitle } from "@/components/LawOS/EmptyState";
import LibraryFinder from "@/components/LawOS/Corpus/LibraryFinder";
import Chip from "@/components/LawOS/kit/Chip";
import { Notice } from "@/components/LawOS/ui";
import { listSaved, saveCode, removeCode } from "@/components/LawOS/lib/legalOffline";
import { lang, tr } from "@/components/LawOS/lib/i18n";

const titleOf = (c) => (lang() === "en" ? c.titleEn || c.titleFr || c.titleAr : lang() === "fr" ? c.titleFr || c.titleAr : c.titleAr);
const categoryTitle = (k) => (lang() === "fr" ? k.titleFr : lang() === "en" ? k.titleEn : k.titleAr);
const groupTitle = (g) => (lang() === "fr" ? g.titleFr : lang() === "en" ? g.titleEn : g.titleAr);
const dateFmt = (d) => <bdi dir="ltr">{d}</bdi>;

// Official publication portals (checked reachable). No deep links: a wrong article of the Bulletin Officiel is worse than none.
const PORTALS = [
  ["https://www.sgg.gov.ma/arabe/Accueil.aspx", () => tr("الأمانة العامة للحكومة: الجريدة الرسمية")],
  ["https://adala.justice.gov.ma/", () => tr("عدالة: بوابة وزارة العدل")],
];
// The national norm pyramid, top to bottom. Ratified conventions prevail over national laws (Constitution preamble), so they get their own block below instead of a tier here.
const PYRAMID = ["constitution", "organic-laws", "framework-laws", "ordinary-laws-codes", "decrees", "orders-regulatory-decisions"];

function Row({ code, saved, onSave, onRemove, busy }) {
  const isIngested = (code.articleCount || 0) > 0;
  const isRepealed = code.status === "repealed";
  const isPending = code.status === "in_force_pending";
  const isValidated = code.status === "validated_pending_publication";

  return (
    <li
      className="flex items-center gap-3 py-2"
      style={{
        borderBottom: "1px solid var(--law-border)",
        opacity: isRepealed ? 0.65 : 1,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold"><bdi>{titleOf(code)}</bdi></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: "var(--law-muted)" }}>
          {isIngested ? (
            <span><bdi dir="ltr">{code.articleCount}</bdi> {tr("مادة")}</span>
          ) : (
            <span>{code.ref || tr("نص مرجعي")}</span>
          )}
          {code.dahir ? (
            <span>· {tr("ظهير")} <bdi dir="ltr">{code.dahir}</bdi></span>
          ) : (
            !isRepealed && !isIngested && <span>· {tr("ظهير")}: {tr("قيد التحقق")}</span>
          )}
          {code.date && <span>· {dateFmt(code.date)}</span>}
          {code.consolidatedAsOf && <span>· {tr("محيّن إلى")} {dateFmt(code.consolidatedAsOf)}</span>}
          {code.bo && !/^https:\/\//.test(code.sourceUrl || "") && (
            <a href={PORTALS[0][0]} target="_blank" rel="noopener noreferrer" style={{ color: "var(--law-primary)" }}>
              · {tr("الجريدة الرسمية")} <bdi dir="ltr">{code.bo}</bdi>
            </a>
          )}
          {/^https:\/\//.test(code.sourceUrl || "") && (
            <a href={code.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--law-primary)" }}>
              · {tr("المصدر")}
            </a>
          )}
          {isIngested && <Chip tone="ok">{tr("نص كامل")}</Chip>}
          {isRepealed && <Chip tone="muted">{tr("منسوخ")}</Chip>}
          {isPending && <Chip tone="warn">{tr("لم يدخل حيز التنفيذ بعد")}</Chip>}
          {isValidated && <Chip tone="warn">{tr("في انتظار النشر")}</Chip>}
          {!isIngested && !isRepealed && !isPending && !isValidated && (
            <Chip tone="muted">{tr("مرجع")}</Chip>
          )}
          {code.verify && <Chip tone="warn">{tr("قيد التحقق")}</Chip>}
          {code.watch && <Chip tone="warn">{tr("قيد المتابعة")}</Chip>}
          {!code.reviewed && isIngested && <Chip>{tr("نص قيد التدقيق")}</Chip>}
          {code.implements && (
            <span className="text-xs" style={{ color: "var(--law-muted)" }}>
              · {tr("يطبق")}: <bdi dir="ltr">{code.implements}</bdi>
            </span>
          )}
          {code.replacedByTitle && (
            <span className="text-xs" style={{ color: "var(--law-muted)" }}>
              ({tr("عُوّض بـ")} {code.replacedByTitle})
            </span>
          )}
        </p>
      </div>
      {isIngested && (
        <Link to={`/law/library/corpus?code=${encodeURIComponent(code.slug)}`} className="text-sm font-bold" style={{ color: "var(--law-primary)" }}>
          {tr("قراءة")}
        </Link>
      )}
      {isIngested && (
        <button
          type="button"
          disabled={busy}
          onClick={() => (saved ? onRemove(code.slug) : onSave(code.slug))}
          aria-label={saved ? tr("إزالة النسخة غير المتصلة") : tr("حفظ للقراءة دون اتصال")}
          title={saved ? tr("محفوظ دون اتصال") : tr("حفظ للقراءة دون اتصال")}
          className="p-2"
          style={{ color: saved ? "var(--law-ok)" : "var(--law-muted)" }}
        >
          {saved ? <CheckCircle size={22} weight="fill" /> : <DownloadSimple size={22} />}
        </button>
      )}
    </li>
  );
}

/** Legal texts only, organized across the authentic Moroccan constitutional hierarchy (7 tiers). */
export default function Library() {
  const [cats, setCats] = useState(null);
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState([]);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [onlyIngested, setOnlyIngested] = useState(false);
  const [lastAudit, setLastAudit] = useState("2026-10-14");
  const [nonBinding, setNonBinding] = useState(null);

  useEffect(() => {
    Law.corpusCatalog({ all: 1 }).then(async (r) => {
      const list = await listSaved().catch(() => []);
      setSaved(list);
      if (r.ok) {
        if (r.data.lastAudit) setLastAudit(r.data.lastAudit);
        if (r.data.nonBindingReferences) setNonBinding(r.data.nonBindingReferences);
        return setCats(r.data.categories || r.data.levels);
      }
      setOffline(true);
      setCats([
        {
          id: "saved",
          titleAr: tr("محفوظ دون اتصال"),
          titleFr: tr("محفوظ دون اتصال"),
          titleEn: tr("محفوظ دون اتصال"),
          entries: list.map((x) => ({
            slug: x.slug,
            titleAr: x.title || x.slug,
            titleFr: x.titleFr,
            status: "in_force",
            articleCount: x.count,
            reviewed: true,
            consolidatedAsOf: null,
          })),
        },
      ]);
      setOpen({ saved: true });
    });
  }, []);

  const isSaved = (slug) => saved.some((s) => s.slug === slug);
  const save = async (slug) => {
    setBusy(true);
    const r = await saveCode(slug);
    setBusy(false);
    setMsg(r.ok ? tr("تم الحفظ للقراءة دون اتصال.") : tr("تعذر الحفظ: يلزم اتصال."));
    setSaved(await listSaved());
  };
  const remove = async (slug) => {
    await removeCode(slug);
    setSaved(await listSaved());
  };

  const displayedCats = (cats || []).map((k) => {
    const entries = onlyIngested
      ? (k.entries || []).filter((c) => (c.articleCount || 0) > 0)
      : (k.entries || []);

    const groups = k.groups
      ? k.groups.map((g) => ({
          ...g,
          entries: onlyIngested
            ? (g.entries || []).filter((c) => (c.articleCount || 0) > 0)
            : (g.entries || []),
        }))
      : null;

    return { ...k, entries, groups };
  });

  const idOf = (k) => k.id || k.slug;
  const rankOf = (k) => { const i = PYRAMID.indexOf(idOf(k)); return i < 0 ? 99 : i; };
  const treaties = displayedCats.find((k) => idOf(k) === "treaties");
  const pyramidCats = displayedCats.filter((k) => idOf(k) !== "treaties").sort((a, b) => rankOf(a) - rankOf(b));
  // The 40 texts to know first (server list), in reading order, whichever tier or group they come from.
  const topEntries = (cats || [])
    .flatMap((k) => k.entries || [])
    .filter((e) => e.topRank >= 0)
    .sort((a, b) => a.topRank - b.topRank);
  const topTreaties = topEntries.filter((e) => e.normLevel === "TREATY");
  const topLaws = topEntries.filter((e) => e.normLevel !== "TREATY");
  const goTo = (id) => { setOpen((o) => ({ ...o, [id]: true })); setTimeout(() => document.getElementById(`tier-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

  return (
    <>
      <PageTitle sub={tr("نصوص قانونية رسمية بمصادرها")}>{tr("قوانين ومراجع")}</PageTitle>
      <LibraryFinder />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/law/library/chat"
          className="inline-flex items-center gap-2 text-sm font-bold"
          style={{ color: "var(--law-primary)" }}
        >
          <ChatsCircle size={20} aria-hidden="true" /> {tr("اسأل عن هذه النصوص")}
        </Link>
        <Link to="/law/library/graph" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--law-primary)" }}>
          {tr("خريطة المفاهيم والقواعد")}
        </Link>
        {!offline && (
          <button
            type="button"
            onClick={() => setOnlyIngested(!onlyIngested)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{
              background: onlyIngested ? "var(--law-primary)" : "var(--law-surface-2)",
              color: onlyIngested ? "var(--law-surface)" : "var(--law-text)",
            }}
          >
            <Funnel size={14} />
            {onlyIngested ? tr("المتاح للقراءة فقط") : tr("كل الهرم التشريعي")}
          </button>
        )}
      </div>

      {offline && <Notice tone="warn">{tr("بدون اتصال: تظهر النصوص المحفوظة فقط.")}</Notice>}
      {msg && <Notice tone="muted">{msg}</Notice>}

      {!offline && !onlyIngested && pyramidCats.length > 1 && (
        <nav aria-label={tr("هرم القواعد القانونية")} className="mb-4 grid gap-1.5" style={{ justifyItems: "center" }}>
          {pyramidCats.map((k, i) => (
            <button key={idOf(k)} type="button" onClick={() => goTo(idOf(k))} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold"
              style={{ inlineSize: `${42 + (i * 58) / Math.max(1, pyramidCats.length - 1)}%`, minInlineSize: "15rem", background: i === 0 ? "var(--law-accent)" : "var(--law-surface-2)", color: i === 0 ? "var(--law-on-accent)" : "var(--law-text)", border: "1px solid var(--law-border)" }}>
              <span className="min-w-0 truncate">{categoryTitle(k)}</span>
              <bdi dir="ltr" className="shrink-0 text-xs opacity-80">{(k.entries || []).length}</bdi>
            </button>
          ))}
          <p className="text-xs" style={{ color: "var(--law-muted)" }}>{tr("الأعلى يسمو على ما تحته: الدستور ثم التنظيمية ثم الإطار ثم العادي ثم المراسيم.")}</p>
        </nav>
      )}
      <div className="mb-4 flex flex-wrap gap-3 text-xs" aria-label={tr("البوابات الرسمية")}>
        {PORTALS.map(([href, label]) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold" style={{ color: "var(--law-primary)" }}>
            <ArrowSquareOut size={14} />{label()}
          </a>
        ))}
      </div>

      {pyramidCats.map((k) => {
        const fullCount = (k.entries || []).filter((e) => (e.articleCount || 0) > 0).length;
        const hasGroups = Array.isArray(k.groups) && k.groups.length > 0;
        return (
          <section key={k.id || k.slug} id={`tier-${k.id || k.slug}`} className="mb-3" aria-label={categoryTitle(k)}>
            <button
              type="button"
              aria-expanded={!!open[k.id || k.slug]}
              onClick={() => setOpen({ ...open, [k.id || k.slug]: !open[k.id || k.slug] })}
              className="law-card3d flex w-full items-center justify-between text-start"
            >
              <span className="font-bold">
                {categoryTitle(k)}{" "}
                <span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}>
                  (<bdi dir="ltr">{k.entries.length}</bdi>)
                  {fullCount > 0 && !onlyIngested && (
                    <span className="ms-1.5" style={{ color: "var(--law-ok)" }}>
                      · {fullCount} {tr("كامل")}
                    </span>
                  )}
                </span>
              </span>
              {open[k.id || k.slug] ? <CaretDown size={18} /> : <CaretRight size={18} className="law-flip" />}
            </button>
            {open[k.id || k.slug] && (
              <div className="px-2">
                {k.explainer && !onlyIngested && (
                  <div
                    className="my-2 rounded-lg p-3 text-xs leading-5"
                    style={{
                      background: "var(--law-surface-2)",
                      border: "1px solid var(--law-border)",
                      color: "var(--law-text)",
                    }}
                  >
                    <p className="font-semibold mb-1">
                      {lang() === "fr" ? k.explainer.fr : lang() === "en" ? k.explainer.en : k.explainer.ar}
                    </p>
                    {k.howToFind && (
                      <p style={{ color: "var(--law-muted)" }}>
                        {lang() === "fr" ? k.howToFind.fr : lang() === "en" ? k.howToFind.en : k.howToFind.ar}
                      </p>
                    )}
                  </div>
                )}
                {k.entries.length === 0 && (
                  <p className="py-3 text-sm" style={{ color: "var(--law-muted)" }}>
                    {tr("لا نصوص في هذا القسم بعد.")}
                  </p>
                )}
                {hasGroups && !onlyIngested ? (
                  k.groups.map((g) => (
                    <div key={g.id || g.slug} className="mb-3">
                      <h4
                        className="mt-3 mb-1 px-1 text-xs font-bold uppercase tracking-wider"
                        style={{ color: "var(--law-primary)" }}
                      >
                        {groupTitle(g)}{" "}
                        <span className="font-normal" style={{ color: "var(--law-muted)" }}>
                          ({g.entries.length})
                        </span>
                      </h4>
                      <ul>
                        {g.entries.map((c, i) => (
                          <Row
                            key={c.slug || `entry-${i}`}
                            code={c}
                            saved={isSaved(c.slug)}
                            onSave={save}
                            onRemove={remove}
                            busy={busy}
                          />
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <ul>
                    {k.entries.map((c, i) => (
                      <Row
                        key={c.slug || `entry-${i}`}
                        code={c}
                        saved={isSaved(c.slug)}
                        onSave={save}
                        onRemove={remove}
                        busy={busy}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      {!onlyIngested && topEntries.length > 0 && (
        <section id="tier-top40" className="mb-3" aria-label={tr("الاتفاقيات الدولية والقوانين المهمة")}>
          <button type="button" aria-expanded={!!open.top40} onClick={() => setOpen({ ...open, top40: !open.top40 })} className="law-card3d flex w-full items-center justify-between text-start">
            <span className="flex items-center gap-2 font-bold"><Star size={18} weight="fill" style={{ color: "var(--law-gold)" }} />{tr("الاتفاقيات الدولية والقوانين المهمة")} <span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}>(<bdi dir="ltr">{topEntries.length}</bdi>)</span></span>
            {open.top40 ? <CaretDown size={18} /> : <CaretRight size={18} className="law-flip" />}
          </button>
          {open.top40 && (
            <div className="px-2">
              <p className="my-2 text-xs leading-5" style={{ color: "var(--law-muted)" }}>{tr("أهم ما يجب أن تعرفه أولاً. كل نص يبقى أيضاً في درجته من الهرم.")}</p>
              {topTreaties.length > 0 && <h4 className="mt-3 mb-1 px-1 text-xs font-bold" style={{ color: "var(--law-primary)" }}>{tr("الاتفاقيات الدولية")}</h4>}
              <ul>{topTreaties.map((c) => <Row key={c.catalogSlug || c.slug} code={c} saved={isSaved(c.slug)} onSave={save} onRemove={remove} busy={busy} />)}</ul>
              <h4 className="mt-3 mb-1 px-1 text-xs font-bold" style={{ color: "var(--law-primary)" }}>{tr("النصوص الوطنية")}</h4>
              <ul>{topLaws.map((c) => <Row key={c.catalogSlug || c.slug} code={c} saved={isSaved(c.slug)} onSave={save} onRemove={remove} busy={busy} />)}</ul>
            </div>
          )}
        </section>
      )}

      {treaties && (treaties.groups?.length || treaties.entries?.length) > 0 && (
        <section id="tier-treaties" className="mb-3" aria-label={categoryTitle(treaties)}>
          <button type="button" aria-expanded={!!open.treaties} onClick={() => setOpen({ ...open, treaties: !open.treaties })} className="law-card3d flex w-full items-center justify-between text-start">
            <span className="font-bold">{tr("كل الاتفاقيات الدولية")} <span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}>(<bdi dir="ltr">{treaties.entries.length}</bdi>)</span></span>
            {open.treaties ? <CaretDown size={18} /> : <CaretRight size={18} className="law-flip" />}
          </button>
          {open.treaties && (
            <div className="px-2">
              {(treaties.groups?.length ? treaties.groups : [{ id: "all", entries: treaties.entries }]).map((g) => (
                <div key={g.id || g.slug} className="mb-3">
                  {g.titleAr && <h4 className="mt-3 mb-1 px-1 text-xs font-bold" style={{ color: "var(--law-primary)" }}>{groupTitle(g)}</h4>}
                  <ul>{g.entries.map((c, i) => <Row key={c.slug || `t-${i}`} code={c} saved={isSaved(c.slug)} onSave={save} onRemove={remove} busy={busy} />)}</ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {nonBinding && !onlyIngested && (
        <section className="mb-3" aria-label={lang() === "fr" ? nonBinding.title?.fr : lang() === "en" ? nonBinding.title?.en : nonBinding.title?.ar}>
          <button
            type="button"
            aria-expanded={!!open["non-binding"]}
            onClick={() => setOpen({ ...open, "non-binding": !open["non-binding"] })}
            className="law-card3d flex w-full items-center justify-between text-start"
            style={{ opacity: 0.9 }}
          >
            <span className="font-bold">
              {lang() === "fr" ? nonBinding.title?.fr : lang() === "en" ? nonBinding.title?.en : nonBinding.title?.ar}{" "}
              <span className="text-xs font-normal" style={{ color: "var(--law-muted)" }}>
                (<bdi dir="ltr">{nonBinding.items?.length || 0}</bdi>)
              </span>
            </span>
            {open["non-binding"] ? <CaretDown size={18} /> : <CaretRight size={18} className="law-flip" />}
          </button>
          {open["non-binding"] && (
            <div className="px-2">
              <p className="my-2 text-xs leading-5" style={{ color: "var(--law-muted)" }}>
                {lang() === "fr" ? nonBinding.note?.fr : lang() === "en" ? nonBinding.note?.en : nonBinding.note?.ar}
              </p>
              <ul>
                {(nonBinding.items || []).map((c, i) => (
                  <Row
                    key={c.slug || `nb-${i}`}
                    code={{ ...c, articleCount: 0 }}
                    saved={false}
                    onSave={() => {}}
                    onRemove={() => {}}
                    busy={false}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {!cats && <p className="py-4 text-sm" style={{ color: "var(--law-muted)" }}>…</p>}
      <p className="mb-4 mt-4 text-xs leading-6" style={{ color: "var(--law-muted)" }}>
        {tr("النص المرجعي هو المنشور في الجريدة الرسمية. آخر تدقيق للهرم القانوني:")} {dateFmt(lastAudit)}.
      </p>
      <footer className="text-xs">
        <Link to="/law/legal" style={{ color: "var(--law-muted)" }} className="underline">
          {tr("الإشعار القانوني")}
        </Link>
      </footer>
    </>
  );
}
