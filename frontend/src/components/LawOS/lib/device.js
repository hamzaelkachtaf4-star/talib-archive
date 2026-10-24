import Law from "@/models/law";
import { tr } from "@/components/LawOS/lib/i18n";

const KEY = "lawos_device_id";

function guessName() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return tr("هاتف Android");
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Macintosh/i.test(ua)) return "MacBook";
  return tr("متصفح");
}

/** Stable per-browser device id; registered with the server when online (spec §5.7 LawDevice). */
export async function deviceId() {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const res = await Law.registerDevice({
    name: guessName(),
    userAgent: navigator.userAgent,
  });
  if (res.ok && res.data?.device?.id) {
    localStorage.setItem(KEY, res.data.device.id);
    return res.data.device.id;
  }
  return null; // offline first run: logs carry no device id, which the server accepts
}
