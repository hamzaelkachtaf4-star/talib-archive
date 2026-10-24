import { BRAND } from "@/config/brand";

/** Transparent mark + wordmark from brand.js (no tile behind it, so it sits on paper and midnight alike). The one place the product name is rendered in chrome. */
export default function BrandLogo({ size = 32, wordmark = true, locale, className = "" }) {
  const lang = locale || (typeof document !== "undefined" ? document.documentElement.lang : "ar");
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold ${className}`}>
      <img src={BRAND.icons.mark} alt="" width={size} height={size} className="law-logo-mark" />
      {wordmark && <span>{BRAND.name[lang] || BRAND.name[String(lang).split("-")[0]] || BRAND.name.ar}</span>}
    </span>
  );
}
