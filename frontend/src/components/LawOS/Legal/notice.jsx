// Legal notice, version 1.1.0 (Arabic and French, always shown together).
// Changing the substance of this text means bumping CONSENT_VERSION in server/models/lawConsent.js (and here),
// so every student accepts the new version. Not reviewed by a lawyer; the project owner confirmed the
// loi 2-00 art. 12 reference (private reproduction) and the Loi 09-08 disclosure of Gemini/DeepSeek processing.
import { BRAND } from "@/config/brand";

export const NOTICE_VERSION = "1.1.0";

export const NOTICE = [
  {
    key: "academic",
    ar: {
      title: "أداة بيداغوجية، لا استشارة قانونية",
      body: `${BRAND.name.ar} أداة تعليمية لطلبة القانون، تساعد على المراجعة والمنهجية فقط. لا يقدّم استشارة قانونية ولا نيابة ولا دفاعاً، ولا يقوم مقام المحامي. مزاولة مهنة المحاماة منظمة بالقانون رقم 28-08. في أي نزاع أو وضعية حقيقية، استشر محامياً مسجلاً في جدول هيئة المحامين.`,
    },
    fr: {
      title: "Outil pédagogique, pas un conseil juridique",
      body: `${BRAND.name.fr} est un outil d'apprentissage pour étudiants en droit (révision et méthodologie). Il ne fournit ni consultation juridique, ni représentation, ni assistance en justice et ne remplace pas un avocat. L'exercice de la profession d'avocat est régi par la loi n° 28-08. Pour toute situation réelle, consultez un avocat inscrit au barreau.`,
    },
  },
  {
    key: "copyright",
    ar: {
      title: "حقوق المؤلف والحياة الخاصة",
      body: "المحاضرات والمطبوعات ومراجع الأساتذة محمية بالقانون رقم 2-00 المتعلق بحقوق المؤلف والحقوق المجاورة. ما تلتقطه (صور، تسجيلات، ملفات) هو لاستعمالك الشخصي في الدراسة فقط، في حدود استثناء الاستعمال الخاص (المادة 12)، فلا تنشره ولا تشاركه. تسجيل كلام شخص دون موافقته قد يعاقب عليه الفصل 447-1 من مجموعة القانون الجنائي: لا تسجّل المحاضرة إلا بإذن الأستاذ. في فرق الدراسة تتشاركون ملخصاتكم الشخصية ومراجع (فصول، صفحات) فقط، ولا تُشارَك أبداً تسجيلات الأستاذ أو ملفاته.",
    },
    fr: {
      title: "Droit d'auteur et vie privée",
      body: "Les cours, polycopiés et supports des enseignants sont protégés par la loi n° 2-00 relative aux droits d'auteur et droits voisins. Vos captures (photos, enregistrements, fichiers) sont réservées à votre usage personnel d'étude, dans les limites de l'exception d'usage privé (article 12) : ne les publiez pas et ne les partagez pas. Enregistrer les paroles d'une personne sans son consentement peut être puni par l'article 447-1 du Code pénal : n'enregistrez un cours qu'avec l'accord de l'enseignant. Dans les groupes d'étude, on partage uniquement ses propres synthèses et des références (articles, pages), jamais les enregistrements ou fichiers de l'enseignant.",
    },
  },
  {
    key: "privacy",
    ar: {
      title: "معطياتك الشخصية",
      body: "تُعالج معطياتك وفق القانون رقم 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي. يُخزَّن حسابك ومحتواك على خادم المنصة ويُستعمل لتشغيل الخدمة فقط، ولا يُباع ولا يُستعمل للإشهار. تنبيه: ميزات الذكاء الاصطناعي (قراءة الصور، تفريغ التسجيلات، التصحيح) ترسل المحتوى المعني إلى مزودين خارج المغرب (Google Gemini وDeepSeek) لمعالجته. يحق لك الولوج إلى معطياتك وتصحيحها والتعرض على معالجتها وطلب حذف حسابك بمراسلة المسؤول عن المنصة.",
    },
    fr: {
      title: "Vos données personnelles",
      body: "Vos données sont traitées conformément à la loi n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel. Votre compte et votre contenu sont stockés sur le serveur de la plateforme et servent uniquement au fonctionnement du service ; ils ne sont ni vendus ni utilisés à des fins publicitaires. Attention : les fonctions d'IA (lecture de photos, transcription, correction) envoient le contenu concerné à des prestataires situés hors du Maroc (Google Gemini, DeepSeek) pour traitement. Vous disposez d'un droit d'accès, de rectification et d'opposition, et pouvez demander la suppression de votre compte auprès de l'administrateur de la plateforme.",
    },
  },
  {
    key: "ai",
    ar: {
      title: "الذكاء الاصطناعي قد يخطئ",
      body: "الملخصات والتصحيحات المولّدة بالذكاء الاصطناعي قد تتضمن أخطاء أو معلومات غير محيّنة. ليست مصدراً رسمياً للقانون: تحقق دائماً من النصوص الرسمية المنشورة في الجريدة الرسمية ومن محاضرة الأستاذ. تُنبَّه الإحالات إلى فصول غير موجودة في النصوص المحفوظة في التطبيق وتُحذف. «ذاكرتي»: لتخصيص الشرح، يحتفظ التطبيق بملاحظات أكاديمية فقط عن مواضع الخلط التي تظهر في تمارينك وبطاقاتك ومحادثاتك (لا تحليل لشخصيتك)؛ تراها وتحذفها وتصدّرها وتوقف جمعها في أي وقت من الإعدادات.",
    },
    fr: {
      title: "L'IA peut se tromper",
      body: "Les synthèses et corrections générées par l'IA peuvent contenir des erreurs ou des informations non à jour. Elles ne sont pas une source officielle du droit : vérifiez toujours les textes officiels publiés au Bulletin officiel (الجريدة الرسمية) et le cours de l'enseignant. Les renvois à des articles absents des textes enregistrés dans l'application sont signalés et retirés. « Ma mémoire » : pour personnaliser les explications, l'application conserve uniquement des notes académiques sur les confusions repérées dans vos exercices, cartes et conversations (aucun profilage de personnalité) ; vous pouvez les consulter, les supprimer, les exporter et arrêter leur collecte à tout moment dans les paramètres.",
    },
  },
];

/** The two languages side by side (Arabic RTL, French LTR). */
export function NoticeSections({ compact = false, only = null }) {
  return (
    <div className="flex flex-col gap-4">
      {NOTICE.filter((s) => !only || only.includes(s.key)).map((s) => (
        <section key={s.key} className="rounded-lg p-4" style={{ background: "var(--law-surface-2)" }}>
          <div dir="rtl" lang="ar">
            <h3 className="font-bold">{s.ar.title}</h3>
            <p className={`mt-1 leading-7 ${compact ? "text-xs" : "text-sm"}`}>{s.ar.body}</p>
          </div>
          <div dir="ltr" lang="fr" className="mt-3 border-t pt-3" style={{ borderColor: "var(--law-border)" }}>
            <h3 className="font-bold">{s.fr.title}</h3>
            <p className={`mt-1 leading-6 ${compact ? "text-xs" : "text-sm"}`} style={{ color: "var(--law-muted)" }}>
              {s.fr.body}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
