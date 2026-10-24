import { useMemo } from "react";
import { Scales } from "@phosphor-icons/react";
import { TALIB_LAW } from "@/components/LawOS/lib/lawProfiles";
import { tr } from "@/components/LawOS/lib/i18n";

const Meter = ({ label, value, text }) => (
  <div className="min-w-0">
    <div className="flex items-center justify-between gap-2 text-xs font-bold">
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 gap-0.5" aria-label={`${value}/4`}>
        {[1, 2, 3, 4].map((i) => <span key={i} className="h-2 w-4 rounded-full" style={{ background: i <= value ? "var(--law-accent)" : "var(--law-border)" }} />)}
      </span>
    </div>
    <p className="mt-0.5 text-xs" style={{ color: "var(--law-muted)" }}>{text}</p>
  </div>
);

/** Legal nature of the module's branch: which sources rule and in what order (shown above the drills). */
export default function BranchCard({ moduleTitle }) {
  const b = useMemo(() => (moduleTitle ? TALIB_LAW.get(TALIB_LAW.detect(moduleTitle)) : null), [moduleTitle]);
  if (!b) return null;
  return (
    <section className="law-card mb-4 grid gap-3 p-4" aria-label={tr("طبيعة الفرع القانوني")}>
      <header className="flex items-center gap-2">
        <Scales size={22} weight="duotone" style={{ color: "var(--law-accent)" }} />
        <h2 className="text-base font-bold">{b.label}</h2>
      </header>
      <p className="text-sm">{b.essence}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label={tr("سلطة النص")} value={b.authority} text={b.interpretation} />
        <Meter label={tr("دور العرف")} value={b.custom} text={b.customText} />
        <Meter label={tr("دور الاجتهاد")} value={b.ijtihad} text={b.ijtihadText} />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-bold">{tr("ترتيب المصادر في النازلة")}</h3>
        <ol className="grid gap-1 text-sm">
          {b.sources.map(([name, ref, status], i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--law-accent)", color: "var(--law-on-accent)" }}><bdi dir="ltr">{i + 1}</bdi></span>
              <span className="min-w-0">{name}{ref && <> <bdi dir="ltr" className="whitespace-nowrap text-xs" style={{ color: "var(--law-muted)" }}>({ref})</bdi></>}{status && <span className="ms-1 whitespace-nowrap text-xs" style={{ color: "var(--law-warn)" }}>{tr("للاسترشاد")}</span>}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
