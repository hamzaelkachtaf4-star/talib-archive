import { NavLink, useLocation } from "react-router-dom";
import { tr } from "@/components/LawOS/lib/i18n";
import { NAV_HUBS, MOBILE_BAR_IDS, isHubActive } from "@/navigation/nav.config";
import { isNativeApp } from "@/hooks/useDeviceClass";

// A short haptic tick, only inside the Android wrapper (never on the web).
const tick = () => { if (isNativeApp()) navigator.vibrate?.(8); };

const item = "law-tap flex min-h-[64px] flex-col items-center justify-center gap-1 truncate text-[10px] font-semibold leading-tight";

/** Bottom bar below 1024px: the five hubs. */
export default function BottomNav() {
  const { pathname } = useLocation();
  const bar = MOBILE_BAR_IDS.map((id) => NAV_HUBS.find((h) => h.id === id));

  return (
    <nav aria-label={tr("التنقل الرئيسي")} className="law-safe-bottom fixed inset-x-0 bottom-0 z-20 lg:hidden" style={{ background: "var(--law-surface)", borderTop: "1px solid var(--law-border)" }}>
        <ul className="mx-auto flex max-w-xl items-end justify-around px-1">
          {bar.map((hub) => {
            const active = isHubActive(hub, pathname);
            return (
              <li key={hub.id} className="min-w-0 flex-1">
                <NavLink to={hub.to} onClick={tick} aria-current={active ? "page" : undefined} className={item} style={{ color: active ? "var(--law-primary)" : "var(--law-muted)" }}>
                  <hub.Icon size={24} weight={active ? "fill" : "regular"} />
                  <span className="max-w-full truncate">{hub.short || hub.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
    </nav>
  );
}
