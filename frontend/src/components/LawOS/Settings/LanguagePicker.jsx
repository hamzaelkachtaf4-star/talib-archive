import { pushPrefs } from "@/components/LawOS/lib/prefsSync";
import { LANGUAGES, lang, setLang, tr } from "@/components/LawOS/lib/i18n";

/** Interface language. Each name is written in its own language; choosing one reloads the app. */
export default function LanguagePicker({ compact = false }) {
  const current = lang();
  return (
    <>
    <div
      role="radiogroup"
      aria-label="اللغة · Langue · Language"
      className={`flex flex-wrap gap-2 ${compact ? "justify-center" : "py-3"}`}
    >
      {Object.entries(LANGUAGES).map(([code, { label, dir }]) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={code === current}
          lang={code === "ary" ? "ar-MA" : code}
          dir={dir}
          onClick={async () => {
            if (code !== current) await pushPrefs({ locale: code }); // offline: marks the device dirty, pushed next time
            setLang(code);
          }}
          className={`rounded-full px-4 font-semibold ${compact ? "h-9 text-sm" : "h-11"}`}
          style={
            code === current
              ? {
                  background: "var(--law-primary)",
                  color: "var(--law-on-primary)",
                }
              : { background: "var(--law-surface-2)", color: "var(--law-text)" }
          }
        >
          {label}
        </button>
      ))}
    </div>
    {!compact && <p className="pb-3 text-xs" style={{ color: "var(--law-muted)" }}>{tr("تتغير لغة الواجهة فقط؛ النصوص القانونية والملخصات تبقى كما كُتبت.")}</p>}
    </>
  );
}
