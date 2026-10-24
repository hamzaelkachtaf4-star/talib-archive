import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { defaultNS, languageLoaders } from "./locales/resources";

// Qanouni (LAW-OS perf): dictionaries load on demand, one chunk per language (see locales/resources.js).
const lazyLocales = {
  type: "backend",
  read(language, _namespace, callback) {
    const load = languageLoaders[language] || languageLoaders[language.split("-")[0]];
    if (!load) return callback(null, {});
    load()
      .then((mod) => callback(null, mod.default))
      .catch((err) => callback(err, null));
  },
};

i18next
  // https://github.com/i18next/i18next-browser-languageDetector/blob/9efebe6ca0271c3797bc09b84babf1ba2d9b4dbb/src/index.js#L11
  .use(lazyLocales)
  .use(initReactI18next) // Initialize i18n for React
  .use(LanguageDetector)
  .init({
    fallbackLng: "en",
    debug: import.meta.env.DEV,
    defaultNS,
    ns: [defaultNS],
    supportedLngs: Object.keys(languageLoaders),
    nonExplicitSupportedLngs: true,
    lowerCaseLng: true,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
