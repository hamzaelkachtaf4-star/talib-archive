import { useEffect, useState } from "react";
import Law from "@/models/law";
import Sheet from "@/components/LawOS/kit/Sheet";
import Chip from "@/components/LawOS/kit/Chip";
import Button3D from "@/components/LawOS/kit/Button3D";
import { lang, tr } from "@/components/LawOS/lib/i18n";

const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];

/** One-tap setup: semester → track → language → group (+ parcours), prefilled from the academic profile. */
export default function SetupSheet({ open, onClose, onDone }) {
  const [faculties, setFaculties] = useState([]);
  const [f, setF] = useState({ facultyCode: "FSJES_AIN_CHOCK", semester: "", track: "", language: "", groupCode: "", parcours: "" });
  const [cat, setCat] = useState({ groupCodes: [], parcours: [] });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    Law.faculties().then((r) => r.ok && setFaculties(r.data.faculties));
    Law.myAcademic().then((r) => r.ok && r.data.academic && setF((p) => ({ ...p, facultyCode: r.data.academic.facultyCode || p.facultyCode, semester: r.data.academic.semester || "", track: r.data.academic.track || "", language: r.data.academic.language || "", groupCode: r.data.academic.groupCode || "" })));
  }, [open]);
  useEffect(() => {
    if (!(f.facultyCode && f.semester && f.track && f.language)) return setCat({ groupCodes: [], parcours: [] });
    Law.ttCatalog({ facultyCode: f.facultyCode, semester: f.semester, track: f.track, language: f.language }).then((r) => r.ok && setCat(r.data));
  }, [f.facultyCode, f.semester, f.track, f.language]);

  const live = faculties.find((x) => x.code === f.facultyCode)?.isLive;
  const needParcours = cat.parcours.length > 0;
  const ready = live && f.groupCode && cat.groupCodes.includes(f.groupCode) && (!needParcours || f.parcours);

  async function save() {
    const r = await Law.ttSubscribe(f);
    if (!r.ok) return setErr(tr("هذا الفوج غير متوفر بعد. تحقق من اختياراتك."));
    onDone();
  }
  const set = (k) => (v) => setF({ ...f, [k]: v, ...(k !== "groupCode" && k !== "parcours" ? { groupCode: "", parcours: "" } : {}) });
  return (
    <Sheet open={open} onClose={onClose} title={tr("إعداد الجدول الرسمي")}>
      <div className="grid gap-4">
        <div>
          <p className="mb-1 text-sm font-bold">{tr("الكلية")}</p>
          <select className="law-input" value={f.facultyCode} onChange={(e) => set("facultyCode")(e.target.value)} aria-label={tr("الكلية")}>
            {faculties.map((x) => <option key={x.code} value={x.code}>{lang() === "ar" || lang() === "ary" ? x.nameAr : x.nameFr}</option>)}
          </select>
          {faculties.length > 0 && !live && <p className="mt-1 text-sm" style={{ color: "var(--law-warn)" }}>{tr("الجدول الرسمي غير منشور لهذه الكلية")}</p>}
        </div>
        <div><p className="mb-1 text-sm font-bold">{tr("الفصل")}</p><div className="flex flex-wrap gap-2">{SEMESTERS.map((s) => <Chip key={s} active={f.semester === s} onClick={() => set("semester")(s)}>{s}</Chip>)}</div></div>
        <div><p className="mb-1 text-sm font-bold">{tr("الشعبة")}</p><div className="flex gap-2"><Chip active={f.track === "PRIVE"} onClick={() => set("track")("PRIVE")}>{tr("القانون الخاص")}</Chip><Chip active={f.track === "PUBLIC"} onClick={() => set("track")("PUBLIC")}>{tr("القانون العام")}</Chip></div></div>
        <div><p className="mb-1 text-sm font-bold">{tr("اللغة")}</p><div className="flex gap-2"><Chip active={f.language === "AR"} onClick={() => set("language")("AR")}>{tr("عربية")}</Chip><Chip active={f.language === "FR"} onClick={() => set("language")("FR")}>{tr("فرنسية")}</Chip></div></div>
        {needParcours && <div><p className="mb-1 text-sm font-bold">{tr("المسار")}</p><div className="flex flex-wrap gap-2">{cat.parcours.map((p) => <Chip key={p} active={f.parcours === p} onClick={() => set("parcours")(p)}><bdi dir="ltr">{p}</bdi></Chip>)}</div></div>}
        <div>
          <p className="mb-1 text-sm font-bold">{tr("الفوج")}</p>
          {cat.groupCodes.length ? <div className="flex flex-wrap gap-2">{cat.groupCodes.map((g) => <Chip key={g} active={f.groupCode === g} onClick={() => set("groupCode")(g)}><bdi dir="ltr">{g}</bdi></Chip>)}</div>
            : <p className="text-sm" style={{ color: "var(--law-muted)" }}>{f.semester && f.track && f.language ? tr("لم يُنشر جدول هذا الفصل بعد.") : tr("اختر الفصل والشعبة واللغة.")}</p>}
        </div>
        {err && <p role="alert" className="text-sm" style={{ color: "var(--law-danger)" }}>{err}</p>}
        <Button3D block disabled={!ready} onClick={save}>{tr("تأكيد")}</Button3D>
      </div>
    </Sheet>
  );
}
