// Looking for a language to translate AnythingLLM to?
// Create a `common.js` file in the language's ISO code https://www.w3.org/International/O-charset-lang.html
// eg: Spanish => es/common.js
// eg: French => fr/common.js
// You should copy the en/common.js file as your template and just translate every string in there.
// By default, we try to see what the browsers native language is set to and use that. If a string
// is not defined or is null in the translation file, it will fallback to the value in the en/common.js file
// RULES:
// The EN translation file is the ground-truth for what keys and options are available. DO NOT add a special key
// to a specific language file as this will break the other languages. Any new keys should be added to english
// and the language file you are working on.

// Contributor Notice: If you are adding a translation you MUST locally run `yarn verify:translations` from the root prior to PR.
// please do not submit PR's without first verifying this test passes as it will tell you about missing keys or values
// from the primary dictionary.

// Qanouni (LAW-OS perf): each language is its own lazy chunk instead of ~3 MB of dictionaries in the
// entry bundle; i18n.js loads only the active language (and the English fallback) on demand.
export const defaultNS = "common";
export const languageLoaders = {
  en: () => import("./en/common.js"),
  zh: () => import("./zh/common.js"),
  "zh-tw": () => import("./zh_TW/common.js"),
  es: () => import("./es/common.js"),
  de: () => import("./de/common.js"),
  fr: () => import("./fr/common.js"),
  ko: () => import("./ko/common.js"),
  lo: () => import("./lo/common.js"),
  et: () => import("./et/common.js"),
  ru: () => import("./ru/common.js"),
  it: () => import("./it/common.js"),
  pt: () => import("./pt_BR/common.js"),
  he: () => import("./he/common.js"),
  nl: () => import("./nl/common.js"),
  vi: () => import("./vn/common.js"),
  fa: () => import("./fa/common.js"),
  tr: () => import("./tr/common.js"),
  ar: () => import("./ar/common.js"),
  da: () => import("./da/common.js"),
  ja: () => import("./ja/common.js"),
  lv: () => import("./lv/common.js"),
  pl: () => import("./pl/common.js"),
  ro: () => import("./ro/common.js"),
  cs: () => import("./cs/common.js"),
  lt: () => import("./lt/common.js"),
  ca: () => import("./ca/common.js"),
  id: () => import("./id/common.js"),
  hr: () => import("./hr/common.js"),
  sv: () => import("./sv/common.js"),
  hi: () => import("./hi/common.js"),
  bg: () => import("./bg/common.js"),
};
// Kept for callers that only need the list of supported codes.
export const resources = Object.fromEntries(
  Object.keys(languageLoaders).map((code) => [code, {}])
);

// Translation tooling (verifyTranslations, normalizeEn, findUnusedTranslations) needs every dictionary.
export async function loadResources() {
  const entries = await Promise.all(
    Object.entries(languageLoaders).map(async ([code, load]) => [
      code,
      { common: (await load()).default },
    ])
  );
  return Object.fromEntries(entries);
}
