# MISSION: Complete Reverse-Engineering & Redesign of Qanouni ("قانوني") Landing Page into a Duolingo-Grade Experience

## 🎯 Context & Goal
We are transforming the entry portal of Qanouni (Moroccan Law Student Intelligence Platform) located in `/Users/tayeb/Documents/law app`.
The current landing page (`frontend/src/pages/LawOS/Portal.jsx`) is dark, crowded, and cramped: it forces the login form, APK/PWA downloads, and a duplicate/overflowing QR code all into tight cards.

We want to completely rebuild this landing experience inspired directly by **Duolingo's world-class tactile web design** (clean off-white canvas, bold Arabic typography, 3D tactile buttons, playful mascot micro-animations, engaging scroll storytelling, and a clean Auth Modal).

**Crucial Business Rule:**
The owner is NOT publishing to Apple App Store or Google Play Console (no paid developer accounts).
Distribution is **100% Web-First**:
- **Android**: Direct APK download (`/downloads/qanouni.apk`) or Web Install.
- **iPhone (iOS)**: Direct PWA installation ("Add to Home Screen / تثبيت في الشاشة الرئيسية") with an intuitive interactive guide for Safari users.

---

## 🎨 1. Visual Architecture: Duolingo Aesthetic System ("Daw9 Premium")

### A. Canvas & Typography
- **Clean Canvas**: Soft, spacious, clean light background (`#f7f9fa` / `#ffffff`) leaving behind the cramped dark green cards.
- **Arabic-First Typography**: Bold, friendly, confident font hierarchy using Moroccan/Arabic typography without awkward letter-spacing.
- **3D Tactile Buttons (Signature Duolingo Style)**:
  - **Primary Green CTA**: Solid vibrant green (`#0b5d3b` / `#057a44`) with a darker bottom 3D shadow edge (`border-b-4 border-[#034d2b]`). When clicked/active, it depresses (`active:translate-y-1 active:border-b-0 transition-transform`).
  - **Secondary White CTA**: Crisp white button with tactile gray bottom border (`border-2 border-b-4 border-slate-200 active:border-b-2 active:translate-y-0.5`).

### B. The Hero Layout (Two Columns)
- **Column 1: Playful Legal Mascot / Vector Art**:
  - A friendly, colorful 3D-styled vector illustration (Mascot representing Moroccan Law: smart scales of justice / smiling law book character with cute eyes and graduation cap).
  - Subtle floating CSS spring animation (gentle hover float).
- **Column 2: Value Proposition & Two-Button Action Cluster**:
  - Eyebrow tag: *"منصة ذكية لطلبة القانون بالمغرب"*
  - Hero Headline: *"الطريقة الأمتع والأذكى للتفوق في دراسة القانون المغربي"*
  - Subtitle: *"محاضرات ملخصة، منهجية النوازل والاستشارات، واستعداد للامتحانات في منصة واحدة."*
  - **The Two Action Buttons**:
    1. Large Primary 3D Green: **"ابدأ الآن مجاناً"** (Opens Auth Modal in Sign-up mode).
    2. Tactile Secondary 3D White: **"لدي حساب بالفعل"** (Opens Auth Modal in Login mode).

---

## 📜 2. Scroll Storytelling & Web-App Download Section ("Learn Anywhere")

When scrolling down, feature sections animate smoothly:

### Section 1: "تعلم في أي وقت، ومن أي جهاز" (Device Sync & Direct Downloads)
- Centered 3D smartphone mockup showing Qanouni mobile interface with floating badges (Streak count 🔥, Civil code flashcards, Quiz score).
- **The Two Custom Store-Style Badges**:
  1. **Android Button ("تحميل لأندرويد - APK مباشر")**:
     - Styled like a premium store badge (Android robot icon).
     - Directly triggers download of `/downloads/qanouni.apk`.
  2. **iOS / iPhone Button ("تثبيت على آيفون - تطبيق ويب PWA")**:
     - Styled like an Apple badge (Apple icon).
     - Clicking it on iOS or desktop triggers a clean, illustrated 2-step tooltip/modal:
       - *1. اضغط على زر المشاركة (Share icon) في متصفح Safari.*
       - *2. اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).*

### Section 2: "المساعد القانوني الذكي ومراجعة النوازل"
- Interactive showcase card showing how AI breaks down Moroccan legal articles (e.g. *قانون الالتزامات والعقود - ق.ل.ع*) into clear student methodology (Facts, Legal Rule, Solution).

### Section 3: "الدعم والمساعدة الرسمية"
- Clean footer/section with official contact email (`contact@qanouni.ma`) and FAQ accordion for students (e.g. questions on offline access, accounts, and device sync).

---

## 🔐 3. Modern Auth Modal (Eliminating Clutter & Fixing QR Bugs)

Completely remove inline login forms and QR boxes from the hero page. Everything lives in an accessible, sleek **Auth Modal**:

### Tab 1: الدخول المباشر (Direct Sign-In)
- Official Google Identity button.
- Clean email & password fields with inline validation.
- Register & forgot password links.

### Tab 2: مسح رمز الهاتف (Quick Connect via Phone)
- Fix the duplicate/overflowing QR bug: Only **one** centered, high-contrast QR code.
- Clear 3-step illustrated instructions:
  1. افتح تطبيق قانوني في هاتفك (حسابك مسجل).
  2. اذهب إلى الملف الشخصي ➔ «مسح رمز QR للاتصال بالحاسوب».
  3. وجّه الكاميرا نحو هذا الرمز.
- Live countdown (5 minutes) and refresh button when expired.
- Active polling / status check (`Law.qrStatus`) to seamlessly redirect on phone approval.

---

## 🛠️ 4. Technical File Structure to Create / Refactor

In `/Users/tayeb/Documents/law app/frontend/`:
1. `src/pages/LawOS/Portal.jsx`: Main entry orchestrator.
2. `src/components/LawOS/Portal/TactileButton.jsx`: Reusable 3D Duolingo button component with tactile depth and sound/click physics.
3. `src/components/LawOS/Portal/HeroDuolingo.jsx`: The two-column hero with mascot & tactile CTAs.
4. `src/components/LawOS/Portal/DownloadSection.jsx`: Direct APK + iOS PWA install flow with device detection.
5. `src/components/LawOS/Portal/AuthModal.jsx`: Modal with Tab 1 (Google/Email) and Tab 2 (QR Handshake using `QrLogin.jsx`).
6. `src/components/LawOS/Portal/IosInstallModal.jsx`: Clean visual helper for iPhone users on Safari.
7. `src/pages/LawOS/portal.css`: Modernized Duolingo-grade styling utilizing existing `--law-*` CSS tokens.

### Notes for Implementation:
- Preserve all existing API models (`Law.login`, `Law.qrGenerate`, `Law.qrStatus`, `startSession`).
- Maintain full RTL (Arabic-first) alignment and translation hooks (`tr()`).
- Self-contained SVG illustrations for the mascot and mockups to ensure zero broken external asset links.
