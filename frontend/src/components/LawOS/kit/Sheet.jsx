import { useEffect, useId, useRef } from "react";

/** Bottom sheet / modal. Moves focus in, traps Tab, restores focus, locks background scroll; Escape closes the topmost one only. */
let openStack = [];
export default function Sheet({ open, onClose, title, label, children, variant = "sheet", dismissible = true }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(dismissible ? onClose : null); // a required screen (consent) cannot be dismissed by Escape or backdrop
  closeRef.current = dismissible ? onClose : null;
  useEffect(() => {
    if (!open) return;
    const token = {};
    openStack.push(token);
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const focusables = () => [...node.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
    (focusables()[0] || node).focus();
    const onKey = (e) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (e.key === "Escape") return closeRef.current?.();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return e.preventDefault();
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openStack = openStack.filter((t) => t !== token);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={`law-sheet-backdrop ${variant === "modal" || variant === "screen" ? "law-modal" : ""} ${variant === "screen" ? "law-screen" : ""} ${variant === "drawer" ? "law-drawer" : ""}`} onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} tabIndex={-1} className="law-sheet" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={!title ? label : undefined}>
        {title && <h2 id={titleId} className="mb-3 text-xl font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
