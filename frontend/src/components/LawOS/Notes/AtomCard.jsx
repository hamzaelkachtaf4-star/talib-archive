import { Star, Play, FileText, PushPin } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { ArticleNum } from "../Bdi";
import { formatClock } from "../lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

export const PROVENANCE = {
  PROF: { label: tr("الأستاذ"), color: "var(--law-primary)" },
  TEXT: { label: tr("نص"), color: "var(--law-accent)" },
  JURIS: { label: tr("اجتهاد"), color: "var(--law-danger)" },
  DOCTRINE: { label: tr("فقه"), color: "var(--law-gold-ink)" },
  MINE: { label: tr("ملاحظتي"), color: "var(--law-muted)" },
};

/**
 * One atom with its provenance chip (spec §1.6) and a jump to its source: the audio timestamp or the
 * page for PROF, the article for TEXT (spec §11 Phase 4).
 */
export default function AtomCard({ atom, onPlay, onPin, mode }) {
  const p = PROVENANCE[atom.provenance];
  return (
    <div
      className="law-card flex flex-col gap-2 p-3"
      style={
        atom.mentionBridge ? { borderColor: "var(--law-accent)" } : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className="rounded-full px-2 py-0.5 font-bold"
          style={{ background: p.color, color: "var(--law-bg)" }}
        >
          {p.label}
        </span>
        {atom.profEmphasis && (
          <span
            className="flex items-center gap-1 font-semibold"
            style={{ color: "var(--law-accent)" }}
          >
            <Star size={14} weight="fill" /> {tr("أكد عليه الأستاذ")}
          </span>
        )}
        {atom.divergenceMarker && (
          <span
            className="rounded-full px-2 py-0.5"
            style={{ background: "var(--law-surface-2)" }}
          >
            {atom.divergenceMarker}
          </span>
        )}
        {atom.verificationStatus === "unverified" && (
          <span style={{ color: "var(--law-warn)" }}>{tr("غير مُتحقق")}</span>
        )}
        {atom.mentionBridge && (
          <span
            className="flex items-center gap-1 font-semibold"
            style={{ color: "var(--law-accent)" }}
          >
            <PushPin size={14} weight="fill" /> {tr("إضافة التميّز")}
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap leading-8">{atom.body}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {atom.provenance === "PROF" &&
          atom.source &&
          atom.sourceTimestampSec != null && (
            <button
              type="button"
              onClick={() => onPlay?.(atom)}
              className="law-btn law-btn-secondary"
              style={{ minHeight: 32 }}
            >
              <Play size={14} weight="fill" />{" "}
              <bdi dir="ltr">{formatClock(atom.sourceTimestampSec)}</bdi>
            </button>
          )}
        {atom.provenance === "PROF" &&
          atom.source &&
          atom.sourcePage != null && (
            <a
              href={`${atom.source.url}#page=${atom.sourcePage}`}
              target="_blank"
              rel="noreferrer"
              className="law-btn law-btn-secondary"
              style={{ minHeight: 32 }}
            >
              <FileText size={14} /> {tr("صفحة")}{" "}
              <bdi dir="ltr">{atom.sourcePage}</bdi>
            </a>
          )}
        {atom.article && (
          <Link
            to={`/law/corpus/a/${encodeURIComponent(atom.article.canonicalId)}`}
            className="law-btn law-btn-secondary"
            style={{ minHeight: 32 }}
          >
            {atom.article.numberingLabel}{" "}
            <ArticleNum value={atom.article.articleNumber} />
          </Link>
        )}
        {atom.decision && (
          <span className="law-muted">
            {tr("قرار")} <bdi dir="ltr">{atom.decision.decisionNumber}</bdi>
            {atom.decision.verified ? " ✓" : ""}
          </span>
        )}
        {atom.doctrine && (
          <span className="law-muted">
            {atom.doctrine.author}
            {tr("،")} {atom.doctrine.work}
            {atom.doctrine.page && tr("ص {0}", [atom.doctrine.page])}
          </span>
        )}
        {mode === "jurist" &&
          ["JURIS", "DOCTRINE"].includes(atom.provenance) &&
          onPin && (
            <button
              type="button"
              onClick={() => onPin(atom)}
              className="law-muted ms-auto flex items-center gap-1"
              style={{ minHeight: 32 }}
            >
              <PushPin size={14} />{" "}
              {atom.mentionBridge ? tr("إزالة التثبيت") : tr("تثبيت كإضافة")}
            </button>
          )}
      </div>
    </div>
  );
}
