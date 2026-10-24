// frontend/src/pages/LawOS/Welcome.jsx
// Wizard de bienvenue « طالب » en 4 étapes (الترحيب · الشخصية · الكلية · المسار) + carte profil live.
// Lit 'talib.auth.v1' (et écoute 'talib-auth'), écrit 'talib.profile.v1' et 'talib.avatar.v2' (config du personnage).
//
// Props (optionnelles) :
//   appHref            destination finale                         (défaut '/app/profile')
//   landingHref        lien du logo                               (défaut '/')
//   onNavigate(href)   navigation SPA ; sinon window.location.assign
//   onFinish(profile)  appelé après l'écriture du profil (ex. sync serveur) ; remplace la navigation si fourni
//   renderAvatar({ config, size, interactive })  rendu du personnage. Passe ton composant TalibAvatar
//                      (mêmes clés de config que TalibAvatar.dc.html). Sinon : avatar SVG simplifié intégré.
//   authApi            transmis à AuthSheet (voir Portal.jsx)

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthSheet, Icons, TalibKeyframes, readAuth, readProfile, PROFILE_KEY } from './Portal';
import { TalibLogo, FallbackAvatar } from '@/components/LawOS/avatar/TalibAvatar';

export const AVATAR_KEY = 'talib.avatar.v2';

/* ---------- Données ---------- */
export const FACULTIES = [
  { id: 'ainchock', area: 'عين الشق', city: 'الدار البيضاء', uni: 'جامعة الحسن الثاني', lat: 'Ain Chock Casablanca FSJES' },
  { id: 'ainsebaa', area: 'عين السبع', city: 'الدار البيضاء', uni: 'جامعة الحسن الثاني', lat: 'Ain Sebaa Casablanca' },
  { id: 'mohammedia', area: 'المحمدية', city: 'المحمدية', uni: 'جامعة الحسن الثاني', lat: 'Mohammedia' },
  { id: 'agdal', area: 'أكدال', city: 'الرباط', uni: 'جامعة محمد الخامس', lat: 'Agdal Rabat' },
  { id: 'souissi', area: 'السويسي', city: 'الرباط', uni: 'جامعة محمد الخامس', lat: 'Souissi Rabat' },
  { id: 'sale', area: 'سلا', city: 'سلا', uni: 'جامعة محمد الخامس', lat: 'Sale' },
  { id: 'kenitra', area: 'القنيطرة', city: 'القنيطرة', uni: 'جامعة ابن طفيل', lat: 'Kenitra Ibn Tofail' },
  { id: 'settat', area: 'سطات', city: 'سطات', uni: 'جامعة الحسن الأول', lat: 'Settat Hassan 1er' },
  { id: 'marrakech', area: 'مراكش', city: 'مراكش', uni: 'جامعة القاضي عياض', lat: 'Marrakech Cadi Ayyad' },
  { id: 'fes', area: 'فاس', city: 'فاس', uni: 'جامعة سيدي محمد بن عبد الله', lat: 'Fes Sidi Mohamed Ben Abdellah' },
  { id: 'meknes', area: 'مكناس', city: 'مكناس', uni: 'جامعة مولاي إسماعيل', lat: 'Meknes Moulay Ismail' },
  { id: 'tanger', area: 'طنجة', city: 'طنجة', uni: 'جامعة عبد المالك السعدي', lat: 'Tanger Tangier Abdelmalek Essaadi' },
  { id: 'tetouan', area: 'تطوان', city: 'تطوان', uni: 'جامعة عبد المالك السعدي', lat: 'Tetouan Martil' },
  { id: 'oujda', area: 'وجدة', city: 'وجدة', uni: 'جامعة محمد الأول', lat: 'Oujda Mohammed Premier' },
  { id: 'agadir', area: 'أكادير', city: 'أكادير', uni: 'جامعة ابن زهر', lat: 'Agadir Ibn Zohr' },
];
const facMatch = (f, q) => { q = q.trim().toLowerCase(); return !q || `${f.area} ${f.city} ${f.uni} ${f.lat}`.toLowerCase().includes(q); };

