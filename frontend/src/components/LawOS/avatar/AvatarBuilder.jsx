import { useRef, useState } from "react";
import { ArrowCounterClockwise, DiceFive } from "@phosphor-icons/react";
import AvatarArt from "./AvatarArt";
import Chip from "../kit/Chip";
import Button3D from "../kit/Button3D";
import { CATEGORIES, LEGAL_SETS, OPTIONS, PRESETS, applySet, randomAvatar, sanitizeAvatar } from "./avatarConfig";
import { PREVIEW } from "./avatarPalette";
import { Notice } from "@/components/LawOS/ui";
import { tr } from "@/components/LawOS/lib/i18n";

const LABELS = () => ({
  skinTone: tr("لون البشرة"), face: tr("شكل الوجه"), expression: tr("التعبير"), hair: tr("الشعر"), headwear: tr("غطاء الرأس"), outfit: tr("اللباس"), accessory: tr("إكسسوار"), bg: tr("الخلفية"), eyes: tr("العينان"), brows: tr("الحاجبان"), facialHair: tr("اللحية والشارب"),
  almond: tr("لوزية"), narrow: tr("ضيقة"), natural: tr("طبيعي"), thick: tr("كثيف"), arched: tr("مقوّس"), thin: tr("رفيع"), moustache: tr("شارب"), beard: tr("لحية"), goatee: tr("سكسوكة"),
  none: tr("بدون"), short: tr("قصير"), long: tr("طويل"), curly: tr("مجعد"), tarboosh: tr("طربوش"), cap: tr("قبعة"), hijab: tr("حجاب"), rezza: tr("رزة"),
  casual: tr("عادي"), robe: tr("جلباب"), suit: tr("بدلة"), judge: tr("بذلة القاضي"), lawyer: tr("روب المحاماة"), adoul: tr("عدل / موثق"), professor: tr("أستاذ جامعي"), student: tr("طالب حقوق"),
  glasses: tr("نظارات"), book: tr("كتاب"), gavel: tr("مطرقة"), scales: tr("ميزان"), scroll: tr("عقد"),
  oval: tr("بيضاوي"), round: tr("مستدير"), square: tr("مربع"), calm: tr("هادئ"), smile: tr("مبتسم"), serious: tr("جاد"), focused: tr("مركّز"),
});
const TAB = () => ({ sets: tr("الأطقم القانونية"), face: tr("الوجه"), eyes: tr("العينان والحاجبان"), hair: tr("الشعر والرأس"), outfit: tr("اللباس"), accessory: tr("إكسسوار"), bg: tr("الخلفية") });
const swatch = (k) => k === "skinTone" || k === "bg";
const MAX_UNDO = 30;

/** Avatar studio: legal attire sets, per-layer categories, live preview on both themes, randomize and undo. onSave(config) persists it. */
export default function AvatarBuilder({ value, onSave, onCancel, rng, error }) {
  const [cfg, setCfg] = useState(() => sanitizeAvatar(value));
  const [tab, setTab] = useState("sets");
  const history = useRef([]);
  const [undoable, setUndoable] = useState(false);
  const L = LABELS();
  const T = TAB();
  const change = (next) => {
    if (JSON.stringify(next) === JSON.stringify(cfg)) return; // choosing what is already chosen is not a step to undo
    history.current = [...history.current.slice(-(MAX_UNDO - 1)), cfg];
    setUndoable(true);
    setCfg(next);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) setCfg(prev);
    setUndoable(history.current.length > 0);
  };
  const category = CATEGORIES.find((c) => c.id === tab);
  const onTabKey = (e) => {
    const dir = typeof document !== "undefined" && document.documentElement.dir === "rtl" ? -1 : 1;
    const step = { ArrowRight: dir, ArrowLeft: -dir }[e.key];
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = CATEGORIES.findIndex((c) => c.id === tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? CATEGORIES.length - 1 : (i + step + CATEGORIES.length) % CATEGORIES.length;
    setTab(CATEGORIES[next].id);
    document.getElementById(`avatar-tab-${CATEGORIES[next].id}`)?.focus();
  };
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3" aria-label={tr("معاينة في الفاتح والداكن")}>
        {Object.entries(PREVIEW).map(([mode, bg]) => (
          <div key={mode} data-preview={mode} role="group" aria-label={mode === "light" ? tr("معاينة في الوضع الفاتح") : tr("معاينة في الوضع الداكن")} className="flex justify-center rounded-2xl p-3" style={{ background: bg, border: "1px solid var(--law-border)" }}>
            <AvatarArt config={cfg} size={112} title={mode === "light" ? tr("معاينة في الوضع الفاتح") : tr("معاينة في الوضع الداكن")} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button3D variant="neutral" onClick={() => change(randomAvatar(rng))}><DiceFive size={16} aria-hidden="true" /> {tr("عشوائي")}</Button3D>
        <Button3D variant="neutral" onClick={undo} disabled={!undoable}><ArrowCounterClockwise size={16} aria-hidden="true" /> {tr("تراجع")}</Button3D>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={tr("فئات الصورة الرمزية")} onKeyDown={onTabKey}>
        {CATEGORIES.map((c) => <Chip key={c.id} id={`avatar-tab-${c.id}`} role="tab" aria-selected={tab === c.id} aria-controls="avatar-panel" tabIndex={tab === c.id ? 0 : -1} active={tab === c.id} onClick={() => setTab(c.id)}>{T[c.id]}</Chip>)}
      </div>
      <div role="tabpanel" id="avatar-panel" aria-labelledby={`avatar-tab-${tab}`} className="grid gap-4">
        {tab === "sets" && (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label={tr("الأطقم القانونية")}>
              {LEGAL_SETS.map((s) => (
                <button key={s.id} type="button" onClick={() => change(applySet(cfg, s.id))} aria-pressed={cfg.outfit === s.config.outfit} className="flex flex-col items-center gap-1 text-xs font-semibold">
                  <AvatarArt config={applySet(cfg, s.id)} size={56} />
                  {L[s.id]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={tr("صور جاهزة")}>
              {PRESETS.map((p, i) => (
                <button key={i} type="button" onClick={() => change(sanitizeAvatar(p))} aria-label={`${tr("صورة جاهزة")} ${i + 1}`} className="rounded-full"><AvatarArt config={p} size={44} /></button>
              ))}
            </div>
          </>
        )}
        {category.keys.map((key) => (
          <div key={key}>
            <p className="mb-1 text-sm font-bold">{L[key]}</p>
            <div className="flex flex-wrap gap-2">
              {OPTIONS[key].map((o) => swatch(key) ? (
                <button key={o} type="button" aria-label={`${L[key]} ${OPTIONS[key].indexOf(o) + 1}`} aria-pressed={cfg[key] === o} onClick={() => change({ ...cfg, [key]: o })}
                  style={{ inlineSize: 32, blockSize: 32, borderRadius: "50%", background: o, border: cfg[key] === o ? "3px solid var(--law-text)" : "2px solid var(--law-border)" }} />
              ) : (
                <Chip key={o} active={cfg[key] === o} onClick={() => change({ ...cfg, [key]: o })}>{L[o]}</Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      <div className="flex gap-3">
        <Button3D onClick={() => onSave(cfg)}>{tr("حفظ")}</Button3D>
        <Button3D variant="neutral" onClick={onCancel}>{tr("إلغاء")}</Button3D>
      </div>
    </div>
  );
}
