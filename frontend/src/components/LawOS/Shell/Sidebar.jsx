import { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { CaretDown, Flame } from "@phosphor-icons/react";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";
import { NAV_HUBS, PATH_HUB, isHubActive } from "@/navigation/nav.config";
import { loadModules } from "@/components/LawOS/lib/pathSync";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { useMyAvatar } from "@/components/LawOS/lib/myAvatar";
import ProgressRing from "@/components/LawOS/kit/ProgressRing";
import Avatar from "@/components/LawOS/kit/Avatar";
import AvatarArt from "@/components/LawOS/avatar/AvatarArt";

/** Study progress of the current semester: finished sessions over all sessions of the student's modules. */
function useStudyState() {
  const [s, setS] = useState({ semester: null, group: null, modules: [], progress: null });
  useEffect(() => {
    let live = true;
    Law.myAcademic()
      .then((a) => {
        const ac = (a.ok && a.data.academic) || {};
        return loadModules(ac.semester || "S3").then((r) => ({ ac, mods: r?.data?.modules || [] }));
      })
      .then(({ ac, mods }) => live && setS((x) => ({ ...x, semester: ac.semester || null, group: ac.groupCode || null, modules: mods })))
      .catch(() => {});
    Law.profile().then((r) => live && r.ok && setS((x) => ({ ...x, progress: r.data?.progress || null })));
    return () => { live = false; };
  }, []);
  return s;
}

/** Desktop sidebar (>=1024px): student card with progress ring, the five hubs, and the study-path accordion. */
export default function Sidebar() {
  const { pathname } = useLocation();
  const user = useLawUser();
  const avatarCfg = useMyAvatar();
  const { semester, group, modules, progress } = useStudyState();
  const [open, setOpen] = useState(false);
  const done = modules.reduce((n, m) => n + (m.completed || 0), 0);
  const total = modules.reduce((n, m) => n + (m.total || 0), 0);
  const pct = total ? Math.round((100 * done) / total) : 0;
  const name = user?.fullName || user?.email || "";

  return (
    <aside aria-label={tr("التنقل الرئيسي")} className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-4 overflow-y-auto p-4 lg:flex" style={{ background: "var(--law-surface)", borderInlineEnd: "1px solid var(--law-border)" }}>
      <Link to="/law/profile" className="flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
        <ProgressRing value={done} max={total} size={64} stroke={6} color="var(--law-accent)" label={tr("التقدم")}>
          {avatarCfg ? <AvatarArt config={avatarCfg} size={44} title={name} /> : <Avatar name={name} size={44} />}
        </ProgressRing>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold"><bdi>{name}</bdi></span>
          <span className="block truncate text-xs" style={{ color: "var(--law-muted)" }}>
            {[semester, group].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && " · "}<bdi>{x}</bdi></span>)}
          </span>
          {progress && (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="whitespace-nowrap rounded-full px-2 py-0.5" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}>
                {tr("المستوى")} <bdi dir="ltr">{progress.level?.level ?? 1}</bdi>
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: "var(--law-gold-ink)" }}>
                <Flame size={14} weight="fill" />
                <bdi dir="ltr">{Number(progress.xp || 0).toLocaleString("en")}</bdi> XP
              </span>
            </span>
          )}
        </span>
      </Link>
      {total > 0 && (
        <p className="-mt-2 px-1 text-xs" style={{ color: "var(--law-muted)" }}>
          {tr("الحصص")} <bdi dir="ltr">{done}/{total}</bdi>
        </p>
      )}

      <nav className="flex flex-col gap-1">
        {NAV_HUBS.map((hub) => {
          const active = isHubActive(hub, pathname);
          return (
            <NavLink key={hub.id} to={hub.to} aria-current={active ? "page" : undefined} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors"
              style={active ? { background: "var(--law-accent)", color: "var(--law-on-accent)" } : { color: "var(--law-text)" }}>
              <hub.Icon size={20} weight={active ? "fill" : "regular"} />
              <span className="min-w-0 truncate">{hub.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl" style={{ border: "1px solid var(--law-border)" }}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-bold">
          <PATH_HUB.Icon size={18} />
          <span className="flex-1 truncate text-start">{PATH_HUB.label}{semester && <> (<bdi dir="ltr">{semester}</bdi>)</>}</span>
          {total > 0 && <span className="whitespace-nowrap text-xs" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">{pct}%</bdi></span>}
          <CaretDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </button>
        {open && (
          <ul className="flex flex-col gap-1 px-2 pb-2">
            {modules.map((m) => (
              <li key={m.id}>
                <Link to="/law/path" className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs">
                  <span className="truncate"><bdi>{m.title}</bdi></span>
                  <bdi dir="ltr" className="shrink-0" style={{ color: "var(--law-muted)" }}>{m.completed}/{m.total}</bdi>
                </Link>
              </li>
            ))}
            {!modules.length && <li className="px-2 py-1.5 text-xs" style={{ color: "var(--law-muted)" }}>{tr("لا مواد بعد")}</li>}
            <li><Link to="/law/path" className="block px-2 py-1.5 text-xs font-bold" style={{ color: "var(--law-accent)" }}>{tr("فتح المسار الدراسي")}</Link></li>
          </ul>
        )}
      </div>
    </aside>
  );
}
