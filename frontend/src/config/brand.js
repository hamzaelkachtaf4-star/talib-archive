// Single source of truth for the product name. A rename is a one-file change (rule 3: no name literals elsewhere).
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };
export const BRAND = deepFreeze({
  name: { ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" },
  shortName: { ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" },
  tagline: {
    ar: "المنصة الشاملة لطالب الحقوق بالمغرب",
    ary: "المنصة الشاملة لطالب الحقوق فالمغرب",
    fr: "La plateforme complète de l'étudiant en droit au Maroc",
    en: "The complete platform for Moroccan law students",
  },
  supportEmail: "",
  themeColor: "#0b5d3b",
  icons: {
    svg: "/lawos/icons/icon.svg",
    mark: "/lawos/icons/mascot.svg", // transparent artwork for in-app chrome (icon.svg carries the cream tile for launchers)
    png192: "/lawos/icons/icon-192.png",
    png512: "/lawos/icons/icon-512.png",
    maskable: "/lawos/icons/maskable-512.png",
  },
});

export function brandName(locale = "ar") {
  return BRAND.name[locale] || BRAND.name.fr;
}