const DEF = { beard: 'none', hijab: 'none', glasses: 'none', acc: 'none', freckles: false, earrings: false, eyes: 'round', brows: 'normal', mood: 'smile' };
const CHARS = [
  ['me', 'طالب', { gender: 'boy', skin: 1, hair: 'short', hairColor: 0, beard: 'short', bg: 0 }],
  ['salma', 'طالبة بالحجاب', { gender: 'girl', skin: 0, hair: 'long', hairColor: 1, hijab: 'classic', hijabColor: 2, glasses: 'round', eyes: 'big', bg: 3 }],
  ['noura', 'طالبة', { gender: 'girl', skin: 2, hair: 'bun', hairColor: 0, freckles: true, earrings: true, bg: 0 }],
  ['hamza', 'بلحية', { gender: 'boy', skin: 2, hair: 'side', hairColor: 0, beard: 'full', brows: 'thick', bg: 1 }],
  ['fatima', 'بحجاب ملفوف', { gender: 'girl', skin: 1, hair: 'long', hijab: 'wrap', hijabColor: 3, glasses: 'round', bg: 2 }],
  ['amine', 'سكسوكة', { gender: 'boy', skin: 3, hair: 'fade', hairColor: 0, beard: 'goatee', eyes: 'almond', bg: 4 }],
  ['khadija', 'حجاب أخضر', { gender: 'girl', skin: 3, hair: 'long', hijab: 'classic', hijabColor: 0, eyes: 'almond', bg: 6 }],
  ['yassine', 'بشارب', { gender: 'boy', skin: 2, hair: 'curly', hairColor: 1, beard: 'mustache', bg: 5 }],
];
const OUTFITS = [['robe', 'روب المحاماة', {}], ['shirt', 'زي رسمي', { topColor: 7 }], ['hoodie', 'ستايل طالب', { topColor: 1 }], ['djellaba', 'جلابة', { topColor: 6 }]];
const GOALS = [['lawyer', 'مباراة المحاماة'], ['judge', 'الملحقون القضائيون'], ['bailiff', 'المفوضون القضائيون'], ['none', 'لم أحدد بعد']];
const STEP_LABELS = ['الترحيب', 'الشخصية', 'الكلية', 'المسار'];
const HEAD = [
  ['خطوة 1 من 4', 'مرحباً بك في طالب', 'منصتك لدراسة القانون المغربي بطريقتك: دروسك، نوازلك، ومراجعاتك في مكان واحد، وتعمل حتى بدون إنترنت.'],
  ['خطوة 2 من 4', 'اختر شخصيتك', 'هكذا سيراك زملاؤك في الملتقى والمجموعات.'],
  ['خطوة 3 من 4', 'في أي كلية تدرس؟', 'نرتب لك المواد والزملاء والمجموعات حسب كليتك.'],
  ['خطوة 4 من 4', 'مسارك الأكاديمي', 'نجهز موادك ومسار الامتحانات حسب شعبتك وفصلك.'],
];
const PILLARS = [
  { icon: 'book', t: 'المسار الدراسي', d: 'موادك من استعمال الزمن، بطريقة التعلم التي تختارها: خطاطات، جداول، ملخصات أو بطاقات.', tone: 'bg-emerald-50 text-emerald-700' },
  { icon: 'scale', t: 'مركز الامتحانات والنوازل', d: 'QCM، أسئلة تحليلية ونوازل تُصحح خطوة بخطوة بالمنهجية المعتمدة.', tone: 'bg-amber-50 text-amber-700' },
  { icon: 'users', t: 'مجتمع الطلبة', d: 'شارك ملخصاتك، اقترح تعديلات على مشاريع زملائك، ونظموا لقاءات المراجعة.', tone: 'bg-slate-100 text-slate-700' },
];
export const avatarConfig = (ch, outfit) => {
  const c = CHARS.find((x) => x[0] === ch) || CHARS[0];
  const o = OUTFITS.find((x) => x[0] === outfit) || OUTFITS[0];
  return { ...DEF, ...c[2], top: o[0], ...o[2] };
};

/* ---------- Avatar de repli (si renderAvatar non fourni) ---------- */

