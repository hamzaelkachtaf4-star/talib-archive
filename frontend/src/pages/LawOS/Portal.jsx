// frontend/src/pages/LawOS/Portal.jsx
// Landing « طالب · Talib » — thème clair Apple, RTL, boutons tactiles 3D.
// Session : localStorage 'talib.auth.v1' = { provider, email, name, avatar } + événement window 'talib-auth'.
//
// Props (toutes optionnelles) :
//   startHref        lien du bouton principal          (défaut '/welcome')
//   appHref          destination si profil déjà rempli    (défaut '/app')
//   apkUrl           APK Android                           (défaut '/downloads/talib.apk')
//   onNavigate(href) navigation SPA (ex. react-router navigate). Sinon window.location.assign.
//   authApi          { googleSignIn(): Promise<auth>, requestCode(email): Promise<void>, verifyCode(email, code): Promise<auth> }
//                    Branche ici ton système Google / OTP existant. Sans authApi : mode démo (code 482913).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TalibLogo } from '@/components/LawOS/avatar/TalibAvatar';

export const AUTH_KEY = 'talib.auth.v1';
export const PROFILE_KEY = 'talib.profile.v1';

export function readAuth() {
  try { const a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); return a && a.email ? a : null; } catch { return null; }
}
export function writeAuth(auth) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch {}
  window.dispatchEvent(new Event('talib-auth'));
}
export function readProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; }
}

const go = (href, onNavigate) => (onNavigate ? onNavigate(href) : window.location.assign(href));

/* ---------- Animations (non couvertes par Tailwind par défaut) ---------- */
export const TalibKeyframes = () => (
  <style>{`
    @keyframes talib-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-12px) rotate(2deg)}}
    @keyframes talib-chip{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    @keyframes talib-flame{0%,100%{transform:scale(1) rotate(-4deg)}50%{transform:scale(1.14) rotate(4deg)}}
    @keyframes talib-spring{0%{opacity:0;transform:translateY(-8px) scale(.94)}60%{opacity:1;transform:translateY(0) scale(1.015)}100%{opacity:1;transform:none}}
    @keyframes talib-sheet{0%{opacity:0;transform:translateY(28px) scale(.95)}60%{opacity:1;transform:translateY(-4px) scale(1.01)}100%{opacity:1;transform:none}}
    @keyframes talib-fade{from{opacity:0}to{opacity:1}}
    @keyframes talib-step{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
  `}</style>
);

