import { useEffect, useState } from "react";
import Law from "@/models/law";
import { Button, Notice } from "../ui";
import { tr } from "@/components/LawOS/lib/i18n";

function b64ToUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Close-out reminder (21:00 on class days) and Sunday recap (spec §8.5). */
export default function PushToggle() {
  const [sub, setSub] = useState(null);
  const [msg, setMsg] = useState(null);
  const supported = "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .then(setSub)
      .catch(() => {});
  }, [supported]);

  async function enable() {
    setMsg(null);
    if ((await Notification.requestPermission()) !== "granted")
      return setMsg(tr("لم يُسمح بالإشعارات في المتصفح."));
    const key = await Law.pushKey();
    if (!key.ok || !key.data.publicKey)
      return setMsg(tr("مفاتيح الإشعارات غير متوفرة على الخادم."));
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(key.data.publicKey),
    });
    const r = await Law.pushSubscribe({
      subscription: s.toJSON(),
      deviceId: localStorage.getItem("lawos_device_id"),
    });
    if (r.ok) setSub(s);
    else setMsg(tr("تعذر التسجيل."));
  }

  async function disable() {
    await Law.pushUnsubscribe(sub.endpoint);
    await sub.unsubscribe();
    setSub(null);
  }

  if (!supported)
    return (
      <Notice>
        {tr("هذا المتصفح لا يدعم الإشعارات. ثبّت التطبيق على الهاتف أولا.")}
      </Notice>
    );
  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-sm leading-7">
        {tr(
          "تذكير مساء أيام الحصص (21:00) بما ينتظرك في صندوق الوارد، وملخص الأسبوع يوم الأحد (20:00)."
        )}
      </p>
      {sub ? (
        <Button variant="secondary" onClick={disable} className="self-start">
          {tr("إيقاف الإشعارات")}
        </Button>
      ) : (
        <Button onClick={enable} className="self-start">
          {tr("تفعيل الإشعارات")}
        </Button>
      )}
      {msg && <Notice tone="warn">{msg}</Notice>}
    </div>
  );
}
