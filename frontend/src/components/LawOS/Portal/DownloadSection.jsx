import { useCallback, useEffect, useState } from "react";
import { AndroidLogo, AppleLogo, CalendarCheck, Scales, Medal } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import IosInstallModal from "./IosInstallModal";
import useReveal from "./useReveal";

function detect() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return {
    ios,
    android: /Android/i.test(ua),
    iosSafari: ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua),
  };
}

function PhoneMockup() {
  return (
    <div className="portal-phone" aria-hidden="true">
      <div className="portal-phone-notch" />
      <div className="portal-phone-screen">
        <div className="portal-phone-top">
          <span className="portal-chip portal-chip-warm"><CalendarCheck size={16} /> <bdi dir="ltr">12</bdi></span>
          <span className="portal-chip"><Medal size={16} /> <bdi dir="ltr">92%</bdi></span>
        </div>
        <div className="portal-phone-card">
          <Scales size={22} weight="duotone" />
          <strong>{tr("بطاقات القانون المدني")}</strong>
          <span className="portal-phone-bar"><i style={{ width: "68%" }} /></span>
        </div>
        <div className="portal-phone-card portal-phone-card-alt">
          <strong>{tr("اختبار سريع")}</strong>
          <span>{tr("ما شروط صحة الالتزام؟")}</span>
          <span className="portal-phone-opt">{tr("الأهلية والرضا والمحل والسبب")}</span>
          <span className="portal-phone-opt">{tr("الرضا فقط")}</span>
        </div>
      </div>
    </div>
  );
}

/** "Learn anywhere": web-first distribution — direct APK for Android, installable web app (PWA) for iPhone. */
export default function DownloadSection() {
  const ref = useReveal();
  const [env] = useState(detect);
  const [iosOpen, setIosOpen] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const [sha, setSha] = useState(null);
  const closeIos = useCallback(() => setIosOpen(false), []);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // The published APK's SHA-256 (written next to it at release time): lets careful users verify their download.
  useEffect(() => {
    fetch("/downloads/rafiq.apk.sha256").then((r) => (r.ok ? r.text() : "")).then((t) => { const m = /^[0-9a-f]{64}/i.exec(t.trim()); if (m) setSha(m[0].toLowerCase()); }).catch(() => {});
  }, []);

  async function webInstall() {
    if (!prompt) return;
    prompt.prompt();
    try {
      await prompt.userChoice;
    } catch {}
    setPrompt(null);
  }

  const android = (
    <a key="android" className="portal-store" href="/downloads/rafiq.apk" download="rafiq.apk">
      <AndroidLogo size={34} weight="fill" aria-hidden="true" />
      <span>
        <small>{tr("تحميل مباشر · APK")}</small>
        <strong>{tr("تحميل لأندرويد")}</strong>
      </span>
    </a>
  );
  const ios = (
    <button key="ios" type="button" className="portal-store" onClick={() => setIosOpen(true)}>
      <AppleLogo size={34} weight="fill" aria-hidden="true" />
      <span>
        <small>{tr("تطبيق ويب · PWA")}</small>
        <strong>{tr("تثبيت على آيفون")}</strong>
      </span>
    </button>
  );

  return (
    <section id="install" ref={ref} className="portal-section portal-reveal" aria-labelledby="portal-install-title">
      <div className="portal-split">
        <div className="portal-split-copy">
          <h2 id="portal-install-title">{tr("تعلم في أي وقت، ومن أي جهاز")}</h2>
          <p>{tr("حسابك واحد على الهاتف والحاسوب. راجع بطاقاتك ومواظبتك حتى بدون اتصال، وتتزامن التغييرات تلقائياً.")}</p>
          <div className="portal-stores">{env.ios ? [ios, android] : [android, ios]}</div>
          <ol className="portal-steps" aria-label={tr("خطوات تثبيت تطبيق أندرويد")} style={{ listStyle: "none", padding: 0, margin: "1.25rem 0 0", display: "grid", gap: "0.75rem" }}>
            <li style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}><span><b>1.</b> {tr("حمّل الملف وافتحه")}</span></li>
            <li><b>2.</b> <strong>{tr("عند ظهور تنبيه Play Protect: اضغط على «مزيد من التفاصيل» ثم «التثبيت على أي حال»")}</strong>
              <br /><small style={{ color: "var(--p-muted)" }}>{tr("هذا التنبيه يظهر لكل تطبيق يُثبَّت خارج متجر Google Play، وليس دليلا على ضرر. يمكنك التحقق من سلامة الملف بالبصمة أدناه.")}</small></li>
            <li><b>3.</b> {tr("افتح التطبيق وسجّل الدخول")}</li>
          </ol>
          {sha && <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--p-muted)" }}>SHA-256: <bdi dir="ltr" style={{ wordBreak: "break-all", fontFamily: "monospace" }}>{sha}</bdi></p>}
          <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}><button type="button" className="portal-linkbtn" onClick={() => setIosOpen(true)}>{tr("على آيفون؟ دليل التثبيت")}</button></p>
          {prompt && (
            <button type="button" className="portal-linkbtn" onClick={webInstall}>
              {tr("أو ثبّته كتطبيق ويب من المتصفح")}
            </button>
          )}
        </div>
        <PhoneMockup />
      </div>
      <IosInstallModal open={iosOpen} onClose={closeIos} isIosSafari={env.iosSafari} />
    </section>
  );
}
