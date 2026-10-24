import { NavLink, useLocation } from "react-router-dom";
import { tr } from "@/components/LawOS/lib/i18n";

/** Faculty forum (ملتقى الكلية): the wall, the public notes and projects, the friends. */
export const FORUM_TABS = () => [
  { to: "/law/community/campus", label: tr("جدار الكلية") },
  { to: "/law/community/hub", label: tr("الملخصات والمشاريع العامة") },
  { to: "/law/community/friends", label: tr("الأصدقاء") },
];

/** Reading groups (مجموعات القراءة) have their own hub: the squad and its shared documents. */
export const SQUAD_TABS = () => [
  { to: "/law/community/squads", label: tr("فرقتي") },
  { to: "/law/squad/docs", label: tr("وثائق الفرقة") },
];

const inSquads = (p) => p.startsWith("/law/community/squads") || p.startsWith("/law/squad");

export default function CommunityTabs() {
  const { pathname } = useLocation();
  const tabs = inSquads(pathname) ? SQUAD_TABS() : FORUM_TABS();
  return (
    <nav aria-label={inSquads(pathname) ? tr("مجموعات القراءة") : tr("ملتقى الكلية")} className="mb-4 flex gap-2 overflow-x-auto">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={!t.to.endsWith("/hub")} className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold no-underline"
          style={({ isActive }) => (isActive ? { background: "var(--law-primary)", color: "var(--law-on-primary)" } : { background: "var(--law-surface-2)", border: "1px solid var(--law-border)", color: "var(--law-text)" })}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
