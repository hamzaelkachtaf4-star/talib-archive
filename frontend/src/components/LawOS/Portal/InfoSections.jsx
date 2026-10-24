import { CheckCircle, Users, Robot, BookOpen, Scales, ArrowsClockwise, DeviceMobile } from "@phosphor-icons/react";
import { tr } from "@/components/LawOS/lib/i18n";
import useReveal from "./useReveal";
import TactileButton from "./TactileButton";

/** Showcase of the grounded AI methodology: facts → legal rule → solution, citing local-corpus articles. */
export function AssistantSection() {
  const ref = useReveal();
  const steps = [
    [tr("الوقائع"), tr("أبرم أحمد عقد بيع سيارة، وسلّم الثمن، ورفض البائع تسليم المبيع في الأجل المتفق عليه.")],
    [tr("الإشكال القانوني"), tr("هل يحق للمشتري المطالبة بالتنفيذ العيني أو الفسخ عند إخلال البائع بالتزام التسليم؟")],
    [tr("القاعدة القانونية المناسبة"), tr("يلتزم البائع بتسليم المبيع طبقاً لأحكام قانون الالتزامات والعقود، ويجوز للمشتري طلب التنفيذ أو الفسخ مع التعويض.")],
    [tr("الحل المقترح"), tr("يحق لأحمد إعذار البائع ثم المطالبة بالتنفيذ العيني أو فسخ العقد مع التعويض عن الضرر.")],
  ];
  return (
    <section ref={ref} className="portal-section portal-reveal" aria-labelledby="portal-ai-title">
      <div className="portal-section-head">
        <span className="portal-badge"><Robot size={16} weight="fill" /> {tr("المساعد القانوني الذكي")}</span>
        <h2 id="portal-ai-title">{tr("مساعد ذكي يوجهك خطوة بخطوة في المنهجية القانونية")}</h2>
        <p>{tr("اكتب محاولتك أولاً، ثم يراجعها المساعد خطوة بخطوة بالمنهجية المعتمدة في الامتحان، مع إحالات إلى مواد حقيقية فقط.")}</p>
      </div>
      <div className="portal-case" role="group" aria-label={tr("مثال على نازلة")}>
        <div className="portal-case-head">
          <span className="portal-chip">{tr("نازلة")}</span>
          <bdi className="portal-case-law">{tr("قانون الالتزامات والعقود")} · <bdi dir="ltr">{tr("ق.ل.ع")}</bdi></bdi>
        </div>
        <ol className="portal-case-steps">
          {steps.map(([h, b], i) => (
            <li key={i}>
              <span className="portal-case-num" aria-hidden="true"><bdi dir="ltr">{i + 1}</bdi></span>
              <div>
                <strong>{h}</strong>
                <p>{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="portal-case-promise">{tr("الذكاء الاصطناعي لا يعطيك أجوبة جاهزة، بل يدرّبك على التفكير والتحليل القانوني الرصين.")}</p>
        <p className="portal-case-note"><CheckCircle size={18} weight="fill" /> {tr("كل مادة مذكورة يتم التحقق منها في المدونة القانونية المحلية.")}</p>
      </div>
    </section>
  );
}

/** Squads: study together, share summaries, run mock exams. */
export function SquadSection({ onSignup }) {
  const ref = useReveal();
  const members = [["var(--law-primary)", "س"], ["var(--law-accent)", "م"], ["var(--law-gold-ink)", "ي"], ["var(--law-muted)", "ن"]];
  const feed = [
    [tr("ملخص ق.ل.ع: آثار العقد"), tr("شاركته مريم")],
    [tr("نازلة: فسخ عقد البيع"), tr("نقاش مفتوح · 6 ردود")],
    [tr("امتحان تجريبي للفرقة"), tr("السبت · 20:00")],
  ];
  return (
    <section ref={ref} className="portal-section portal-reveal" aria-labelledby="portal-squad-title">
      <div className="portal-split">
        <div className="portal-section-head">
          <span className="portal-badge"><Users size={16} weight="fill" /> {tr("مجموعات دراسية تفاعلية وتبادل المذكرات")}</span>
          <h2 id="portal-squad-title">{tr("راجع مع زملائك بتنظيم، وراجِعوا تعديلات بعضكم قبل اعتمادها")}</h2>
          <p>{tr("كوّن فرقة دراسة، تبادلوا الملخصات والأسئلة، واقترحوا تعديلات يراجعها مشرف الفرقة قبل دمجها.")}</p>
          <TactileButton variant="primary" onClick={onSignup}>{tr("ابدأ الآن")}</TactileButton>
        </div>
        <div className="portal-squad" role="group" aria-label={tr("مثال على مجموعة دراسية")}>
          <div className="portal-squad-head">
            <strong>{tr("فريق ق.ل.ع")}</strong>
            <span className="portal-avatars" aria-hidden="true">
              {members.map(([c, l]) => <i key={l} style={{ background: c }}>{l}</i>)}
            </span>
          </div>
          <ul className="portal-squad-feed">
            {feed.map(([t, m]) => (
              <li key={t}><strong>{t}</strong><span>{m}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** All-in-one toolbox: four feature cards. */
export function ToolboxSection() {
  const ref = useReveal();
  const cards = [
    [BookOpen, "green", tr("نصوص قانونية بمصادرها"), tr("نصوص رسمية تُدرج مع رابط مصدرها وتاريخ تحيينها.")],
    [Scales, "gold", tr("مركز الامتحانات"), tr("تمارين ونوازل تطبيقية مبنية على مادتك وأسلوب أستاذك.")],
    [ArrowsClockwise, "warm", tr("مراجعة ذكية بالتكرار المتباعد"), tr("فلاش كاردز ترسخ الفصول الصعبة في الذاكرة.")],
    [DeviceMobile, "blue", tr("تزامن بين الهاتف والحاسوب"), tr("حسابك وملخصاتك معك أينما ذهبت.")],
  ];
  return (
    <section ref={ref} className="portal-section portal-reveal" aria-labelledby="portal-tools-title">
      <div className="portal-section-head">
        <h2 id="portal-tools-title">{tr("أدوات تساندك في دراسة القانون وتحضير الامتحانات")}</h2>
      </div>
      <ul className="portal-tools">
        {cards.map(([Icon, tone, h, b]) => (
          <li key={h} className={`portal-tool portal-tool-${tone}`}>
            <span className="portal-tool-icon" aria-hidden="true"><Icon size={24} /></span>
            <strong>{h}</strong>
            <p>{b}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { default as SupportSection } from "./SupportHub";
