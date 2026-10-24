import { useEffect, useState } from "react";
import { Copy, Check, ShareNetwork, Megaphone } from "@phosphor-icons/react";
import Law from "@/models/law";
import { Card } from "@/components/LawOS/ui";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";

/**
 * Invite card (نظام الإحالات): my code and link, my invitees and their progress. A referral counts only once
 * the invited student has really studied (anti-farming); then one more squad seat.
 */
export default function Referrals() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    Law.referrals().then((r) => r.ok && setData(r.data));
  }, []);
  if (!data) return null;
  const link = `${window.location.origin}/law/register?ref=${encodeURIComponent(data.code)}`;
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  async function share() {
    const text = tr("انضم إلى {0}، منصة طلبة القانون: {1}", [brandName(lang()), link]);
    if (navigator.share) {
      try {
        return await navigator.share({ title: brandName(lang()), text, url: link });
      } catch {}
    }
    copy(text);
  }
  const { rules } = data;
  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Megaphone size={18} style={{ color: "var(--law-accent)" }} /> {tr("ادعُ زملاءك")}
        {data.ambassador && (
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--law-accent)", color: "var(--law-on-primary)" }}>
            {tr("سفير الفوج")}
          </span>
        )}
      </h2>
      <p className="mb-3 text-xs leading-6" style={{ color: "var(--law-muted)" }}>
        {tr("تُحتسب الدعوة بعد أن يدرس زميلك فعلاً ({0} حصص دراسة أو {1} مراجعة). المقابل: مقعد إضافي في فرقتك (حتى {2}).", [
          rules.minSessions,
          rules.minReviews,
          rules.maxSeats,
        ])}
      </p>
      <div className="flex items-center justify-between gap-2 rounded-2xl p-3" style={{ background: "var(--law-surface-2)" }}>
        <bdi dir="ltr" className="font-bold tracking-wider">
          {data.code}
        </bdi>
        <div className="flex gap-2">
          <button type="button" className="law-btn law-btn-secondary px-3" onClick={() => copy(link)} aria-label={tr("نسخ رابط الدعوة")}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <button type="button" className="law-btn law-btn-primary px-3" onClick={share} aria-label={tr("مشاركة")}>
            <ShareNetwork size={18} />
          </button>
        </div>
      </div>
      {data.referrals.length > 0 && (
        <ul className="mt-3 flex flex-col text-sm">
          {data.referrals.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: "1px solid var(--law-border)" }}>
              <bdi>{r.name}</bdi>
              {r.status === "activated" ? (
                <span className="text-xs font-semibold" style={{ color: "var(--law-ok)" }}>
                  {tr("دعوة مفعّلة")}
                </span>
              ) : (
                <span className="text-xs" style={{ color: "var(--law-muted)" }}>
                  {tr("في الطريق: {0}/{1} حصص · {2}/{3} مراجعة", [r.progress.sessions, rules.minSessions, r.progress.reviews, rules.minReviews])}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
