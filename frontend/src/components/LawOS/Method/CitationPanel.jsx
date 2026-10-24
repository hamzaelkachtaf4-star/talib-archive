import { Warning } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";

/** Spec §7.2: unverifiable references are removed from the text and listed here, in red. */
export default function CitationPanel({ check }) {
  if (!check) return null;
  const bad = [...(check.unresolved || []), ...(check.strippedMentions || [])];
  return (
    <>
      {check.banner && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold"
          style={{ background: "color-mix(in srgb, var(--law-danger) 13%, transparent)", color: "var(--law-danger)" }}
        >
          <Warning size={18} weight="fill" />{" "}
          {tr("يتضمن التصحيح مراجع غير قابلة للتحقق، حُذفت من النص.")}
        </div>
      )}
      {bad.length > 0 && (
        <div
          className="mb-3 rounded-xl border p-3 text-sm"
          style={{ borderColor: "var(--law-danger)" }}
        >
          <p className="mb-1 font-bold" style={{ color: "var(--law-danger)" }}>
            {tr("مراجع غير موجودة في المرجع المحلي")}
          </p>
          <ul className="list-inside list-disc">
            {bad.map((x) => (
              <li key={x}>
                <bdi dir="ltr">{x}</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
      {check.quoteMismatches?.length > 0 && (
        <p className="law-muted mb-3 text-xs">
          {tr("اقتباسات لا تطابق النص المخزن حرفيا:")}{" "}
          <bdi dir="ltr">{check.quoteMismatches.length}</bdi>{" "}
          {tr("(عُرضت كإعادة صياغة).")}
        </p>
      )}
    </>
  );
}
