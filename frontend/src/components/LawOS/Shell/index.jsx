import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, CloudSlash, Flame, UserCircle, GearSix, SignOut as SignOutIcon, MagnifyingGlass, Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import useOnline from "../lib/useOnline";
import { onQueueChange, pendingCount } from "../lib/reviewSync";
import { useSignOut } from "../Settings/SignOut";
import { getMeta } from "../lib/idb";
import { lang, langInfo, tr } from "@/components/LawOS/lib/i18n";
import { SECONDARY_LINKS } from "@/navigation/nav.config";
import { getTheme, setTheme, THEME_EVENT } from "../lib/prefs";
import Sidebar from "./Sidebar";
import BrandLogo from "../kit/BrandLogo";
import Avatar from "../kit/Avatar";
import AvatarArt from "../avatar/AvatarArt";
import { useMyAvatar } from "../lib/myAvatar";
import { useLawUser } from "../lib/useLawUser";
import Law from "@/models/law";
import { setOnboarded, nudgeDismissed, dismissNudge } from "../lib/onboarding";
import { startTtAutoSync } from "../lib/timetableSync";
import { flushModuleLinks } from "../lib/moduleLinks";
import LegalConsentModal from "../Legal/LegalConsentModal";
import QrEntry from "../qr/QrEntry";
import BottomNav from "./BottomNav";
import NotificationPopover from "../notifications/NotificationPopover";



function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <span role="status" className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--law-surface-2)", color: "var(--law-warn)" }}>
      <CloudSlash size={14} weight="bold" />
      {tr("بدون اتصال")}
    </span>
  );
}

function PendingBadge() {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    pendingCount().then(setPending).catch(() => {});
    return onQueueChange(setPending);
  }, []);
  if (!pending) return null;
  return (
    <span role="status" className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--law-surface-2)" }} title={tr("مراجعات بانتظار المزامنة")}>
      ⇅ <bdi dir="ltr">{pending}</bdi>
    </span>
  );
}

/** Streak from the cached Today snapshot (works offline); refreshed whenever Today stores a new one. */
function StreakChip() {
  const [n, setN] = useState(null);
  const { pathname } = useLocation();
  useEffect(() => {
    getMeta("today").then((t) => setN(t?.streak?.current ?? null)).catch(() => {});
  }, [pathname]);
  if (n == null) return null;
  return (
    <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold" style={{ background: "var(--law-surface-2)" }} title={tr("أيام المواظبة")}>
      <Flame size={16} weight="fill" style={{ color: "var(--law-gold-ink)" }} />
      <bdi dir="ltr">{n}</bdi>
    </span>
  );
}

