import { useEffect } from "react";
import LawRoute from "@/components/LawOS/LawRoute";
import Shell from "@/components/LawOS/Shell";
import { registerLawServiceWorker } from "@/components/LawOS/lib/serviceWorker";
import { startAutoSync } from "@/components/LawOS/lib/reviewSync";
import { startAutoUpload } from "@/components/LawOS/lib/captureQueue";
import { lawPrefetchers } from "./routes";
import "@/components/LawOS/lawos.css";
import { applyDocumentLang } from "@/components/LawOS/lib/i18n";
import { LawThemeProvider } from "@/theme/LawThemeProvider";
import { applyTheme } from "@/components/LawOS/lib/prefs";
import { syncPrefsOnMount } from "@/components/LawOS/lib/prefsSync";

/**
 * Root of every /law/* page: auth guard (offline-tolerant) + RTL shell.
 * Sets the document language/direction while LAW-OS is mounted and restores upstream's on leave.
 */
export default function LawOSLayout() {
  useEffect(() => {
    const restoreLang = applyDocumentLang();
    applyTheme();
    syncPrefsOnMount(); // server preferences win unless this device has unsent changes
    registerLawServiceWorker(lawPrefetchers);
    startAutoSync();
    startAutoUpload();
    return () => {
      restoreLang();
    };
  }, []);

  return (
    <LawThemeProvider>
      <LawRoute>
        <Shell />
      </LawRoute>
    </LawThemeProvider>
  );
}
