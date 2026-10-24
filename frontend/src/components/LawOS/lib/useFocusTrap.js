import { useEffect } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * While `active`: moves focus into `ref`, keeps Tab inside it, closes on Escape and on a press outside
 * (`ignoreRef`, e.g. the trigger, is not "outside"), and returns focus to `returnRef` (or the previous element).
 */
export default function useFocusTrap(ref, active, { onClose, returnRef, ignoreRef } = {}) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current;
    const prev = document.activeElement;
    const items = () => [...node.querySelectorAll(FOCUSABLE)];
    (items()[0] || node).focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); return onClose?.(); }
      if (e.key !== "Tab") return;
      const f = items();
      if (!f.length) return e.preventDefault();
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const onDown = (e) => {
      if (node.contains(e.target) || ignoreRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      (returnRef?.current || prev)?.focus?.();
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
