import { useEffect, useRef } from "react";
import { Export, PlusSquare, X } from "@phosphor-icons/react";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";
import TactileButton from "./TactileButton";

/** Focus-managed modal shell shared by the portal dialogs: Escape closes, focus is trapped and restored. */
export function useModal(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const root = ref.current;
    const focusables = () =>
      [...(root?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])];
    (focusables()[0] || root)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function ModalFrame({ open, onClose, labelledBy, children, className = "" }) {
  const ref = useModal(open, onClose);
  if (!open) return null;
  return (
    <div className="portal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={`portal-modal ${className}`}>
        <button type="button" className="portal-modal-x" onClick={onClose} aria-label={tr("إغلاق")}>
          <X size={20} weight="bold" />
        </button>
        {children}
      </div>
    </div>
  );
}

export default function IosInstallModal({ open, onClose, isIosSafari }) {
  return (
    <ModalFrame open={open} onClose={onClose} labelledBy="ios-install-title">
      <h2 id="ios-install-title" className="portal-modal-title">{tr("تثبيت {0} على الآيفون", [brandName(lang())])}</h2>
      <p className="portal-sub">{tr("تطبيق ويب يعمل دون اتصال ويظهر كأي تطبيق على شاشتك الرئيسية.")}</p>
      {!isIosSafari && (
        <p className="portal-hint" role="note">{tr("افتح هذه الصفحة في متصفح Safari على آيفون ثم أعد المحاولة.")}</p>
      )}
      <ol className="portal-ios-steps">
        <li>
          <span className="portal-ios-icon"><Export size={30} weight="bold" /></span>
          <span>{tr("اضغط على زر المشاركة (Share) في متصفح Safari.")}</span>
        </li>
        <li>
          <span className="portal-ios-icon"><PlusSquare size={30} weight="bold" /></span>
          <span>{tr("اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).")}</span>
        </li>
      </ol>
      <TactileButton variant="primary" block onClick={onClose}>{tr("فهمت")}</TactileButton>
    </ModalFrame>
  );
}
