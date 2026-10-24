import { SealCheck, SealWarning } from "@phosphor-icons/react";
import { ArticleNum } from "../Bdi";
import { intlLocale, tr } from "@/components/LawOS/lib/i18n";

export const todayStr = () => new Date().toISOString().slice(0, 10);

/** Spec §1.3-1.4: corpus text shows whether the student checked it against the official source. */
export function VerifiedBadge({ verified }) {
  return verified ? (
    <span
      className="flex items-center gap-1 text-xs font-semibold"
      style={{ color: "var(--law-ok)" }}
    >
      <SealCheck size={16} weight="fill" /> {tr("مُتحقق منه")}
    </span>
  ) : (
    <span
      className="flex items-center gap-1 text-xs font-semibold"
      style={{ color: "var(--law-warn)" }}
    >
      <SealWarning size={16} /> {tr("غير مُتحقق منه")}
    </span>
  );
}

/** "الفصل 77 من ظهير الالتزامات والعقود" with isolated digits. */
export function ArticleTitle({ label, number, codeTitle }) {
  return (
    <span>
      {label} <ArticleNum value={number} />
      {codeTitle && <span className="law-muted"> · {codeTitle}</span>}
    </span>
  );
}

export const fmtDate = (d) =>
  d
    ? new Intl.DateTimeFormat(intlLocale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(d))
    : "";
