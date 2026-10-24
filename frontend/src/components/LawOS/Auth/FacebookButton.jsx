import { useEffect, useState } from "react";
import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

const FB_SDK_SRC = "https://connect.facebook.net/ar_AR/sdk.js";
let fbPromise = null;

function loadFbSdk(appId) {
  if (window.FB) return Promise.resolve();
  if (!fbPromise) {
    fbPromise = new Promise((resolve) => {
      window.fbAsyncInit = function () {
        window.FB.init({
          appId: appId || "dummy",
          cookie: true,
          xfbml: false,
          version: "v19.0",
        });
        resolve();
      };
      const s = document.createElement("script");
      s.src = FB_SDK_SRC;
      s.async = true;
      s.defer = true;
      s.onerror = () => {
        fbPromise = null;
        resolve();
      };
      document.head.appendChild(s);
    });
  }
  return fbPromise;
}

export default function FacebookButton({ appId, onResult }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (appId) loadFbSdk(appId);
  }, [appId]);

  async function exchange(accessToken) {
    setBusy(true);
    setError(null);
    const r = await Law.facebookSignIn(accessToken);
    setBusy(false);
    if (!r.ok) {
      setError(
        r.data?.error === "facebook_link_required"
          ? tr("هذا البريد مسجَّل لدينا. ادخل بكلمة المرور أو Google ثم اربط Facebook من الملف الشخصي.")
          : r.data?.error === "facebook_account_mismatch"
          ? tr("هذا الحساب مرتبط بحساب Facebook آخر.")
          : r.data?.error === "registration_closed"
          ? tr("التسجيل مغلق حالياً.")
          : tr("تعذّر تسجيل الدخول عبر Facebook.")
      );
    }
    onResult(r);
  }

  function handleLogin() {
    setError(null);
    if (!appId) {
      setError(
        tr("معرّف تطبيق Facebook (FACEBOOK_APP_ID) غير مهيأ بعد في إعدادات الخادم.")
      );
      return;
    }
    if (!window.FB) {
      setError(tr("تعذّر تحميل خدمة Facebook. تحقّق من الاتصال بالإنترنت."));
      return;
    }
    setBusy(true);
    try {
      window.FB.login(
        (response) => {
          setBusy(false);
          if (response?.authResponse?.accessToken) {
            exchange(response.authResponse.accessToken);
          } else {
            setError(tr("تم إلغاء تسجيل الدخول أو رفض الإذن."));
          }
        },
        { scope: "email,public_profile" }
      );
    } catch {
      setBusy(false);
      setError(tr("حدث خطأ أثناء الاتصال بخدمة Facebook."));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={handleLogin}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-full font-semibold transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
        style={{
          background: "#1877F2",
          color: "#ffffff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
        }}
      >
        <FacebookIcon />
        <span>{tr("المتابعة باستخدام Facebook")}</span>
      </button>
      {busy && (
        <p className="text-center text-xs" style={{ color: "var(--law-muted)" }}>
          {tr("جارٍ الاتصال بـ Facebook…")}
        </p>
      )}
      {error && (
        <p className="text-center text-xs" style={{ color: "var(--law-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
