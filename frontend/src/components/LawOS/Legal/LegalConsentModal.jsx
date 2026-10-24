import { useEffect, useState } from "react";
import { Scales } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Button, Notice } from "@/components/LawOS/ui";
import Sheet from "@/components/LawOS/kit/Sheet";
import { useLawUser } from "@/components/LawOS/lib/useLawUser";
import { lang, tr } from "@/components/LawOS/lib/i18n";
import { BRAND } from "@/config/brand";
import { NOTICE_VERSION, NoticeSections } from "./notice";

// One short line per condition; "read more" opens the full text (both languages, it is a legal notice) in a sheet.
// Which sections back each box: academic notice + AI warning, copyright, personal data.
const BOXES = [
  ["academicNotice", ["academic", "ai"], `أفهم أن ${BRAND.name.ar} أداة دراسية وليس استشارة قانونية.`, `Je comprends que ${BRAND.name.fr} est un outil d'étude, pas un conseil juridique.`],
  ["termsAccepted", ["copyright"], "ألتزم بحقوق المؤلف ولا أشارك تسجيلات الأساتذة.", "Je respecte le droit d'auteur et ne partage pas les cours enregistrés."],
  ["privacyAccepted", ["privacy"], "اطلعت على معالجة معطياتي وتنبيه الذكاء الاصطناعي.", "J'ai lu le traitement de mes données et l'avertissement sur l'IA."],
];

const cacheKey = (userId) => `qanouni_consent_${userId}_${NOTICE_VERSION}`;

/**
 * Required first-run screen (not a modal over the workspace): shown to a signed-in student until the current notice
 * version is accepted. Not dismissible. Acceptance (version + time) is recorded server-side on the user; localStorage
 * only caches it to avoid a flash. Offline it stays out of the way (acceptance cannot be checked or recorded).
 */
export default function LegalConsentModal() {
  const user = useLawUser();
  const [needed, setNeeded] = useState(false);
  const [boxes, setBoxes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (localStorage.getItem(cacheKey(user.id))) return;
    } catch {}
    Law.consent().then((r) => {
      if (!r.ok) return; // offline or server error: never block studying
      if (r.data.accepted) {
        try {
          localStorage.setItem(cacheKey(user.id), "1");
        } catch {}
      } else setNeeded(true);
    });
  }, [user?.id]);

  if (!needed) return null;
  const all = BOXES.every(([k]) => boxes[k]);
  const french = lang() === "fr" || lang() === "en";

  async function accept() {
    setBusy(true);
    setError(null);
    const r = await Law.acceptConsent({ ...Object.fromEntries(BOXES.map(([k]) => [k, true])), version: NOTICE_VERSION });
    setBusy(false);
    if (!r.ok) return setError(r.offline ? tr("لا يوجد اتصال بالخادم.") : tr("حدث خطأ. أعد المحاولة."));
    try {
      localStorage.setItem(cacheKey(user.id), "1");
    } catch {}
    setNeeded(false);
  }

  return (
    <>
      <Sheet open dismissible={false} variant="screen" title={tr("الإشعار القانوني")}>
        <p className="law-frac flex items-center gap-2"><Scales size={18} aria-hidden="true" /><bdi dir="ltr">v{NOTICE_VERSION}</bdi></p>
        <ul className="mt-4 grid gap-4" style={{ listStyle: "none", padding: 0 }}>
          {BOXES.map(([k, sections, ar, fr]) => (
            <li key={k}>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 shrink-0" checked={!!boxes[k]} onChange={(e) => setBoxes((b) => ({ ...b, [k]: e.target.checked }))} />
                <span dir={french ? "ltr" : "rtl"} lang={french ? "fr" : "ar"}>{french ? fr : ar}</span>
              </label>
              <button type="button" className="mt-1 text-xs font-semibold underline" style={{ color: "var(--law-primary)", marginInlineStart: "2rem" }} onClick={() => setReading(sections)}>
                {tr("اقرأ المزيد")}
              </button>
            </li>
          ))}
        </ul>
        {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
        <div className="mt-5">
          <Button type="button" disabled={!all || busy} onClick={accept}>
            {busy ? "…" : tr("أوافق وأتابع")}
          </Button>
        </div>
      </Sheet>
      <Sheet open={!!reading} onClose={() => setReading(null)} title={tr("الإشعار القانوني")} variant="modal">
        <div className="max-h-[60dvh] overflow-y-auto"><NoticeSections compact only={reading} /></div>
        <div className="mt-4"><Button type="button" onClick={() => setReading(null)}>{tr("إغلاق")}</Button></div>
      </Sheet>
    </>
  );
}
