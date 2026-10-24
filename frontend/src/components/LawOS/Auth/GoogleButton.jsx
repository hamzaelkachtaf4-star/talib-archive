import { useEffect, useRef, useState } from "react";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisPromise = null;

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise)
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        gisPromise = null;
        reject(new Error("gis_unavailable"));
      };
      document.head.appendChild(s);
    });
  return gisPromise;
}

/**
 * "تسجيل الدخول باستخدام Google". In a browser: Google Identity Services. Inside the Qanouni Android app,
 * Google forbids OAuth in WebViews, so the app's native bridge (Credential Manager) supplies the token.
 * Either way the ID token goes to /api/law/auth/google; onResult receives that API response.
 */
export default function GoogleButton({ clientId, onResult, onError }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setErrorState] = useState(null);
  const setError = (msg) => {
    setErrorState(msg);
    if (msg) onError?.(msg);
  };
  // The Qanouni Android app exposes QanouniNative (a WebMessageListener, own origin only).
  const native =
    typeof window !== "undefined" &&
    typeof window.QanouniNative?.postMessage === "function";

  async function exchange(credential) {
    setBusy(true);
    const r = await Law.googleSignIn(credential);
    setBusy(false);
    onResult(r);
  }

  useEffect(() => {
    if (!clientId) return;
    if (native) {
      window.qanouniGoogleCredential = (token) => exchange(token);
      window.qanouniGoogleError = (code) =>
        setError(
          code === "cancelled" ? null : tr("تعذّر تسجيل الدخول عبر Google.")
        );
      return () => {
        delete window.qanouniGoogleCredential;
        delete window.qanouniGoogleError;
      };
    }
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: ({ credential }) => exchange(credential),
            ux_mode: "popup",
          });
          window.google.accounts.id.renderButton(ref.current, {
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "continue_with",
            locale: "ar",
            width: Math.min(ref.current.offsetWidth || 320, 400),
          });
        } catch {
          setError(tr("تعذّر تحميل زر Google. تحقّق من الاتصال."));
        }
      })
      .catch(() => setError(tr("تعذّر تحميل زر Google. تحقّق من الاتصال.")));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div className="flex flex-col gap-2">
      {native ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            window.QanouniNative.postMessage(
              JSON.stringify({ type: "googleSignIn", clientId })
            );
          }}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full font-semibold"
          style={{
            background: "#fff",
            color: "#1f1f1f",
            border: "1px solid #dadce0",
          }}
        >
          <GoogleG />
          {tr("تسجيل الدخول باستخدام Google")}
        </button>
      ) : (
        <div ref={ref} className="flex min-h-[44px] w-full justify-center" />
      )}
      {busy && (
        <p
          className="text-center text-sm"
          style={{ color: "var(--law-muted)" }}
        >
          {tr("جارٍ التحقق…")}
        </p>
      )}
      {error && (
        <p className="text-center text-sm" style={{ color: "var(--law-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
