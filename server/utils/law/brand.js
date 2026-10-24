// Server mirror of frontend/src/config/brand.js (emails, manifest, exports). Keep the two in sync.
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };
const BRAND = deepFreeze({
  name: { ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" },
  shortName: { ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" },
  tagline: {
    ar: "المنصة الشاملة لطالب الحقوق بالمغرب",
    ary: "المنصة الشاملة لطالب الحقوق فالمغرب",
    fr: "La plateforme complète de l'étudiant en droit au Maroc",
    en: "The complete platform for Moroccan law students",
  },
  description: "المنصة الشاملة لطالب الحقوق بالمغرب: كل ما يحتاجه طالب الحقوق في مكان واحد",
  themeColor: "#0b5d3b",
});

function brandName(locale = "ar") {
  return BRAND.name[locale] || BRAND.name.fr;
}

module.exports = { BRAND, brandName };
