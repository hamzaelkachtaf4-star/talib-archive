import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Input, Notice } from "../ui";
import { ArticleTitle } from "./shared";
import { parseCitation } from "../lib/citation";
import { findSavedArticle } from "../lib/legalOffline";
import { getMeta } from "../lib/idb";

import { tr } from "@/components/LawOS/lib/i18n";

export const RECENTS_KEY = "libraryRecents";
const articleHref = (id) => `/law/corpus/a/${encodeURIComponent(id)}`;

function ArticleRow({ canonicalId, label, hint }) {
  return (
    <li>
      <Link to={articleHref(canonicalId)} className="flex items-center justify-between gap-2 py-2 no-underline" style={{ borderBottom: "1px solid var(--law-border)" }}>
        <span className="font-semibold"><bdi>{label}</bdi></span>
        {hint && <span className="text-xs" style={{ color: "var(--law-muted)" }}><bdi>{hint}</bdi></span>}
      </Link>
    </li>
  );
}

/**
 * The Library's opening state: one search box that understands citations («م 230 د.ع»), the articles opened last,
 * and the articles linked to the student's modules. The 7-level tree stays below, collapsed.
 */
export default function LibraryFinder() {
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null); // {state: "ok"|"missing"|"many", ...}
  const [recents, setRecents] = useState([]);
  const [moduleTexts, setModuleTexts] = useState([]);

  useEffect(() => {
    let live0 = true;
    getMeta(RECENTS_KEY).then((r) => live0 && Array.isArray(r) && setRecents(r)).catch(() => {});
    let live = true;
    Law.moduleList().then(async (r) => {
      if (!r.ok || !live) return;
      const mods = (r.data?.modules || []).slice(0, 8);
      const lists = await Promise.all(mods.map((m) => Law.moduleArticles(m.id).then((x) => (x.ok ? x.data?.articles || [] : []))));
      if (!live) return;
      setModuleTexts(mods.map((m, i) => ({ id: m.id, title: m.title, articles: lists[i] })).filter((m) => m.articles.length));
    });
    return () => { live = false; live0 = false; };
  }, []);

  useEffect(() => {
    const cite = parseCitation(q);
    setFound(null); // never leave the previous article tappable while the new one loads
    if (cite.kind !== "citation") return undefined;
    let live = true;
    const t = setTimeout(async () => {
      if (cite.slug) {
        const canonicalId = `${cite.slug}:${cite.number}`;
        const r = await Law.article(canonicalId);
        if (!live) return;
        if (r.ok) return setFound({ state: "ok", canonicalId: r.data.article.canonicalId || canonicalId, label: <ArticleTitle label={r.data.article.code.numberingLabel} number={r.data.article.articleNumber} />, hint: r.data.article.code.titleAr });
        if (r.offline) {
          const f = await findSavedArticle(canonicalId);
          if (!live) return;
          if (f) return setFound({ state: "ok", canonicalId, label: <ArticleTitle label={f.code.numberingLabel} number={f.article.articleNumber} />, hint: f.code.titleAr });
          return setFound({ state: "offline" });
        }
        return setFound(r.status === 404 ? { state: "missing", number: cite.number } : { state: "error" });
      }
      const r = await Law.searchCorpus({ q: cite.number });
      if (!live) return;
      if (r.offline) return setFound({ state: "offline" });
      if (!r.ok) return setFound({ state: "error" });
      const hits = r.data.results.filter((x) => x.tierName === "number");
      setFound(hits.length ? { state: "many", hits } : { state: "missing", number: cite.number });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const typing = q.trim().length > 0;
  return (
    <div role="search" aria-label={tr("بحث في النصوص")} className="mb-5">
      <div className="relative">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("م 230 د.ع، الفصل 77 من الدستور، أو كلمات من النص")}
          aria-label={tr("بحث في النصوص")}
        />
        <MagnifyingGlass className="pointer-events-none absolute end-3 top-3" size={20} style={{ color: "var(--law-muted)" }} />
      </div>

      {typing && (
        <div className="mt-2">
          {found?.state === "ok" && <ul><ArticleRow canonicalId={found.canonicalId} label={found.label} hint={found.hint} /></ul>}
          {found?.state === "many" && <ul>{found.hits.map((h) => <ArticleRow key={h.canonicalId} canonicalId={h.canonicalId} label={<ArticleTitle label={h.numberingLabel} number={h.articleNumber} />} hint={h.codeTitle} />)}</ul>}
          {found?.state === "missing" && <Notice tone="warn">{tr("هذا الفصل غير موجود في النص المستورد: قد يكون منسوخاً أو لم يُقرأ من المصدر.")}</Notice>}
          {found?.state === "error" && <Notice tone="warn">{tr("تعذر البحث الآن. حاول مجدداً بعد قليل.")}</Notice>}
          {found?.state === "offline" && <Notice tone="warn">{tr("بدون اتصال: يظهر ما حفظته للقراءة فقط.")}</Notice>}
          <Link to={`/law/library/corpus?q=${encodeURIComponent(q.trim())}`} className="mt-2 inline-block text-sm font-bold" style={{ color: "var(--law-primary)" }}>
            {tr("بحث نصي في كل النصوص")}
          </Link>
        </div>
      )}

      {!typing && recents.length > 0 && (
        <div className="mt-3">
          <h2 className="mb-1 text-sm font-bold">{tr("آخر ما قرأت")}</h2>
          <ul>{recents.map((r) => <ArticleRow key={r.canonicalId} canonicalId={r.canonicalId} label={r.label} />)}</ul>
        </div>
      )}

      {!typing && moduleTexts.length > 0 && (
        <div className="mt-3">
          <h2 className="mb-1 text-sm font-bold">{tr("نصوص موادي")}</h2>
          {moduleTexts.map((m) => (
            <div key={m.id} className="mb-2">
              <p className="text-xs font-semibold" style={{ color: "var(--law-muted)" }}><bdi>{m.title}</bdi></p>
              <ul>{m.articles.map((a) => <ArticleRow key={a.canonicalId} canonicalId={a.canonicalId} label={<ArticleTitle label={a.code.numberingLabel} number={a.number} />} hint={a.code.titleAr} />)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