/** Notification bell: unread badge; opens the notification popover in place (no navigation). */
export function NotificationBell() {
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { Law.notifications().then((r) => r.ok && setN(r.data.unread)); }, [pathname]);
  return (
    <div className="relative">
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${tr("الإشعارات")}${n ? ` (${n})` : ""}`} className="relative flex h-11 w-11 items-center justify-center rounded-full" style={{ color: "var(--law-muted)" }}>
        <Bell size={22} />
        {n > 0 && <span className="absolute top-1 rounded-full px-1 text-[10px] font-bold" style={{ insetInlineEnd: 2, background: "var(--law-danger)", color: "var(--law-bg)" }}><bdi dir="ltr">{n > 9 ? "9+" : n}</bdi></span>}
      </button>
      <NotificationPopover open={open} onClose={() => setOpen(false)} anchorRef={ref} onUnread={setN} />
    </div>
  );
}

function AvatarMenu({ align = "end" }) {
  const user = useLawUser();
  const avatarCfg = useMyAvatar();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const signOut = useSignOut();
  const [themeMode, flipTheme] = useThemeMode();
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm font-semibold";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={tr("الحساب")} className="flex h-11 w-11 items-center justify-center rounded-full">
        {avatarCfg ? <AvatarArt config={avatarCfg} size={36} title={user?.fullName} /> : <Avatar name={user?.fullName || user?.email || ""} size={36} />}
      </button>
      {open && (
        <div role="menu" className="absolute z-30 mt-1 w-52 rounded-xl p-1 shadow-lg" style={{ [align === "start" ? "insetInlineStart" : "insetInlineEnd"]: 0, background: "var(--law-surface)", border: "1px solid var(--law-border)" }}>
          <Link role="menuitem" to="/law/profile" onClick={() => setOpen(false)} className={item}><UserCircle size={20} />{tr("الملف الشخصي")}</Link>
          {SECONDARY_LINKS.map((l) => <Link key={l.id} role="menuitem" to={l.to} onClick={() => setOpen(false)} className={item}><l.Icon size={20} />{l.label}</Link>)}
          <button role="menuitem" type="button" onClick={() => { flipTheme(); setOpen(false); }} className={item}>{themeMode === "dark" ? <Sun size={20} /> : <Moon size={20} />}{themeMode === "dark" ? tr("الوضع النهاري") : tr("الوضع الليلي")}</button>
          <Link role="menuitem" to="/law/settings" onClick={() => setOpen(false)} className={item}><GearSix size={20} />{tr("الإعدادات")}</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); signOut.ask(); }} className={item} style={{ color: "var(--law-danger)" }}><SignOutIcon size={20} />{tr("تسجيل الخروج")}</button>
        </div>
      )}
      {signOut.sheet}
    </div>
  );
}


/** Global search: sends the query to the legal library search. */
function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);
  const go = (e) => { e.preventDefault(); const t = q.trim(); if (t) { navigate(`/law/library/corpus?tab=search&q=${encodeURIComponent(t)}`); setQ(""); } };
  return (
    <form onSubmit={go} role="search" className="hidden min-w-0 max-w-md flex-1 md:block">
      <label className="flex items-center gap-2 rounded-xl px-3" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
        <MagnifyingGlass size={18} style={{ color: "var(--law-muted)" }} />
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث عن مادة، درس، أو فصل قانوني...")} aria-label={tr("بحث")} className="min-h-[40px] min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <kbd className="hidden whitespace-nowrap text-xs lg:inline" style={{ color: "var(--law-muted)" }}><bdi dir="ltr">⌘K</bdi></kbd>
      </label>
    </form>
  );
}

/** Current mode ("dark" | "light") and a flip function; stays in step with every other toggle through THEME_EVENT. */
function useThemeMode() {
  const read = () => (getTheme() === "light" ? "light" : "dark");
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const on = () => setMode(read());
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  return [mode, () => setTheme(mode === "dark" ? "light" : "dark")];
}

/** Light / night toggle. Dark Navy is the default; the OS colour scheme never changes it (Brain L-0049). */
function ThemeToggle() {
  const [mode, flip] = useThemeMode();
  return (
    <button type="button" onClick={flip} aria-pressed={mode === "dark"} aria-label={mode === "dark" ? tr("الوضع النهاري") : tr("الوضع الليلي")} className="flex h-11 w-11 items-center justify-center rounded-full" style={{ color: "var(--law-muted)" }}>
      {mode === "dark" ? <Sun size={22} /> : <Moon size={22} />}
    </button>
  );
}

/**
 * One brand per screen. Desktop (RTL): logo and profile avatar at the inline-start (right), the four hubs in the middle,
 * bell and QR at the inline-end (left). On phones the avatar moves to the end cluster and the hubs sit in the bottom bar.
 */
function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 lg:px-8" style={{ background: "var(--law-bg)", borderBottom: "1px solid var(--law-border)" }}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-lg font-bold" style={{ color: "var(--law-primary)" }}><BrandLogo size={28} /></span>
      </div>
      <GlobalSearch />
      <div className="flex items-center gap-2">
        <PendingBadge />
        <OfflineBadge />
        <StreakChip />
        <NotificationBell />
        <span className="hidden sm:block"><ThemeToggle /></span>
        <QrEntry />
        <AvatarMenu />
      </div>
    </header>
  );
}

/** New students go through /law/welcome once; existing ones with a missing academic profile get one dismissible nudge. */
function OnboardingGate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [nudge, setNudge] = useState(false);
  const checked = useRef(false);
  useEffect(() => {
    if (pathname.startsWith("/law/welcome") || checked.current) return;
    let live = true;
    Law.onboarding().then((r) => {
      if (!live || !r.ok) return; // offline or error: never block the app
      checked.current = true;
      if (!r.data.completed) return navigate("/law/welcome", { replace: true }); // the server is authoritative
      setOnboarded();
      setNudge(r.data.academicMissing && !nudgeDismissed());
    });
    return () => { live = false; };
  }, [pathname, navigate]);
  useEffect(() => {
    startTtAutoSync();
    // Captures linked to a module while offline are linked as soon as the connection is back, wherever the student is.
    flushModuleLinks();
    const online = () => flushModuleLinks();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  if (!nudge) return null;
  return (
    <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--law-surface-2)", border: "1px solid var(--law-border)" }}>
      <span>{tr("أكمل ملفك الدراسي (الكلية، الشعبة، الفصل) لتفعيل الجدول والتوصيات.")}</span>
      <span className="flex shrink-0 gap-2">
        <Link to="/law/welcome?condensed=1" className="font-bold" style={{ color: "var(--law-primary)" }}>{tr("إكمال")}</Link>
        <button type="button" onClick={() => { dismissNudge(); setNudge(false); }} aria-label={tr("إخفاء")}>×</button>
      </span>
    </div>
  );
}

export default function Shell() {
  const { pathname } = useLocation();
  const [wide, setWide] = useState(() => window.matchMedia?.("(min-width: 1024px)").matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.("(min-width: 1024px)");
    if (!m) return;
    const on = (e) => setWide(e.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  if (pathname.startsWith("/law/welcome"))
    return (
      <div dir={langInfo().dir} lang={lang()} className="lawos-root px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <Outlet />
        <LegalConsentModal />
      </div>
    );
  return (
    <div dir={langInfo().dir} lang={lang()} className="lawos-root flex">
      {wide && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-8" style={{ maxInlineSize: pathname.startsWith("/law/today") || pathname.startsWith("/law/timetable") ? "var(--law-content-wide)" : "var(--law-content-max)" }}>
          <OnboardingGate />
          <Outlet />
        </main>
      </div>
      <BottomNav />
      {/* Inside .lawos-root so it gets the theme variables. */}
      <LegalConsentModal />
    </div>
  );
}
