import { tr, lang } from "@/components/LawOS/lib/i18n";
import { BRAND } from "@/config/brand";
import TactileButton from "./TactileButton";

export default function HeroDuolingo({ onSignup, onLogin }) {
  return (
    <section className="portal-hero" aria-labelledby="portal-hero-title">
      <div className="portal-hero-copy">
        <p className="portal-eyebrow">{BRAND.tagline[lang()]}</p>
        <h1 id="portal-hero-title">{tr("المنصة الذكية التي ترافقك في تفكيك المنهجية القانونية والتحضير المتين للامتحانات والمباريات")}</h1>
        <p className="portal-lede">{tr("منهجية قانونية رصينة · مواكبة دقيقة لكل مادة · تلخيص ومراجعة توافق أسلوب أساتذتك")}</p>
        <div className="portal-cta">
          <TactileButton variant="primary" block onClick={onSignup}>
            {tr("ابدأ الآن")}
          </TactileButton>
          <TactileButton variant="secondary" block onClick={onLogin}>
            {tr("لدي حساب بالفعل")}
          </TactileButton>
        </div>
        <ul className="portal-stats" aria-label={tr("مزايا المنصة")}>
          <li>{tr("نصوص قانونية بمصادرها")}</li>
          <li>{tr("مراجعة بالتكرار المتباعد")}</li>
          <li>{tr("يعمل دون اتصال")}</li>
        </ul>
      </div>
    </section>
  );
}
