import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Law from "@/models/law";
import Sheet from "@/components/LawOS/kit/Sheet";
import Avatar from "@/components/LawOS/kit/Avatar";
import AvatarArt from "@/components/LawOS/avatar/AvatarArt";
import { Button } from "@/components/LawOS/ui";
import { useMyAvatar } from "@/components/LawOS/lib/myAvatar";
import { lang, tr } from "@/components/LawOS/lib/i18n";

const userName = () => { try { return JSON.parse(localStorage.getItem("lawos_user") || "{}").fullName || ""; } catch { return ""; } };

/** My QR card: avatar, name, faculty, the share code XXXX-XXXX with copy and WhatsApp. Never touches the camera. */
export default function QrShowModal({ open, onClose }) {
  const [code, setCode] = useState(null);
  const [faculty, setFaculty] = useState("");
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const avatar = useMyAvatar();
  const name = userName();
  useEffect(() => {
    if (!open || code) return;
    Law.friendCode().then((r) => (r.ok && r.data.shareCode ? setCode(r.data.shareCode) : setFailed(true)));
    Promise.all([Law.myAcademic(), Law.faculties()]).then(([a, f]) => {
      const fac = (f.ok ? f.data.faculties : []).find((x) => x.code === a.data?.academic?.facultyCode);
      if (fac) setFaculty(lang() === "fr" || lang() === "en" ? fac.nameFr : fac.nameAr);
    });
  }, [open, code]);
  const link = code ? `${window.location.origin}/law/profile?add=${encodeURIComponent(code)}` : "";
  const wa = code ? `https://wa.me/?text=${encodeURIComponent(tr("انضم إليّ على طالب! رمز الصداقة: {0}", [code]) + "\n" + link)}` : "#";
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <Sheet open={open} onClose={onClose} title={tr("رمزي")} variant="modal">
      <div className="grid justify-items-center gap-4">
        {code ? (
          <>
            <div className="flex items-center gap-3">
              {avatar ? <AvatarArt config={avatar} size={56} title={name} /> : <Avatar name={name} size={56} />}
              <div className="min-w-0 text-start">
                <p className="truncate font-bold"><bdi>{name}</bdi></p>
                {faculty && <p className="truncate text-sm" style={{ color: "var(--law-muted)" }}><bdi>{faculty}</bdi></p>}
              </div>
            </div>
            {/* A QR needs maximum contrast in both themes, so it always sits on a white tile. */}
            <div className="rounded-2xl p-3" style={{ background: "white" }}>
              <QRCodeSVG value={link} size={208} level="M" bgColor="white" fgColor="black" role="img" aria-label={tr("رمز QR الخاص بي")} />
            </div>
            <p className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("رمز الصداقة")}</p>
            <p className="text-xl font-bold tracking-widest"><bdi dir="ltr">{code}</bdi></p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={copy}>{copied ? tr("تم النسخ") : tr("نسخ الرمز")}</Button>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="law-btn law-btn-secondary no-underline">{tr("مشاركة عبر WhatsApp")}</a>
            </div>
          </>
        ) : failed ? (

          <p role="status" className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("تعذّر تحميل رمزك. تحقق من الاتصال.")}</p>
        ) : (
          <p role="status" className="text-sm" style={{ color: "var(--law-muted)" }}>{tr("جارٍ التحميل…")}</p>
        )}
        <Button variant="secondary" onClick={onClose}>{tr("إغلاق")}</Button>
      </div>
    </Sheet>
  );
}
