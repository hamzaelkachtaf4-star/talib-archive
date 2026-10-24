import { useRef, useState } from "react";
import { CaretDown, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";
import TactileButton from "./TactileButton";
import useReveal from "./useReveal";

const FAQS = [
  ["هل يعمل التطبيق بدون إنترنت؟", "نعم، بفضل تقنية الـ PWA يمكنك حفظ الملخصات والعمل Offline، وتتزامن تقدماتك عند عودة الاتصال."],
  ["كيف أثبت التطبيق على هواتف أندرويد وآيفون؟", "أندرويد: حمّل التطبيق أو اختر «تثبيت» من متصفح Chrome. آيفون: افتح المنصة في Safari، اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»."],
  ["هل يكفي حساب واحد لجميع أجهزتي؟", "نعم، حساب واحد يكفي وتتزامن بياناتك بين أجهزتك."],
];

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`portal-acc${open ? " is-open" : ""}`}>
      <button type="button" className="portal-acc-q" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{tr(q)}</span>
        <CaretDown size={18} weight="bold" aria-hidden="true" />
      </button>
      <div className="portal-acc-a" aria-hidden={!open}>
        <p>{tr(a)}</p>
      </div>
    </div>
  );
}

/** Student support hub: mascot contact card with one-tap copy, plus a smooth accordion FAQ. */
export default function SupportHub({ email }) {
  const ref = useReveal();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      window.location.href = `mailto:${email}`;
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section id="support" ref={ref} className="portal-section portal-reveal" aria-labelledby="portal-support-title">
      <div className="portal-section-head">
        <h2 id="portal-support-title">{tr("نحن هنا لمساعدتك في كل خطوة")}</h2>
      </div>
      <div className="portal-hub">
        <div className="portal-contact">
          <div className="portal-contact-bubble">
            <p>{tr("هل تحتاج مساعدة في مراجعتك القانونية؟")}</p>
          </div>
          <span className="portal-status">{tr("راسلنا وسنرد عليك عبر البريد")}</span>
          <TactileButton variant="primary" block onClick={copy} aria-label={`${tr("نسخ البريد الإلكتروني")} ${email}`}>
            <EnvelopeSimple size={20} weight="bold" />
            <bdi dir="ltr">{email}</bdi>
          </TactileButton>
          <TactileButton
            variant="secondary"
            block
            size="md"
            href={`mailto:${email}?subject=${encodeURIComponent(tr("شكاية أو استفسار حول {0}", [brandName(lang())]))}`}
          >
            {tr("إرسال رسالة")}
          </TactileButton>
          <div className={`portal-toast${copied ? " is-on" : ""}`} role="status" aria-live="polite">
            {copied && <><CheckCircle size={18} weight="fill" /> {tr("تم نسخ البريد الإلكتروني")}</>}
          </div>
        </div>
        <div className="portal-faq">
          {FAQS.map(([q, a]) => <Faq key={q} q={q} a={a} />)}
        </div>
      </div>
    </section>
  );
}
