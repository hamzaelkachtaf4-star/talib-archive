import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme, getTheme, setTheme as persistTheme } from "@/components/LawOS/lib/prefs";

const Ctx = createContext({ mode: "system", resolved: "light", setMode: () => {} });
const mq = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);

/** mode: light | dark | system. Applies data-law-theme (lawos.css) and tracks the OS scheme while on "system". */
export function LawThemeProvider({ children }) {
  const [mode, setModeState] = useState(getTheme);
  const [systemDark, setSystemDark] = useState(() => !!mq()?.matches);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = (e) => setSystemDark(e.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  useEffect(() => applyTheme(mode), [mode]);
  const setMode = useCallback((next) => { persistTheme(next); setModeState(getTheme()); }, []);
  const value = useMemo(() => ({ mode, setMode, resolved: mode === "light" ? "light" : "dark" }), [mode, setMode, systemDark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLawTheme = () => useContext(Ctx);
