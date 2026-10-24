import { useEffect } from "react";
import { applyDocumentLang, lang, langInfo, tr } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";
import "@/components/LawOS/lawos.css";
import LanguagePicker from "@/components/LawOS/Settings/LanguagePicker";
import { applyTheme } from "@/components/LawOS/lib/prefs";

/** Branded, RTL, mobile-first frame for the sign-in screens. */
export default function AuthLayout({ title, subtitle, children }) {
  useEffect(() => {
    applyTheme();
    return applyDocumentLang();
  }, []);

  return (
    <div
      dir={langInfo().dir}
      lang={lang()}
      className="lawos-root flex min-h-[100dvh] items-start justify-center px-4 pt-[max(env(safe-area-inset-top),2.5rem)] pb-10 sm:items-center"
    >
      <main className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img
            src="/lawos/icons/mascot.svg"
            alt=""
            aria-hidden="true"
            className="law-logo-mark h-20 w-20"
          />
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--law-primary)" }}
          >
            {brandName(lang())}
          </p>
          <p className="text-sm" style={{ color: "var(--law-muted)" }}>
            {tr("المنصة الذكية لطلبة القانون بالمغرب")}
          </p>
        </div>
        <section
          className="rounded-3xl p-5 sm:p-7"
          style={{
            background: "var(--law-surface)",
            border: "1px solid var(--law-border)",
          }}
        >
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && (
            <p
              className="mt-1 text-sm leading-7"
              style={{ color: "var(--law-muted)" }}
            >
              {subtitle}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-4">{children}</div>
        </section>
        <div className="mt-5">
          <LanguagePicker compact />
        </div>
      </main>
    </div>
  );
}

export const AUTH_ERRORS = {
  invalid_credentials: tr("البريد الإلكتروني أو كلمة المرور غير صحيحة."),
  email_taken: tr(
    "هذا البريد الإلكتروني مسجّل من قبل. سجّل الدخول بدلاً من ذلك."
  ),
  suspended: tr("هذا الحساب موقوف. تواصل مع المسؤول."),
  too_many_attempts: tr("محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة."),
  registration_closed: tr("التسجيل مغلق حالياً. تواصل مع المسؤول."),
  google_account_mismatch: tr("هذا البريد مرتبط بحساب Google آخر."),
  email_not_verified: tr("بريد Google غير مؤكَّد."),
  invalid_google_token: tr("تعذّر التحقق من حساب Google. أعد المحاولة."),
  google_not_configured: tr(
    "تسجيل الدخول عبر Google غير مفعّل على هذا الخادم."
  ),
  already_set_up: tr("تم إعداد المنصة من قبل."),
  weak_password: tr("كلمة المرور ضعيفة: 8 أحرف على الأقل مع حرف كبير وحرف صغير ورقم ورمز خاص."),
  mail_failed: tr("تعذّر إرسال البريد الإلكتروني. أعد المحاولة بعد قليل."),
  invalid_code: tr("الرمز غير صحيح."),
  code_expired: tr("انتهت صلاحية الرمز. اطلب رمزاً جديداً."),
  locked: tr("محاولات خاطئة كثيرة. أعد المحاولة بعد 15 دقيقة."),
  cooldown: tr("انتظر قليلاً قبل طلب رمز جديد."),
  qr_invalid: tr("رمز QR منتهي الصلاحية أو مستعمل. اعرض رمزاً جديداً."),
  setup_required: tr("يجب إعداد المنصة أولاً."),
  offline: tr("لا يوجد اتصال بالخادم. تحقّق من الإنترنت أو من Tailscale."),
};

/** Arabic message for an API failure ({ ok, status, data, offline }). */
export function authErrorMessage(r) {
  if (r?.offline) return AUTH_ERRORS.offline;
  const code = r?.data?.error;
  if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  if (typeof code === "string" && /password/i.test(code))
    return AUTH_ERRORS.weak_password;
  if (typeof code === "string" && /email/i.test(code))
    return tr("أدخل بريداً إلكترونياً صحيحاً.");
  return tr("حدث خطأ. أعد المحاولة.");
}
