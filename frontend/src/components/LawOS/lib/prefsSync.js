// Device <-> server preference sync (spec §3.1). Rules:
//  - Every write sends the device's theme/locale/sound together with the changed field, so the first PATCH never
//    creates a server row full of defaults that later overwrite the device.
//  - A write that fails (offline) marks the device dirty; the next successful mount pushes instead of pulling.
//  - A locale reload happens at most once per tab session (blocked storage can't cause a reload loop).
import Law from "@/models/law";
import { getTheme, setTheme, soundOn, setSound } from "./prefs";
import { lang, setLang } from "./i18n";

const DIRTY = "lawos_prefs_dirty";
const RELOADED = "lawos_locale_reloaded";
const flag = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const isDirty = () => { try { return localStorage.getItem(DIRTY) === "1"; } catch { return false; } };

const snapshot = () => ({ theme: getTheme(), locale: lang(), soundEnabled: soundOn() });

/** Push a change (plus the device snapshot). Resolves true when the server accepted it. */
export async function pushPrefs(patch = {}) {
  const r = await Law.updatePreferences({ ...snapshot(), ...patch });
  flag(DIRTY, r.ok ? undefined : "1");
  return r.ok;
}

/** On layout mount: push if the device has unsent changes, else adopt the server's saved preferences. */
export async function syncPrefsOnMount() {
  if (isDirty()) return void (await pushPrefs());
  const r = await Law.myPreferences();
  const pr = r.ok && r.data?.preferences;
  if (!pr || !pr.updatedAt) return; // nothing saved on the server yet: the device keeps its choices
  setTheme(pr.theme);
  setSound(pr.soundEnabled);
  if (pr.locale !== lang()) {
    let done = false;
    try { done = sessionStorage.getItem(RELOADED) === "1"; sessionStorage.setItem(RELOADED, "1"); } catch { done = true; }
    if (!done) setLang(pr.locale);
  }
}