/* ---------- Petits composants ---------- */
const on = 'border-emerald-600 bg-emerald-50 text-slate-900 shadow-[0_3px_0_rgb(5,122,68)]';
const off = 'border-slate-200 bg-white text-slate-800 shadow-[0_3px_0_rgb(226,232,240)] hover:border-slate-300';
const press = 'transition-[transform,box-shadow] duration-100 active:translate-y-[3px] active:shadow-none';
const Seg = ({ items, value, onChange, mono }) => (
  <div className="flex gap-0.5 p-[3px] rounded-xl bg-slate-100">
    {items.map(([k, label]) => (
      <button key={k} onClick={() => onChange(k)} aria-pressed={value === k}
        className={`flex-1 h-10 rounded-[10px] text-sm font-bold whitespace-nowrap transition-colors ${mono ? 'font-mono' : ''} ${value === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
    ))}
  </div>
);
const Label = ({ children }) => <div className="text-sm font-bold text-slate-900 mb-2.5">{children}</div>;

/* ---------- Page ---------- */
export default function Welcome({ appHref = '/law/today', landingHref = '/', onNavigate, onFinish, renderAvatar, authApi }) {
  const navigate = useNavigate();
  const nav = onNavigate || navigate;
  const prof0 = useMemo(() => readProfile() || {}, []);
  const [auth, setAuth] = useState(() => readAuth());
  const [authOpen, setAuthOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [name, setName] = useState(prof0.name || readAuth()?.name || '');
  const [avKind, setAvKind] = useState(readAuth()?.avatar ? 'google' : 'char');
  const [ch, setCh] = useState(prof0.char || 'me');
  const [outfit, setOutfit] = useState(prof0.outfit || 'robe');
  const [facQ, setFacQ] = useState('');
  const [fac, setFac] = useState(prof0.faculty || null);
  const [facOther, setFacOther] = useState(prof0.facultyOther || '');
  const [track, setTrack] = useState(prof0.track || null);
  const [lang, setLang] = useState(prof0.lang || 'ar');
  const [sem, setSem] = useState(prof0.sem || 'S1');
  const [group, setGroup] = useState(prof0.group || '');
  const [goal, setGoal] = useState(prof0.goal || null);

  useEffect(() => {
    const sync = () => { const a = readAuth(); setAuth(a); if (a?.name) setName((n) => n || a.name); if (a?.avatar) setAvKind('google'); };
    window.addEventListener('talib-auth', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('talib-auth', sync); window.removeEventListener('storage', sync); };
  }, []);

  const Avatar = ({ config, size, interactive }) => (renderAvatar ? renderAvatar({ config, size, interactive }) : <FallbackAvatar config={config} size={size} />);
  const hasPhoto = !!auth?.avatar;
  const photoStyle = hasPhoto ? { backgroundImage: `url("${String(auth.avatar).replace(/"/g, '')}")` } : undefined;
  const cfg = avatarConfig(ch, outfit);
  const facs = FACULTIES.filter((f) => facMatch(f, facQ));
  const facObj = FACULTIES.find((f) => f.id === fac);
  const facLabel = facObj ? `كلية الحقوق ${facObj.area}` : facOther.trim();
  const okStep = [true, name.trim().length >= 2, !!fac || facOther.trim().length >= 3, !!track && !!sem][step];
  const hint = ['', 'أدخل اسمك للمتابعة', 'اختر كليتك أو اكتب اسمها', 'اختر الشعبة'][step];
  const [kicker, title, lead] = HEAD[step];

  const goStep = (i) => { setStep(i); setMaxStep((m) => Math.max(m, i)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const finish = () => {
    const profile = { name: name.trim(), avatarKind: avKind, char: ch, outfit, faculty: fac, facultyOther: fac ? '' : facOther.trim(), facultyLabel: facLabel, track, lang, sem, group: group.trim().toUpperCase(), goal: goal === 'none' ? null : goal, at: new Date().toISOString() };
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      if (avKind === 'char') localStorage.setItem(AVATAR_KEY, JSON.stringify(cfg));
      localStorage.setItem('qanouni_lang', lang || 'ar');
      localStorage.setItem('qanouni_theme', 'light');
    } catch {}
    window.dispatchEvent(new Event('talib-profile'));
    if (onFinish) return onFinish(profile);
    nav(appHref);
  };
  const next = () => { if (!okStep) return; if (step === 3) finish(); else goStep(step + 1); };

  const chips = [track && (track === 'private' ? 'قانون خاص' : 'قانون عام'), (step >= 3 || track) && sem, group.trim() && `فوج ${group.trim()}`, lang === 'fr' ? 'Français' : 'العربية'].filter(Boolean);

  return (
    <div dir="rtl" lang="ar" className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 font-['IBM_Plex_Sans_Arabic',system-ui,sans-serif] pb-[120px]" style={{ colorScheme: 'light' }}>
      <TalibKeyframes />

      {/* En-tête + progression */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/80">
        <div className="max-w-[1080px] mx-auto px-5 py-3 flex items-center gap-4">
          <a href={landingHref} onClick={(e) => { e.preventDefault(); nav(landingHref); }} className="flex items-center gap-2.5 shrink-0 text-slate-900">
            <TalibLogo size={34} /><span className="hidden sm:inline text-lg font-bold">طالب</span>
          </a>
          <div className="flex-1 grid grid-cols-4 gap-2">
            {STEP_LABELS.map((label, i) => (
              <button key={label} onClick={() => i <= maxStep && goStep(i)} disabled={i > maxStep} className={`flex flex-col gap-1.5 text-start min-w-0 ${i > maxStep ? 'cursor-default' : 'cursor-pointer'}`}>
                <span className="block w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <span className="block h-full rounded-full bg-emerald-600 transition-[width] duration-500 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)]" style={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }} />
                </span>
                <span className={`text-xs whitespace-nowrap overflow-hidden text-ellipsis ${i === step ? 'font-bold text-slate-900' : i < step ? 'font-semibold text-emerald-700' : 'font-medium text-slate-400'}`}>{label}</span>
              </button>
            ))}
          </div>
          <bdi dir="ltr" className="font-mono text-xs font-bold text-slate-500 shrink-0">{step + 1} / 4</bdi>
        </div>
      </header>

      <div className="max-w-[1080px] mx-auto px-5 pt-[clamp(24px,4vw,48px)] flex flex-wrap gap-6 items-start">
        <main key={step} className="flex-[2_1_520px] min-w-0 flex flex-col gap-6 animate-[talib-step_.4s_cubic-bezier(.22,1,.36,1)_both]">
          <div>
            <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">{kicker}</div>
            <h1 className="text-[clamp(26px,3.4vw,36px)] font-extrabold text-slate-900 leading-tight mt-1 [text-wrap:balance]">{title}</h1>
            <p className="text-base leading-relaxed text-slate-600 mt-2 max-w-[620px] [text-wrap:pretty]">{lead}</p>
          </div>

          {/* Étape 1 — les 3 piliers */}
          {step === 0 && (
            <div className="grid gap-3.5 sm:grid-cols-3">
              {PILLARS.map((p) => { const Ic = Icons[p.icon]; return (
                <div key={p.t} className="flex flex-col gap-3 p-[22px] rounded-3xl bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_24px_-8px_rgba(15,23,42,0.08)]">
                  <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.tone}`}><Ic size={24} sw={1.8} /></span>
                  <span className="text-lg font-bold text-slate-900">{p.t}</span>
                  <span className="text-sm leading-relaxed text-slate-600">{p.d}</span>
                </div>
              ); })}
            </div>
          )}

          {/* Étape 2 — personnage */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-2"><span className="text-sm font-bold text-slate-900">اسمك كما سيظهر لزملائك</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: يوسف الإدريسي" autoComplete="name"
                  className="h-[52px] rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 placeholder:text-slate-400" />
              </label>
              {!auth ? (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 rounded-2xl bg-white border border-slate-200/80">
                  <span className="flex-[1_1_220px] text-sm leading-relaxed text-slate-600">اربط حسابك لحفظ تقدمك، واستعمال صورتك من Google إن أردت.</span>
                  <button onClick={() => setAuthOpen(true)} className={`flex items-center gap-2 h-11 px-4 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-800 whitespace-nowrap shadow-[0_3px_0_rgb(226,232,240)] ${press}`}>
                    <span className="w-5 h-5 rounded-full border-[1.5px] border-slate-300 text-blue-600 text-xs font-bold flex items-center justify-center">G</span>ربط حساب Google
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-bold border border-emerald-100">
                  <Icons.check size={18} /><span className="min-w-0 truncate">{auth.provider === 'google' ? 'متصل بـ Google · ' : 'متصل بالبريد · '}{auth.email}</span>
                </div>
              )}
              <div>
                <Label>الشخصية</Label>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5 pb-1">
                  {hasPhoto && (
                    <button onClick={() => setAvKind('google')} aria-pressed={avKind === 'google'} className={`flex flex-col items-center gap-1.5 px-1.5 py-2.5 rounded-[20px] border-2 text-slate-900 ${avKind === 'google' ? on : off} ${press}`}>
                      <span className="w-16 h-16 rounded-full bg-cover bg-center" style={photoStyle} />
                      <span className="text-xs font-bold whitespace-nowrap">صورة Google</span>
                    </button>
                  )}
                  {CHARS.map(([k, label]) => (
                    <button key={k} onClick={() => { setCh(k); setAvKind('char'); }} aria-pressed={avKind === 'char' && ch === k} title={label}
                      className={`flex flex-col items-center gap-1.5 px-1.5 py-2.5 rounded-[20px] border-2 text-slate-900 ${avKind === 'char' && ch === k ? on : off} ${press}`}>
                      <span className="w-16 h-16 block"><Avatar config={avatarConfig(k, outfit)} size={64} /></span>
                      <span className="text-xs font-bold whitespace-nowrap">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {avKind === 'char' && (
                <div>
                  <Label>اللباس</Label>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 pb-1">
                    {OUTFITS.map(([k, label]) => (
                      <button key={k} onClick={() => setOutfit(k)} aria-pressed={outfit === k} className={`flex items-center gap-2.5 py-2 ps-2 pe-3 rounded-[18px] border-2 text-start text-slate-900 ${outfit === k ? on : off} ${press}`}>
                        <span className="w-[46px] h-[46px] shrink-0"><Avatar config={avatarConfig(ch, k)} size={46} /></span>
                        <span className="text-sm font-bold leading-snug">{label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2.5">يمكنك تخصيص التفاصيل (الشعر، الحجاب، النظارات…) لاحقاً من «صمم شخصيتك» في حسابك.</p>
                </div>
              )}
            </div>
          )}

          {/* Étape 3 — faculté */}
          {step === 2 && (
            <div className="flex flex-col gap-3.5">
              <div className="relative">
                <Icons.search size={20} className="absolute top-4 end-4 text-slate-400" />
                <input value={facQ} onChange={(e) => setFacQ(e.target.value)} placeholder="ابحث بالمدينة أو الجامعة، مثلاً: الرباط أو Agdal" autoFocus
                  className="w-full h-[52px] rounded-2xl border-2 border-slate-200 bg-white pe-4 ps-12 text-base text-slate-900 placeholder:text-slate-400 outline-none shadow-sm focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
              </div>
              <div className="text-xs font-bold text-slate-500">{facs.length} كلية</div>
              <div className="grid gap-2.5 sm:grid-cols-2 pb-1">
                {facs.map((f) => { const a = fac === f.id; return (
                  <button key={f.id} onClick={() => { setFac(f.id); setFacOther(''); }} aria-pressed={a} className={`flex items-center gap-3 min-h-16 px-3.5 py-3 rounded-2xl border-2 text-start text-slate-900 ${a ? on : off} ${press}`}>
                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 text-white ${a ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>{a && <Icons.check size={13} sw={3} />}</span>
                    <span className="flex-1 min-w-0 leading-snug"><span className="block text-base font-bold text-slate-900">كلية الحقوق {f.area}</span><span className="block text-xs text-slate-500">{f.uni} · {f.city}</span></span>
                  </button>
                ); })}
              </div>
              {!facs.length && <div className="p-4 rounded-2xl bg-slate-100 text-sm text-slate-600 text-center">لا توجد كلية بهذا الاسم. اكتب اسمها أسفله.</div>}
              <input value={facOther} onChange={(e) => { setFacOther(e.target.value); if (e.target.value.trim()) setFac(null); }} placeholder="كليتي غير موجودة؟ اكتب اسمها هنا"
                className="h-12 rounded-xl border-2 border-dashed border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-solid focus:border-emerald-600" />
            </div>
          )}

          {/* Étape 4 — parcours */}
          {step === 3 && (
            <div className="flex flex-col gap-6">
              <div>
                <Label>الشعبة</Label>
                <div className="grid gap-2.5 sm:grid-cols-2 pb-1">
                  {[['private', 'القانون الخاص', 'المدني، التجاري، الأسرة، الجنائي، الشغل'], ['public', 'القانون العام', 'الدستوري، الإداري، المالية العامة، العلاقات الدولية']].map(([k, label, desc]) => (
                    <button key={k} onClick={() => setTrack(k)} aria-pressed={track === k} className={`flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-start text-slate-900 ${track === k ? on : off} ${press}`}>
                      <span className="text-base font-bold text-slate-900">{label}</span><span className="text-xs text-slate-500">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <div className="flex-[1_1_200px]"><Label>لغة الدراسة</Label><Seg items={[['ar', 'العربية'], ['fr', 'Français']]} value={lang} onChange={setLang} /></div>
                <div className="flex-[2_1_300px]"><Label>الفصل الدراسي</Label><Seg mono items={['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((s) => [s, s])} value={sem} onChange={setSem} /></div>
              </div>
              <label className="flex flex-col gap-2 max-w-[260px]"><span className="text-sm font-bold text-slate-900">الفوج</span>
                <input dir="ltr" value={group} onChange={(e) => setGroup(e.target.value.toUpperCase().slice(0, 6))} placeholder="G01"
                  className="h-12 rounded-xl border-2 border-slate-200 bg-white px-4 font-mono text-base font-semibold uppercase text-start text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
              </label>
              <div>
                <Label>هدف مهني <span className="font-normal text-slate-500">(اختياري)</span></Label>
                <div className="flex flex-wrap gap-2 pb-[3px]">
                  {GOALS.map(([k, label]) => (
                    <button key={k} onClick={() => setGoal(goal === k ? null : k)} aria-pressed={goal === k} className={`h-11 px-4 rounded-xl border-2 text-sm font-bold whitespace-nowrap text-slate-800 ${goal === k ? on : off} ${press}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Carte profil live */}
        <aside className="flex-[1_1_280px] min-w-0 lg:sticky lg:top-24 p-6 rounded-[28px] bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_16px_32px_-12px_rgba(15,23,42,0.12)] flex flex-col items-center gap-3 text-center">
          <div className="w-[132px] h-[132px] rounded-full shadow-[0_0_0_4px_white,0_0_0_6px_rgb(5,122,68),0_18px_34px_-16px_rgba(5,122,68,0.35)] overflow-hidden">
            {avKind === 'google' && hasPhoto ? <div className="w-full h-full bg-cover bg-center" style={photoStyle} /> : <Avatar config={cfg} size={132} interactive />}
          </div>
          <div className="leading-snug min-w-0">
            <div className="text-xl font-bold text-slate-900">{name.trim() || 'اسمك'}</div>
            <div className="text-xs text-slate-500 mt-0.5">{facLabel || 'كليتك'}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">{chips.map((c) => <span key={c} className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">{c}</span>)}</div>
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-100"><Icons.shield size={15} />بياناتك تُحفظ محلياً على جهازك</div>
        </aside>
      </div>

      {/* Barre de navigation du wizard */}
      <footer className="fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-xl border-t border-slate-200/80">
        <div className="max-w-[1080px] mx-auto px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] flex items-center gap-3">
          {step > 0 && (
            <button onClick={() => goStep(step - 1)} className="h-[52px] px-6 mb-1 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 text-base font-bold shadow-[0_3px_0_rgb(226,232,240)] transition-[transform,box-shadow] duration-100 active:translate-y-1 active:shadow-none">السابق</button>
          )}
          {!okStep && <span className="hidden sm:inline text-xs font-semibold text-slate-500">{hint}</span>}
          <button onClick={next} disabled={!okStep}
            className="ms-auto h-[52px] px-8 mb-1 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-bold whitespace-nowrap shadow-[0_4px_0_rgb(3,90,50)] transition-[transform,box-shadow] duration-100 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:pointer-events-none">
            {step === 3 ? 'ابدأ الدراسة ✨' : 'متابعة'}
          </button>
        </div>
      </footer>

      {authOpen && <AuthSheet authApi={authApi} onClose={() => setAuthOpen(false)} onDone={() => setAuthOpen(false)} />}
    </div>
  );
}
