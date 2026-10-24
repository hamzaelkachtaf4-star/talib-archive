import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { lang, langInfo, tr } from "@/components/LawOS/lib/i18n";
import "@/components/LawOS/lawos.css";

const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|Loading chunk|module script/i;
const RELOAD_KEY = "qanouni_chunk_reload";

/**
 * Error screen for the Qanouni routes, instead of React Router's bare "Unexpected Application Error".
 * A part of the app that fails to load (a new version was deployed, or a file is missing offline)
 * triggers one automatic reload; after that, the student gets a clear message and a reload button.
 */
export default function RouteError() {
  const error = useRouteError();
  const message = String(error?.message || error?.statusText || error || "");
  const isChunk = CHUNK_ERROR.test(message);

  useEffect(() => {
    if (!isChunk || !navigator.onLine) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
    } catch {}
    if (Date.now() - last > 60_000) {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {}
      window.location.reload();
    }
  }, [isChunk]);

  return (
    <div
      dir={langInfo().dir}
      lang={lang()}
      className="lawos-root flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <img
        src="/lawos/icons/mascot.svg"
        alt=""
        aria-hidden="true"
        className="law-logo-mark h-16 w-16"
      />
      <p className="text-lg font-bold">
        {isChunk && !navigator.onLine
          ? tr("هذا الجزء من التطبيق غير محفوظ على الهاتف بعد.")
          : tr("تعذّر تحميل هذه الصفحة.")}
      </p>
      <p
        className="max-w-sm text-sm leading-7"
        style={{ color: "var(--law-muted)" }}
      >
        {isChunk && !navigator.onLine
          ? tr("اتصل بالإنترنت مرة واحدة ليُحفظ، ثم سيعمل بدون اتصال.")
          : tr("أعد التحميل. إن تكرر ذلك، أرسل هذه التفاصيل إلى المسؤول:")}
      </p>
      {!(isChunk && !navigator.onLine) && (
        <code
          dir="ltr"
          className="max-w-sm break-all text-xs"
          style={{ color: "var(--law-muted)" }}
        >
          {message.slice(0, 300)}
        </code>
      )}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="law-btn law-btn-primary"
      >
        {tr("إعادة التحميل")}
      </button>
    </div>
  );
}