/* ---------- Icônes SVG (stroke 1.9) ---------- */
const I = ({ d, size = 18, sw = 1.9, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
    {[].concat(d).map((p, i) => <path key={i} d={p} />)}
  </svg>
);
export const Icons = {
  scale: (p) => <I {...p} d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" />,
  check: (p) => <I sw={2.4} {...p} d="M20 6 9 17l-5-5" />,
  download: (p) => <I sw={2} {...p} d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  share: (p) => <I {...p} d={['M12 3v12M8 7l4-4 4 4', 'M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1']} />,
  plusSquare: (p) => <I {...p} d={['M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z', 'M12 8.5v7M8.5 12h7']} />,
  phone: (p) => <I {...p} d={['M9 2.5h6a2.6 2.6 0 0 1 2.5 2.6v13.8a2.6 2.6 0 0 1-2.5 2.6H9a2.6 2.6 0 0 1-2.5-2.6V5.1A2.6 2.6 0 0 1 9 2.5z', 'M10.5 18.5h3']} />,
  book: (p) => <I {...p} d={['M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z', 'M12 6.5v13']} />,
  tree: (p) => <I {...p} d={['M10.5 3h3A1.5 1.5 0 0 1 15 4.5v2A1.5 1.5 0 0 1 13.5 8h-3A1.5 1.5 0 0 1 9 6.5v-2A1.5 1.5 0 0 1 10.5 3z', 'M4.5 16h3A1.5 1.5 0 0 1 9 17.5v2A1.5 1.5 0 0 1 7.5 21h-3A1.5 1.5 0 0 1 3 19.5v-2A1.5 1.5 0 0 1 4.5 16z', 'M16.5 16h3a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-2a1.5 1.5 0 0 1 1.5-1.5z', 'M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2']} />,
  cards: (p) => <I {...p} d={['M9.5 7h8A2.5 2.5 0 0 1 20 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 7 17.5v-8A2.5 2.5 0 0 1 9.5 7z', 'M16 4H6.5A2.5 2.5 0 0 0 4 6.5V16']} />,
  users: (p) => <I {...p} d={['M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1', 'M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M21 19v-1a4 4 0 0 0-3-3.9', 'M16 3.1a3.5 3.5 0 0 1 0 6.8']} />,
  shield: (p) => <I sw={2} {...p} d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />,
  search: (p) => <I sw={2} {...p} d={['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-3.5-3.5']} />,
  chevron: (p) => <I sw={2} {...p} d="m6 9 6 6 6-6" />,
  close: (p) => <I sw={2} {...p} d="M6 6l12 12M18 6 6 18" />,
};
export const Flame = ({ size = 22, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 fill-[var(--law-gold,rgb(217,119,6))] ${className}`} aria-hidden="true">
    <path d="M12 2c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6 1 2.6 2 3 0-3.2.3-5.8.8-8.7z" />
  </svg>
);


/* ---------- Boutons 3D ---------- */
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold whitespace-nowrap shadow-[0_5px_0_rgb(3,90,50)] transition-[transform,box-shadow] duration-100 active:translate-y-[5px] active:shadow-none disabled:opacity-50 disabled:pointer-events-none';
export const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white text-slate-800 font-bold whitespace-nowrap shadow-[0_5px_0_rgb(226,232,240)] transition-[transform,box-shadow] duration-100 active:translate-y-[5px] active:shadow-none';

/* ---------- Connexion Google / Email OTP ---------- */
const DEMO_CODE = '482913';
export function AuthSheet({ onClose, onDone, authApi }) {
  const [step, setStep] = useState('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const demo = !authApi;

  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finish = (auth) => { writeAuth(auth); onDone?.(auth); };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const google = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const auth = authApi?.googleSignIn ? await authApi.googleSignIn() : await new Promise((r) => setTimeout(() => r({ provider: 'google', email: 'y.idrissi@gmail.com', name: 'يوسف الإدريسي', avatar: '' }), 900));
      finish(auth);
    } catch { setErr('تعذر الاتصال بـ Google، حاول مرة أخرى'); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!valid) return setErr('أدخل بريداً إلكترونياً صحيحاً');
    setBusy(true); setErr('');
    try { if (authApi?.requestCode) await authApi.requestCode(email.trim()); setStep('code'); setCode(''); setWait(30); }
    catch { setErr('تعذر إرسال الرمز، حاول مرة أخرى'); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (code.length < 6) return setErr('الرمز يتكون من 6 أرقام');
    setBusy(true); setErr('');
    try {
      let auth;
      if (authApi?.verifyCode) auth = await authApi.verifyCode(email.trim(), code);
      else if (code === DEMO_CODE) auth = { provider: 'email', email: email.trim().toLowerCase(), name: '', avatar: '' };
      else throw new Error('bad');
      finish(auth);
    } catch { setErr('الرمز غير صحيح، تحقق منه وأعد المحاولة'); } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" onClick={onClose} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-[talib-fade_.25s_ease-out_both]">
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-[28px] bg-white border border-slate-200 shadow-2xl p-6 flex flex-col gap-4 text-slate-900 animate-[talib-sheet_.55s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 leading-snug">{step === 'code' ? 'أدخل رمز التحقق' : 'مرحباً بك في طالب'}</h2>
            <p className="text-sm leading-relaxed text-slate-600 mt-0.5">
              {step === 'code' ? `أرسلنا رمزاً من 6 أرقام إلى ${email.trim()}. صالح لمدة 10 دقائق.` : 'ادخل بحساب Google أو برمز يصلك على بريدك. بلا كلمة سر.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="w-[34px] h-[34px] rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center shrink-0"><Icons.close size={16} /></button>
        </div>

        {step === 'choose' && (
          <>
            <button onClick={google} disabled={busy} className="h-[52px] mb-1 rounded-2xl border-2 border-slate-200 bg-white font-bold text-slate-800 text-[15px] flex items-center justify-center gap-2.5 shadow-[0_4px_0_rgb(226,232,240)] transition-[transform,box-shadow] duration-100 active:translate-y-1 active:shadow-none disabled:opacity-60">
              <span className="w-[22px] h-[22px] rounded-full border border-slate-300 text-blue-600 text-xs font-bold flex items-center justify-center">G</span>
              {busy ? 'جارٍ الاتصال بـ Google…' : 'المتابعة بحساب Google'}
            </button>
            <div className="flex items-center gap-2.5 text-xs text-slate-400"><span className="flex-1 h-px bg-slate-200" />أو بالبريد الإلكتروني<span className="flex-1 h-px bg-slate-200" /></div>
            <input type="email" dir="ltr" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="name@etu.ma"
              className="h-[50px] rounded-2xl border-2 border-slate-200 bg-white px-4 text-[15px] text-start text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
            {err && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl text-center font-medium">{err}</div>}
            <button onClick={send} disabled={busy} className={`${btnPrimary} h-[52px] mb-1 text-base !rounded-2xl !shadow-[0_4px_0_rgb(3,90,50)] active:!translate-y-1`}>أرسل رمز التحقق</button>
          </>
        )}

        {step === 'code' && (
          <>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} autoFocus
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && verify()} placeholder="••••••"
              className="h-16 rounded-2xl border-2 border-slate-200 bg-white px-4 font-mono text-[28px] font-semibold tracking-[12px] text-center text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
            <div className="flex items-center justify-between gap-2 text-xs">
              {demo ? <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold whitespace-nowrap">رمز تجريبي: <bdi dir="ltr" className="font-mono">{DEMO_CODE}</bdi></span> : <span />}
              <button onClick={() => { if (!wait) { authApi?.requestCode?.(email.trim()); setWait(30); } }} disabled={wait > 0} className={`font-bold whitespace-nowrap ${wait ? 'text-slate-400' : 'text-emerald-700'}`}>
                {wait ? `إعادة الإرسال بعد ${wait} ث` : 'إعادة إرسال الرمز'}
              </button>
            </div>
            {err && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl text-center font-medium">{err}</div>}
            <button onClick={verify} disabled={busy} className={`${btnPrimary} h-[52px] mb-1 text-base !rounded-2xl !shadow-[0_4px_0_rgb(3,90,50)] active:!translate-y-1 ${code.length === 6 ? '' : 'opacity-60'}`}>تأكيد الدخول</button>
            <button onClick={() => { setStep('choose'); setCode(''); setErr(''); setWait(0); }} className="self-center text-xs font-bold text-slate-500 hover:text-slate-900">تغيير البريد الإلكتروني</button>
          </>
        )}

        <p className="text-xs leading-relaxed text-slate-500 text-center">
          بالمتابعة، أنت توافق على <a href="/terms" className="font-bold text-emerald-700">شروط الاستخدام</a> و<a href="/privacy" className="font-bold text-emerald-700">سياسة الخصوصية</a>. بياناتك تُحفظ محلياً على جهازك.
        </p>
      </div>
    </div>
  );
}

/* ---------- Données ---------- */
const NAV = [['المسارات', '#paths'], ['منهجية النوازل', '#nawazil'], ['التثبيت', '#install'], ['الأسئلة الشائعة', '#faq']];
const PILLARS = [
  { icon: 'book', title: 'النصوص والقوانين المحينة', desc: 'الدستور والقوانين التنظيمية والمدونات في خزانة واحدة مرتبة حسب الهرم، مع رابط النص الرسمي لكل قانون.', chips: ['ق.ل.ع', 'المسطرة المدنية 58.25', 'الجنائي'], tone: 'bg-emerald-700 text-white shadow-[0_4px_0_rgb(3,90,50)]' },
  { icon: 'tree', title: 'منهجية النوازل خطوة بخطوة', desc: 'من الوقائع والتكييف إلى الحل، مع تقييم كل خطوة ونماذج محلولة من بنك نوازل الفوج.', chips: ['التكييف', 'الإشكال', 'التعليل'], tone: 'bg-amber-600 text-white shadow-[0_4px_0_rgb(146,64,14)]' },
  { icon: 'cards', title: 'المراجعة الذكية بنظام FSRS وحفظ الفصول', desc: 'تعود إليك الفصول والمفاهيم في الوقت المناسب قبل أن تنساها، فتراجع أقل وتتذكر أكثر. وكل ذلك يعمل بدون إنترنت.', chips: ['مراجعة اليوم', 'بطاقات', 'إتقان'], tone: 'bg-slate-100 text-emerald-800 shadow-[0_4px_0_rgb(203,213,225)]' },
];
const STEPS = [['الوقائع والتكييف', 'استخراج الوقائع ذات الأثر القانوني وتحديد طبيعتها'], ['الإشكال', 'صياغة المشكل القانوني في سؤال واضح'], ['القواعد', 'النصوص الواجبة التطبيق بأرقام الفصول'], ['التطبيق', 'إسقاط القاعدة على الوقائع ومناقشة الدفوع'], ['الحل', 'جواب مباشر عن الإشكال']];
const FAQ = [
  ['لماذا لا يوجد طالب في Play Store و App Store؟', 'نوزع التطبيق مباشرة عبر الويب: ملف APK لأندرويد، وتثبيت من Safari لآيفون. تحصل على نفس التطبيق والتحديثات، بدون المرور بالمتاجر.'],
  ['هل يعمل التطبيق بدون إنترنت؟', 'نعم. الدروس والقوانين المحفوظة ومراجعاتك تعمل بدون اتصال، وتُحفظ بياناتك محلياً على جهازك.'],
  ['هل المحتوى القانوني موثوق؟', 'كل نص في خزانة القوانين مربوط بمصدره الرسمي، ويحمل علامة «متحقق منه» أو «للمراجعة». وما يصوغه المساعد يظهر بلون مختلف عن مصادرك.'],
  ['كيف أدخل إلى حسابي؟', 'بحساب Google أو برمز من 6 أرقام يصلك على بريدك الإلكتروني. لا حاجة لكلمة سر.'],
];

/* ---------- Page ---------- */
export default function Portal({ startHref = '/law/welcome', appHref = '/law/today', apkUrl = '/downloads/talib.apk', onNavigate, authApi }) {
  const navigate = useNavigate();
  const nav = onNavigate || navigate;
  const [authOpen, setAuthOpen] = useState(false);
  const [platform, setPlatform] = useState('other');
  const [iosOpen, setIosOpen] = useState(false);
  const [faq, setFaq] = useState(0);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const p = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other';
    setPlatform(p);
    setIosOpen(p === 'ios');
  }, []);

  const onAuthDone = () => { setAuthOpen(false); nav(readProfile() ? appHref : startHref); };
  const start = (e) => { e?.preventDefault(); nav(startHref); };
  const ring = (k) => (platform === k ? 'border-emerald-600' : 'border-slate-200');

  return (
    <div dir="rtl" lang="ar" className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 font-['IBM_Plex_Sans_Arabic',system-ui,sans-serif] scroll-smooth" style={{ colorScheme: 'light' }}>
      <TalibKeyframes />

      {/* Barre de navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/80">
        <div className="max-w-[1180px] mx-auto px-5 py-3 flex items-center gap-4">
          <a href="#top" className="flex items-center gap-2.5 shrink-0 text-slate-900">
            <TalibLogo size={40} className="drop-shadow-[0_6px_8px_rgba(5,122,68,0.35)]" />
            <span className="text-[19px] font-bold whitespace-nowrap">طالب · <span className="font-mono font-semibold">Talib</span></span>
            <span className="hidden sm:inline text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">قانون مغربي</span>
          </a>
          <nav className="hidden lg:flex flex-1 justify-center items-center gap-1">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="px-3.5 py-2 rounded-xl text-sm font-semibold text-slate-600 whitespace-nowrap transition-colors hover:bg-slate-100 hover:text-slate-900">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2 ms-auto pb-[3px]">
            <button onClick={() => setAuthOpen(true)} className="h-10 px-4 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-800 shadow-[0_3px_0_rgb(226,232,240)] whitespace-nowrap transition-[transform,box-shadow] duration-100 active:translate-y-[3px] active:shadow-none">تسجيل الدخول</button>
            <a href={startHref} onClick={start} className="hidden lg:inline-flex items-center h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold shadow-[0_3px_0_rgb(3,90,50)] whitespace-nowrap transition-[transform,box-shadow] duration-100 active:translate-y-[3px] active:shadow-none">ابدأ الآن</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="max-w-[1180px] mx-auto px-5 pt-[clamp(36px,7vw,88px)] pb-[clamp(40px,6vw,72px)] grid gap-[clamp(28px,5vw,64px)] items-center lg:grid-cols-2">
        <div className="flex flex-col gap-5 min-w-0">
          <span className="self-start inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-100 whitespace-nowrap"><Icons.scale size={16} />لطلبة كليات الحقوق بالمغرب</span>
          <h1 className="text-[clamp(32px,5.2vw,58px)] font-extrabold text-slate-900 leading-[1.25] [text-wrap:balance]">الطريقة الأمتع والأذكى للتفوق في دراسة القانون بالمغرب</h1>
          <p className="text-[clamp(15.5px,1.6vw,18px)] leading-[1.9] text-slate-600 max-w-[560px] [text-wrap:pretty]">دروس ملخصة بطريقتك، منهجية النوازل خطوة بخطوة، ومراجعة ذكية بخوارزمية FSRS تذكّرك بالفصول قبل أن تنساها. وكل شيء يعمل 100% بدون إنترنت.</p>
          <div className="flex flex-wrap gap-3 pb-1.5">
            <a href={startHref} onClick={start} className={`${btnPrimary} flex-[1_1_220px] h-[58px] px-7 text-[16.5px] !shadow-[0_6px_0_rgb(3,90,50),0_18px_30px_-14px_rgba(5,122,68,0.35)] active:!translate-y-1.5 active:!shadow-none`}>ابدأ الآن</a>
            <button onClick={() => setAuthOpen(true)} className={`${btnSecondary} flex-[1_1_200px] h-[58px] px-6 text-base text-emerald-800 !shadow-[0_6px_0_rgb(226,232,240)] active:!translate-y-1.5`}>لدي حساب بالفعل</button>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {['بدون متجر تطبيقات', 'يعمل بدون إنترنت', 'بياناتك على جهازك'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 whitespace-nowrap"><Icons.check size={15} className="text-emerald-700" />{t}</span>
            ))}
          </div>
        </div>

        <div className="relative w-full max-w-[440px] aspect-square mx-auto">
          <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(5,122,68,0.12),transparent_70%)]" />
          <div className="absolute inset-[14%] rounded-full border-2 border-dashed border-slate-200" />
          <div className="absolute inset-[24%] flex items-center justify-center animate-[talib-bob_6s_ease-in-out_infinite]">
            <TalibLogo size="100%" className="drop-shadow-[0_22px_26px_rgba(5,122,68,0.4)]" />
          </div>
          <div className="absolute top-[10%] end-0 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-md whitespace-nowrap animate-[talib-chip_5s_ease-in-out_infinite]">
            <Flame className="animate-[talib-flame_1.4s_ease-in-out_infinite]" />
            <span className="leading-tight"><span className="block text-sm font-bold text-slate-900"><bdi dir="ltr" className="font-mono">12</bdi> يوماً</span><span className="block text-[11px] text-slate-500">شعلة المواظبة</span></span>
          </div>
          <div className="absolute top-[44%] -start-[2%] flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-md whitespace-nowrap animate-[talib-chip_6s_ease-in-out_.8s_infinite]">
            <span className="w-[30px] h-[30px] rounded-[10px] bg-amber-50 text-amber-700 flex items-center justify-center"><Icons.scale size={17} /></span>
            <span className="leading-tight"><span className="block text-sm font-bold text-slate-900">الفصل 77 ق.ل.ع</span><span className="block text-[11px] text-slate-500">مراجعة اليوم · FSRS</span></span>
          </div>
          <div className="absolute bottom-[8%] end-[6%] flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-700 text-white shadow-[0_5px_0_rgb(3,90,50)] whitespace-nowrap animate-[talib-chip_5.5s_ease-in-out_1.6s_infinite]">
            <Icons.check size={17} /><span className="text-sm font-bold">نازلة محلولة بالمنهجية</span>
          </div>
        </div>
      </section>

      {/* Téléchargement direct */}
      <section id="install" className="max-w-[1180px] mx-auto px-5 pb-[clamp(48px,7vw,88px)] scroll-mt-24">
        <div className="p-[clamp(22px,3vw,34px)] rounded-[30px] bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_16px_32px_-12px_rgba(15,23,42,0.12)] flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[clamp(22px,2.6vw,30px)] font-bold text-slate-900 leading-snug">ثبّت طالب مباشرة من المتصفح</h2>
              <p className="text-sm leading-relaxed text-slate-600 mt-1">بدون Play Store ولا App Store. تحميل مباشر على أندرويد، وإضافة إلى الشاشة الرئيسية على آيفون.</p>
            </div>
            {platform !== 'other' && <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold whitespace-nowrap">{platform === 'ios' ? 'جهازك: آيفون' : 'جهازك: أندرويد'}</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`flex flex-col gap-3.5 p-5 rounded-2xl border-2 bg-slate-50 ${ring('android')}`}>
              <div className="flex items-center gap-3.5">
                <span className="w-[52px] h-[52px] rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0"><Icons.download size={26} /></span>
                <div className="min-w-0 leading-snug"><div className="text-base font-bold text-slate-900">تحميل فوري لأندرويد - APK مباشر</div><div className="text-xs text-slate-500">ملف واحد، بدون حساب متجر</div></div>
              </div>
              <a href={apkUrl} download className={`${btnPrimary} h-[52px] mb-[5px] text-[15px] !rounded-[15px]`}><Icons.download size={19} />تحميل APK</a>
              <p className="text-xs leading-relaxed text-slate-500">عند أول تثبيت، سيطلب منك أندرويد السماح بالتثبيت من هذا المصدر. يمكنك أيضاً تثبيته من Chrome عبر «إضافة إلى الشاشة الرئيسية».</p>
            </div>
            <div className={`flex flex-col gap-3.5 p-5 rounded-2xl border-2 bg-slate-50 ${ring('ios')}`}>
              <div className="flex items-center gap-3.5">
                <span className="w-[52px] h-[52px] rounded-2xl bg-white text-slate-900 flex items-center justify-center shrink-0 border border-slate-200 shadow-sm"><Icons.phone size={26} /></span>
                <div className="min-w-0 leading-snug"><div className="text-base font-bold text-slate-900">تثبيت على آيفون (Safari PWA)</div><div className="text-xs text-slate-500">خطوتان فقط، من Safari</div></div>
              </div>
              <button onClick={() => setIosOpen((v) => !v)} aria-expanded={iosOpen} className={`${btnSecondary} h-[52px] mb-[5px] text-[15px] !rounded-[15px]`}>{iosOpen ? 'إخفاء الطريقة' : 'طريقة التثبيت'}</button>
              {iosOpen && (
                <div className="flex flex-col gap-2.5 animate-[talib-spring_.4s_ease-out_both]">
                  {[['1', 'اضغط على زر المشاركة', <Icons.share key="s" size={20} className="text-blue-500" />], ['2', 'إضافة إلى الشاشة الرئيسية', <Icons.plusSquare key="p" size={20} />]].map(([n, t, ic]) => (
                    <div key={n} className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white border border-slate-200">
                      <span className="w-7 h-7 rounded-[9px] bg-emerald-700 text-white font-mono text-xs font-semibold flex items-center justify-center shrink-0">{n}</span>
                      <span className="flex-1 text-sm font-semibold text-slate-900 leading-relaxed">{t}</span>
                      <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">{ic}</span>
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">يظهر طالب على شاشتك كتطبيق عادي، ويفتح بملء الشاشة.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3 piliers */}
      <section id="paths" className="max-w-[1180px] mx-auto px-5 pb-[clamp(48px,7vw,88px)] flex flex-col gap-5 scroll-mt-24">
        <h2 className="text-[clamp(24px,3vw,34px)] font-extrabold text-slate-900 leading-snug text-center [text-wrap:balance]">ثلاث ركائز لتكوين قانوني متين</h2>
        <div className="grid gap-[18px] md:grid-cols-3 pb-2">
          {PILLARS.map((p) => {
            const Ic = Icons[p.icon];
            return (
              <article key={p.title} className="flex flex-col gap-3.5 p-6 rounded-[26px] bg-white border-2 border-slate-200 shadow-[0_7px_0_rgb(226,232,240)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-[0_13px_0_rgb(203,213,225)]">
                <span className={`w-[58px] h-[58px] rounded-2xl flex items-center justify-center ${p.tone}`}><Ic size={28} /></span>
                <h3 className="text-lg font-bold text-slate-900 leading-normal">{p.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600 [text-wrap:pretty]">{p.desc}</p>
                <div className="flex flex-wrap gap-1.5 mt-auto">{p.chips.map((c) => <span key={c} className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">{c}</span>)}</div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Méthodologie des نوازل */}
      <section id="nawazil" className="max-w-[1180px] mx-auto px-5 pb-[clamp(48px,7vw,88px)] scroll-mt-24">
        <div className="p-[clamp(22px,3vw,34px)] rounded-[30px] bg-emerald-800 text-white shadow-[0_8px_0_rgb(3,90,50)] flex flex-col gap-5">
          <div>
            <h2 className="text-[clamp(22px,2.6vw,30px)] font-bold leading-snug">منهجية النوازل، خطوة بخطوة</h2>
            <p className="text-sm leading-relaxed opacity-90 mt-1">كل نازلة تُحل بالترتيب المعتمد في امتحانات كليات الحقوق، ويقيّم المساعد كل خطوة على حدة.</p>
          </div>
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-white/10 border border-white/15">
                <span className="w-[30px] h-[30px] rounded-[10px] bg-white text-emerald-800 font-mono text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                <span className="text-sm font-bold">{t}</span>
                <span className="text-xs leading-relaxed opacity-90">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-[820px] mx-auto px-5 pb-[clamp(48px,7vw,88px)] flex flex-col gap-3.5 scroll-mt-24">
        <h2 className="text-[clamp(22px,2.6vw,30px)] font-extrabold text-slate-900 text-center mb-1.5">الأسئلة الشائعة</h2>
        {FAQ.map(([q, a], i) => (
          <div key={q} className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
            <button onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i} className="flex items-center gap-3 w-full min-h-[60px] px-5 py-3.5 text-start text-slate-900">
              <span className="flex-1 text-base font-bold leading-relaxed">{q}</span>
              <Icons.chevron size={18} className={`text-slate-400 transition-transform duration-300 ${faq === i ? 'rotate-180' : ''}`} />
            </button>
            {faq === i && <p className="px-5 pb-[18px] text-sm leading-relaxed text-slate-600 animate-[talib-fade_.25s_ease-out_both]">{a}</p>}
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-200">
        <div className="max-w-[1180px] mx-auto px-5 pt-6 pb-8 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>© 2026 طالب · Talib — صُنع لطلبة الحقوق بالمغرب</span>
          <div className="flex gap-4"><a href="/privacy" className="hover:text-slate-900">سياسة الخصوصية</a><a href="/terms" className="hover:text-slate-900">شروط الاستخدام</a></div>
        </div>
      </footer>

      {authOpen && <AuthSheet authApi={authApi} onClose={() => setAuthOpen(false)} onDone={onAuthDone} />}
    </div>
  );
}
