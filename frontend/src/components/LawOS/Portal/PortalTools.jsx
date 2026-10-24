import { useEffect, useRef, useState } from "react";
import { Desktop, Globe, Moon, Sun } from "@phosphor-icons/react";
import { getTheme, setTheme } from "@/components/LawOS/lib/prefs";
import { LANGUAGES, lang, setLang, tr } from "@/components/LawOS/lib/i18n";

const NEXT = { system: "light", light: "dark", dark: "system" };
const ICON = { system: Desktop, light: Sun, dark: Moon };
const NAME = () => ({ system: tr("تلقائي"), light: tr("فاتح"), dark: tr("داكن") });

/** Portal header tools: theme cycle (auto → light → dark) and a language menu (globe). Work logged out via localStorage. */
export default function PortalTools() {
  const [theme, setT] = useState(getTheme());
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const Icon = ICON[theme];
  return (
    <div className="portal-hdr-tools" ref={ref} style={{ position: "relative" }}>
      <button type="button" className="portal-hdr-tool" aria-label={`${tr("المظهر")}: ${NAME()[theme]}`} title={NAME()[theme]}
        onClick={() => { const n = NEXT[theme]; setTheme(n); setT(n); }}>
        <Icon size={22} />
      </button>
      <button type="button" className="portal-hdr-tool" aria-haspopup="menu" aria-expanded={open} aria-label={tr("اللغة")} onClick={() => setOpen((o) => !o)}>
        <Globe size={22} />
      </button>
      {open && (
        <div role="menu" className="portal-menu">
          {Object.entries(LANGUAGES).map(([code, { label, dir }]) => (
            <button key={code} type="button" role="menuitemradio" aria-checked={code === lang()} dir={dir} lang={code === "ary" ? "ar-MA" : code} onClick={() => setLang(code)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
