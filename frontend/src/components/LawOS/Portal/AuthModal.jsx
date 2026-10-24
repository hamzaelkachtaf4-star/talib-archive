import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import Law from "@/models/law";
import { startSession } from "@/components/LawOS/lib/session";
import { tr } from "@/components/LawOS/lib/i18n";
import GoogleButton from "@/components/LawOS/Auth/GoogleButton";
import FacebookButton from "@/components/LawOS/Auth/FacebookButton";
import QrLogin from "@/components/LawOS/Auth/QrLogin";
import { authErrorMessage } from "@/components/LawOS/Auth/AuthLayout";
import { ModalFrame } from "./IosInstallModal";
import TactileButton from "./TactileButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign-in / sign-up dialog. mode: "login" | "signup". The QR tab is desktop-only (a phone can't scan itself). */
export default function AuthModal({ open, mode, onMode, onClose, config, canQr }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("direct"); // direct | qr
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [googleDown, setGoogleDown] = useState(false);
  const emailRef = useRef(null);

  const emailError = !email.trim()
    ? tr("أدخل بريدك الإلكتروني.")
    : !EMAIL_RE.test(email.trim())
      ? tr("صيغة البريد الإلكتروني غير صحيحة.")
      : null;
  const pwError = password ? null : tr("أدخل كلمة المرور.");
  const signup = mode === "signup";

  async function finish(r) {
    if (!r.ok || !r.data?.token) {
      setError(authErrorMessage(r));
      return false;
    }
    try {
      await startSession(r.data);
    } catch {
      setError(authErrorMessage({ ok: false, status: 500, data: {} }));
      return false;
    }
    navigate("/law/today", { replace: true });
    return true;
  }

  async function submit(e) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError(null);
    if (emailError || pwError) return;
    setBusy(true);
    const r = await Law.login({ email: email.trim(), password });
    if ((await finish(r)) === false) setBusy(false);
  }

  function switchToEmail() {
    if (canQr && !signup) setTab("qr");
    else if (signup) navigate("/law/register");
    else emailRef.current?.focus();
  }

  const title = signup ? tr("أنشئ حسابك") : tr("مرحباً بعودتك");
  const social = (
    <div className="portal-stack">
      <GoogleButton clientId={config?.googleClientId} onResult={finish} onError={() => setGoogleDown(true)} />
      {googleDown && (
        <div role="status" className="portal-hint portal-fallback">
          <span>{tr("تسجيل الدخول عبر البريد أو رمز الهاتف متاح فوراً")}</span>
          <button type="button" onClick={switchToEmail}>
            {canQr && !signup ? tr("مسح رمز الهاتف") : tr("المتابعة بالبريد")}
          </button>
        </div>
      )}
      {config?.facebookAppId && <FacebookButton appId={config.facebookAppId} onResult={finish} />}
    </div>
  );

  return (
    <ModalFrame open={open} onClose={onClose} labelledBy="auth-title" className="portal-modal-auth">
      <h2 id="auth-title" className="portal-modal-title">{title}</h2>

      {canQr && !signup && (
        <div role="tablist" className="portal-tabs" aria-label={tr("طريقة الدخول")}>
          {[
            ["direct", tr("الدخول المباشر")],
            ["qr", tr("مسح رمز الهاتف")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`auth-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`auth-panel-${id}`}
              className={tab === id ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "qr" && canQr && !signup ? (
        <div role="tabpanel" id="auth-panel-qr" aria-labelledby="auth-tab-qr" className="portal-qr-panel">
          <QrLogin compact onDone={finish} onCancel={() => setTab("direct")} />
        </div>
      ) : signup ? (
        <div role="tabpanel" className="portal-stack">
          <p className="portal-sub">{tr("ابدأ بحساب Google، أو سجّل بالبريد الإلكتروني وسنرسل لك رمز التحقق.")}</p>
          {social}
          {error && <p role="alert" className="portal-error">{error}</p>}
          <div className="portal-divider">{tr("أو بالبريد")}</div>
          <TactileButton to="/law/register" variant="primary" block>
            {tr("التسجيل بالبريد الإلكتروني")}
          </TactileButton>
          <p className="portal-switch">
            {tr("لديك حساب؟")}{" "}
            <button type="button" onClick={() => onMode("login")}>{tr("تسجيل الدخول")}</button>
          </p>
        </div>
      ) : (
        <div role="tabpanel" id="auth-panel-direct" aria-labelledby="auth-tab-direct" className="portal-stack">
          {social}
          <div className="portal-divider">{tr("أو بالبريد")}</div>
          <form onSubmit={submit} noValidate className="portal-stack">
            <label className="portal-field">
              <span>{tr("البريد الإلكتروني")}</span>
              <input
                ref={emailRef}
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                aria-invalid={touched.email && !!emailError}
                aria-describedby={touched.email && emailError ? "auth-email-err" : undefined}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              />
              {touched.email && emailError && <small id="auth-email-err" className="portal-error">{emailError}</small>}
            </label>
            <label className="portal-field">
              <span>{tr("كلمة المرور")}</span>
              <span className="portal-pw">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  dir="ltr"
                  value={password}
                  aria-invalid={touched.password && !!pwError}
                  aria-describedby={touched.password && pwError ? "auth-pw-err" : undefined}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? tr("إخفاء كلمة المرور") : tr("إظهار كلمة المرور")}
                >
                  {showPw ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {touched.password && pwError && <small id="auth-pw-err" className="portal-error">{pwError}</small>}
            </label>
            {error && <p role="alert" className="portal-error">{error}</p>}
            <TactileButton type="submit" variant="primary" block disabled={busy}>
              {busy ? tr("جارٍ التحقق…") : tr("تسجيل الدخول")}
            </TactileButton>
          </form>
          <div className="portal-links">
            <Link to="/law/register">{tr("إنشاء حساب جديد")}</Link>
            <Link to="/law/forgot">{tr("نسيت كلمة المرور؟")}</Link>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
