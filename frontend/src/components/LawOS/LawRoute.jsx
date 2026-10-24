import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Law from "@/models/law";
import { AUTH_TOKEN } from "@/utils/constants";
import { LawUserContext } from "./lib/useLawUser";
import { cachedUser, cacheUser } from "./lib/session";
import { lang, langInfo, tr } from "@/components/LawOS/lib/i18n";

// Remembers the last time the server confirmed this device's session. Offline, that is the only proof
// we have; offline data on the device belongs to that account (wiped when another account signs in).
const LAST_AUTH_KEY = "lawos_last_auth_ok";

/**
 * Qanouni guard. Online: first run → /law/setup; no or invalid token → /law/login; otherwise the account
 * from /api/law/auth/me. Offline: the last confirmed account, so the offline shell keeps working.
 */
function useLawAuth() {
  const [state, setState] = useState({ status: "checking" });
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const done = (s) => !cancelled && setState(s);
    const next = encodeURIComponent(location.pathname + location.search);

    (async () => {
      const config = await Law.authConfig();
      if (config.offline) {
        const user = cachedUser();
        return done(
          localStorage.getItem(LAST_AUTH_KEY) && user
            ? { status: "ok", offline: true, user }
            : { status: "offline-unknown" }
        );
      }
      if (config.data?.setupRequired)
        return done({ status: "redirect", to: "/law/setup" });
      if (!localStorage.getItem(AUTH_TOKEN))
        return done({ status: "redirect", to: `/law/login?next=${next}` });
      const me = await Law.me();
      if (!me.ok || !me.data?.user) {
        localStorage.removeItem(LAST_AUTH_KEY);
        return done({ status: "redirect", to: `/law/login?next=${next}` });
      }
      cacheUser(me.data.user);
      localStorage.setItem(LAST_AUTH_KEY, new Date().toISOString());
      done({ status: "ok", offline: false, user: me.data.user });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export default function LawRoute({ children }) {
  const auth = useLawAuth();
  if (auth.status === "checking") return <div className="lawos-root" />;
  if (auth.status === "redirect") return <Navigate to={auth.to} replace />;
  if (auth.status === "offline-unknown")
    return (
      <div
        dir={langInfo().dir}
        lang={lang()}
        className="lawos-root flex items-center justify-center p-8 text-center"
      >
        <p className="max-w-sm leading-8">
          {tr(
            "لا يوجد اتصال بالخادم. افتح التطبيق مرة واحدة وأنت متصل لتسجيل الدخول، ثم سيعمل بدون إنترنت."
          )}
        </p>
      </div>
    );
  return (
    <LawUserContext.Provider value={auth.user}>
      {children}
    </LawUserContext.Provider>
  );
}
