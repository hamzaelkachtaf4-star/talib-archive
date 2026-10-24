import { useEffect, useState } from "react";

/** The Android wrapper injects QanouniNative; it is a phone even when the WebView reports a fine pointer. */
export const isNativeApp = (win = window) => typeof win.QanouniNative?.postMessage === "function";

/**
 * "desktop" | "mobile". A hovering fine pointer means a desktop-class device; everything else (touch phones and
 * tablets, the Android wrapper) is "mobile". Media queries first, user agent never.
 */
export function detectDeviceClass(win = window) {
  if (isNativeApp(win)) return "mobile";
  const mq = (q) => !!win.matchMedia?.(q)?.matches;
  return mq("(hover: hover) and (pointer: fine)") ? "desktop" : "mobile";
}

export default function useDeviceClass() {
  const [cls, setCls] = useState(() => detectDeviceClass());
  useEffect(() => {
    const list = ["(hover: hover) and (pointer: fine)"].map((q) => window.matchMedia?.(q)).filter(Boolean);
    const update = () => setCls(detectDeviceClass());
    list.forEach((m) => m.addEventListener?.("change", update));
    return () => list.forEach((m) => m.removeEventListener?.("change", update));
  }, []);
  return cls;
}

/** True when the viewport is at least `px` wide (reactive). */
export function useMinWidth(px) {
  const q = `(min-width: ${px}px)`;
  const [yes, setYes] = useState(() => !!window.matchMedia?.(q)?.matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const update = () => setYes(m.matches);
    update();
    m.addEventListener?.("change", update);
    return () => m.removeEventListener?.("change", update);
  }, [q]);
  return yes;
}
