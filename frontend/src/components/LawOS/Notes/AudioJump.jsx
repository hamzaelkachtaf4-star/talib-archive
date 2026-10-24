import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { formatClock } from "../lib/media";
import { tr } from "@/components/LawOS/lib/i18n";

/** Plays the original lecture audio from the atom's timestamp (spec §11 Phase 4: jump to source). */
export default function AudioJump({ atom, onClose }) {
  const audio = useRef(null);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const go = () => {
      a.currentTime = Math.max(0, (atom.sourceTimestampSec || 0) - 2);
      a.play().catch(() => {});
    };
    a.addEventListener("loadedmetadata", go, { once: true });
  }, [atom]);
  return (
    <div
      className="law-safe-bottom fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 p-3 shadow-lg lg:bottom-4"
      style={{ background: "var(--law-surface)" }}
    >
      <span className="text-xs font-semibold tabular-nums">
        <bdi dir="ltr">{formatClock(atom.sourceTimestampSec)}</bdi>
      </span>
      <audio
        ref={audio}
        src={atom.source.url}
        controls
        preload="metadata"
        className="min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label={tr("إغلاق")}
        className="h-11 w-11"
      >
        <X size={20} className="mx-auto" />
      </button>
    </div>
  );
}
