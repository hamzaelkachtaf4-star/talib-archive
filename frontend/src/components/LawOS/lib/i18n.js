// Qanouni interface languages: Arabic (source and default), Moroccan Darija, French, English.
// The Arabic text in the code is the key; each dictionary maps it to its translation, and anything
// missing falls back to Arabic. Legal content (statutes, notes, cards) is never translated.
// Changing the language reloads the app, so labels computed at module load are correct too.
// Only the active dictionary is downloaded (its own chunk); routes.jsx awaits `i18nReady` before
// loading any Qanouni page, so tr() is translated from the first render.

export const LANGUAGES = {
  ar: { label: "العربية", dir: "rtl", locale: "ar-MA" },
  ary: { label: "الدارجة", dir: "rtl", locale: "ar-MA" },
  fr: { label: "Français", dir: "ltr", locale: "fr-MA" },
  en: { label: "English", dir: "ltr", locale: "en-GB" },
};
const LOADERS = {
  fr: () => import("@/locales/qanouni/fr.json"),
  en: () => import("@/locales/qanouni/en.json"),
  ary: () => import("@/locales/qanouni/ary.json"),
};
let DICT = null;
const KEY = "qanouni_lang";

function readLang() {
  try {
    const v = localStorage.getItem(KEY);
    return LANGUAGES[v] ? v : "ar";
  } catch {
    return "ar";
  }
}

const current = readLang();

/** Resolves once the active dictionary is loaded (immediately for Arabic; never rejects). */
export const i18nReady = LOADERS[current]
  ? LOADERS[current]()
      .then((mod) => {
        DICT = mod.default;
      })
      .catch(() => {})
  : Promise.resolve();

/** Loader for the active dictionary, so the service worker can keep it for offline use. */
export const dictPrefetcher = LOADERS[current] || null;

export function lang() {
  return current;
}

export function langInfo() {
  return LANGUAGES[current];
}

/** Locale for Intl date/number formatting in the current language. */
export function intlLocale() {
  return LANGUAGES[current].locale;
}

export function setLang(code) {
  if (!LANGUAGES[code] || code === current) return;
  try {
    localStorage.setItem(KEY, code);
  } catch {}
  window.location.reload();
}

/** Applies the language and direction to <html>; returns a function restoring the previous values. */
export function applyDocumentLang() {
  const html = document.documentElement;
  const prev = { dir: html.dir, lang: html.lang };
  html.dir = LANGUAGES[current].dir;
  html.lang = current === "ary" ? "ar-MA" : current;
  return () => {
    html.dir = prev.dir;
    html.lang = prev.lang;
  };
}

/**
 * Translate. `source` is the Arabic text; `{0}`, `{1}` … are filled from `args`.
 * @param {string} source
 * @param {Array<any>} [args]
 */
export function tr(source, args) {
  const text = (DICT && DICT[source]) || source;
  if (!args) return text;
  return text.replace(/\{(\d+)\}/g, (m, i) =>
    args[i] === undefined || args[i] === null ? "" : String(args[i])
  );
}
