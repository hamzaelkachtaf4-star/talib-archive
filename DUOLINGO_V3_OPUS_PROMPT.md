# MISSION: Transform Qanouni ("قانوني") into an Ultra-Creative, Mobile-First Duolingo Experience (Mascot Branding, Squad Collaboration, and All-in-One Law Hub)

## 🎯 Executive Context & User Directives
We reviewed the live deployment on mobile and desktop alongside actual reference screenshots from Duolingo's mobile app.
The user gave direct, unambiguous creative and technical directives:

1. **Brand Identity & Mascot Overhaul ("Duo-Grade Mascot")**:
   - The current scales logo is stiff, generic, and uninspiring ("7amed").
   - The current mascot in the hero is awkward and disjointed ("mamatnas9ch").
   - **THE FIX**: Turn the Moroccan Law Book character into **the official living mascot and brand logo of Qanouni** (exactly like Duo the Owl is for Duolingo)!
     - Name: **"قانوني" (Qanouni)** — an expressive, adorable, living leather-bound law book with playful animated eyes, a warm smile, and a stylish graduate tassel (Tarboosh / graduation cap).
     - **Header Logo**: Use the cute mascot face icon alongside the bold modern typography "قانوني".
     - **Hero Visual**: An expressive, high-polish SVG illustration of Qanouni in an energetic, welcoming pose with floating legal articles and golden sparkles.
2. **Mobile-First Experience (Pixel-Perfect on Android & iOS)**:
   - As shown in the user's mobile screenshots, on mobile screens (< 768px):
     - The layout must be **centered, thumb-friendly, and punchy**.
     - Header: Mascot face icon + compact "ابدأ الآن" tactile button.
     - Hero: Large energetic mascot visual centered on top, followed by the big bold headline, followed by **two massive stacked full-width 3D tactile buttons** (Green "ابدأ الآن مجاناً" over White "لدي حساب بالفعل").
     - Zero clutter, generous whitespace, smooth touch scrolling.
3. **Showcase the Full "All-in-One Law Student Hub"**:
   Highlight the core platform superpowers that prove Qanouni has everything a Moroccan law student needs:
   - 👥 **العمل والمراجعة الجماعية (Squads & Collaborative Study)**: Students study together, form revision circles, share summaries, and debate cases.
   - 🤖 **المساعد القانوني الذكي (AI Mentor & Guide)**: The AI does NOT replace thinking; it guides the student step-by-step through Moroccan legal methodology (استشارات، منهجية النوازل، وتفكيك فصول ق.ل.ع).
   - 📚 **المكتبة والمدونة الشاملة (All-in-One Hub)**: Full Moroccan corpus (ق.ل.ع، المسطرة المدنية، الجنائي، مدونة الأسرة), exam archive, and flashcards.
4. **Google Auth & Resilient Sign-In**:
   - Provide a clean fallback in `AuthModal.jsx` so if Google OAuth returns an error or is blocked, it shows a friendly inline notification and lets the student instantly sign in with Email or 1-Click QR Handshake with their phone, without blocking them.

---

## 🎨 1. The Mascot & Brand Identity System (`MascotQanouni.jsx`)

Create a unified SVG Mascot component `frontend/src/components/LawOS/Portal/MascotQanouni.jsx` with multiple expressive poses:
- `pose="happy"`: Welcoming, arms open / floating pages, smiling with graduate cap and golden badge.
- `pose="reading"`: Holding a quill or studying a law parchment with curious glowing eyes.
- `pose="celebrating"`: Throwing confetti in the air (used in the quiz victory!).
- `pose="logo"`: Compact, iconized vector face optimized for the 32x32 / 40x40 navbar brand.

Replace the old scale icon in `.portal-brand` with `<MascotQanouni pose="logo" />`!

---

## 📱 2. Mobile-First Layout & Duolingo Stacking

In `frontend/src/pages/LawOS/portal.css`:
- **Desktop (>= 768px)**: Balanced two-column grid (Mascot visual on one side, value proposition + buttons on the other).
- **Mobile (< 768px)**:
  - Stack vertically: Centered Mascot Visual ➔ Bold Headline ➔ Subtitle ➔ Massive Stacked 3D Tactile Buttons (`width: 100%`).
  - Tactile buttons must have generous padding (`padding: 1rem 1.5rem`), bold 18px typography, and distinct 4px 3D depth that depresses smoothly on tap (`active:translate-y-1 active:border-b-0`).
  - Touch targets >= 48px, `-webkit-tap-highlight-color: transparent`.

---

## 🚀 3. The 3 New "All-in-One Law Hub" Feature Sections

Add these creative sections to `frontend/src/components/LawOS/Portal/InfoSections.jsx`:

### Section 1: "المراجعة الجماعية وروح الفريق" (Squads & Community)
- Title: *"لا تراجع لوحدك بعد اليوم — راجع مع زملائك"*
- Visual card showing active student study squads with avatar bubbles, shared case notes, and collaborative mock exams.
- Badge: *"👥 مجموعات دراسية تفاعلية وتبادل المذكرات"*.

### Section 2: "الذكاء الاصطناعي في خدمة منهجية الطالب" (AI Legal Mentor)
- Title: *"مساعد ذكي يوجهك خطوة بخطوة في المنهجية القانونية"*
- Interactive snippet showing:
  - 1. الوقائع (Facts analysis)
  - 2. الإشكال القانوني (Legal Issue)
  - 3. القاعدة القانونية المناسبة (Applicable Civil/Penal rule)
  - 4. الحل المقترح (Conclusion)
- Clear message: *"الذكاء الاصطناعي لا يعطيك أجوبة جاهزة، بل يدرّبك على التفكير والتحليل القانوني الرصين."*

### Section 3: "كل ما يحتاجه طالب الحقوق بالمغرب" (All-in-One Law Toolbox)
- 4 colorful Duolingo-styled feature cards:
  1. 📖 **مدونة القوانين المحيّنة**: ق.ل.ع، الجنائي، التجاري، ومدونة الأسرة.
  2. ⚡ **بنك الامتحانات والنوازل**: مئات النوازل المحلولة بنماذج كليات الحقوق المغربية.
  3. 🔥 **مراجعة ذكية بالتكرار المتباعد**: فلاش كاردز ترسخ الفصول الصعبة في الذاكرة.
  4. 📱 **تزامن كامل عبر الهاتف والحاسوب**: حسابك وملخصاتك معك أينما ذهبت.

---

## 🔐 4. Auth Resilience (Google Error Shield & Instant Flow)

In `frontend/src/components/LawOS/Portal/AuthModal.jsx`:
- If Google Sign-In is triggered and Google returns `invalid_client` or origin blocked, capture the error gracefully without throwing a blocking popup.
- Show an intuitive helper notice: *"تسجيل الدخول عبر البريد أو رمز الهاتف متاح فوراً"* with a prominent instant tab switch.
- Allow 1-click guest preview or fast email sign-up.

---

## 🛠️ Execution & Verification Steps
1. Create `MascotQanouni.jsx` with vector poses and integrate as the official logo and hero center.
2. Refactor `portal.css` for flawless mobile responsiveness matching Duolingo's Android/iOS apps.
3. Update `HeroDuolingo.jsx` and `InfoSections.jsx` with the Squads, AI Mentor, and All-in-One features.
4. Run `cd frontend && npm run build` to verify 0 errors.
5. Deploy to `dv6` via SSH/rsync, restart container, and verify `https://tayebhomeserver.tail94b594.ts.net/`.
