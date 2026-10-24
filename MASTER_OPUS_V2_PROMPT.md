# MASTER CORRECTION PROMPT: OPUS 5.5 ➔ CLAUDE CODE (TALIB "طالب" REALITY OVERHAUL)
### Copy and paste this prompt directly into Claude Opus 5.5 Chat

```markdown
# CRITICAL DIRECTIVE FOR CLAUDE OPUS 5.5: REMEDIATE OVER-CONSERVATISM & DELIVER THE FINISHED PRODUCT
# App: Talib ("طالب") | Branch: qanouni | Stack: Express + SQLite/Prisma + React 18 / Tailwind 3.4

## 🚨 EXECUTIVE FEEDBACK & DIAGNOSIS OF THE FAILED RUN

Opus, the previous prompt you generated for Claude Code had a critical flaw: **it was overly cautious, defensive, and conservative.** 
Instead of delivering a finished, populated, and vibrant academic application, Claude Code followed your instructions to create **empty catalog shells ("pending_source"), skipped seeding S3 modules because of an outdated test, created stub adapters that return `NOT_IMPLEMENTED`, and left the user with an app full of placeholders, missing data, and broken database migrations.**

The user tested the app and stated plainly:
> *"chft l app , ban lia dakchi li glt lih kamel madroch o ma3jbnich fadchi li dar... l ghlibia dyal dakchi li dwina 3lih madarooch."*
> (I looked at the app, none of what I asked for was really done properly, and most of what we discussed was not implemented.)

### YOUR MISSION NOW:
You must write an uncompromising, execution-ready prompt for **Claude Code (CLI)** that **ACTUALLY IMPLEMENTS AND SHIPS THE FULL USER EXPERIENCE WITH REAL DATA, POPULATED MODULES, WORKING UI COMPONENTS, AND ZERO PLACEHOLDERS.**

---

## 🏛️ NON-NEGOTIABLE CORE DIRECTIVES (WHAT CLAUDE CODE MUST DELIVER)

### 1. Database Migrations Must Be Applied to Development (`server/storage/anythingllm.db`)
- In RC3, 10 migrations were created in `prisma/migrations/`, but were **never applied to the local SQLite database**, causing instant Prisma crash:
  `The column 'main.LawUserProfile.shareCode' does not exist`
  `The column 'main.LawTimetableSlot.professor' does not exist`
- **MANDATORY INSTRUCTION FOR CLAUDE CODE**: Claude Code must run `npx prisma migrate deploy` on `server/storage/anythingllm.db` and verify the columns exist in the active dev DB before finishing!

### 2. "اليوم" (Today Dashboard) — Must Look Full, Balanced, and Functional
- **Desktop Grid**: No vast empty space. An expansive 2/3-column responsive layout.
- **Top Daily To-Do Hub ("قائمتي اليومية")**:
  - Interactive checklist with quick-add (Enter key), checkbox toggle, priority tags, and persistence in IDB + `/law/todos`.
  - Auto-surfaces today's upcoming session from the timetable and pending reviews.
- **QR Handshake Logic**:
  - **On Web/Desktop**: Clicking QR code **MUST NOT open the camera**. It displays a modal showing the student's personal QR code card and `XXXX-XXXX` share code for others to scan.
  - **On Mobile**: Clicking QR code prompts a clean 2-choice bottom sheet:
    1. 📷 "مسح رمز QR" (Scan a friend's code — opens camera).
    2. 🪪 "إظهار رمزي" (Show my QR code card for scanning).
- **Notification Bell**:
  - Clicking the bell **MUST NOT redirect to the friends tab**.
  - It opens an inline floating **Popover Bubble** showing unread notifications with inline action buttons (Accept friend, View note, Mark as read).
- **Desktop Header RTL Order**:
  - Brand Logo + Profile Avatar must be positioned on the **RIGHT** (start of RTL) in the navigation bar.
- **Eliminate Clutter**:
  - Permanently remove the arbitrary 15/20/30-minute goal picker and redundant duplicate cards.

### 3. "المسار الدراسي" (Academic Path & S1–S6 Modules) — PRE-POPULATED S3 DATA
- **NO MORE EMPTY STATES**:
  - If a student selects **S3 (Droit Privé / Public, Arabic or French)**, the official S3 modules **MUST BE VISIBLE AND READY IMMEDIATELY**:
    1. المسؤولية المدنية (Civil Liability)
    2. قانون الشركات (Company Law)
    3. القانون الاجتماعي / الشغل (Labor & Social Law)
    4. التنظيم القضائي للمملكة (Judicial Organization)
    5. الأنظمة الدستورية المقارنة (Comparative Constitutional Systems)
    6. قانون الميزانية والمالية العامة (Public Finance & Budget Law)
  - **Delete or update any outdated test** that asserts an empty module list! The product requirement is that S3 is pre-populated.
  - Clean "+ إضافة مادة" (+ Add custom module) button is always present.
- **Nav Cleanup**:
  - Completely remove standalone "المواد" (`/law/subjects`) and "المنهجية" (`/law/method`) tabs from the navigation. They are now integrated inside the module itself.
- **Inside the Module Workspace (في قلب المادة)**:
  - **Module Initialization Questionnaire (Onboarding)**:
    - *هل يوجد مطبوع رسمي (Polycopié)؟* (نعم / لا)
    - *استراتيجية العمل*: بناء الدرس كاملاً للامتحان / متابعة محاضرة بمحاضرة.
    - *طريقة العرض (قابلة للتبديل في أي لحظة بنقرة واحدة)*:
      1. 🎯 **مسار المراحل (Duolingo Staged Queue)**: نقاط ومراحل تفاعلية متسلسلة للتقدم.
      2. 📖 **القارئ الأكاديمي الكلاسيكي (Traditional Reader)**: فصول وأقسام متسلسلة وواضحة.
      3. 🌳 **شجرة العناوين القابلة للطي (CherryTree Outline)**: هيكل شجري تفاعلي سريع التصفح.
      4. ⚖️ **محاور المطبوع القانوني (Legal Axes)**: تقسيم رسمي (الأقسام، الأبواب، الفصول، المباحث، المطالب، الفقرات).
    - *مستوى التفصيل والتلخيص*: مختصر ولاصق ("لاصق وسهل") / مفصل وشامل ("مفصل وشامل") / غير ملخص.
  - **Module Progress Recap**:
    - عداد الحصص المحضورة، نسبة الإنجاز في المادة، وحالة الاستيعاب.
  - **بطاقة الأستاذ (Professor Persona Card)**:
    - أسلوب التدريس: هل يعتمد على المطبوع فقط أم يركز على الشرح الشفهي؟
    - مدى التركيز على الحضور والغياب.
    - طبيعة الامتحانات: هل يركز على التعاريف والحفظ، أم على النوازل والقضايا العملية؟
  - **In-Module Dedicated AI Legal Mentor Chat**:
    - Scoped strictly to that specific subject.
    - خياران: "طرح سؤال أو استشارة منهجية" / "متابعة بناء وتلخيص الدرس".
  - **Multimodal Lecture Ingestion**:
    - يدعم إدخال المحاضرات بـ: نص ملخص، تسجيل صوتي (Audio)، صور السبورة والدفتر (Vision OCR)، أو فصول من المطبوع (PDF).
  - **Strict Boundary**:
    - فضاء المادة مخصص حصرياً **للتعلم والتكوين** (Learning). الامتحانات والاختبارات مكانها مركز الامتحانات!

### 4. "مركز الامتحانات والاختبارات" ("شنو فهمت؟") — REPLACES SMART REVISION
- Fully replace the old "المراجعة الذكية" tab with **"مركز الامتحانات والاختبارات"**.
- **4 Real Interactive Assessment Drill Cards**:
  1. **QCM (اختيار من متعدد)**: فصول، مدد قانونية، وعقوبات.
  2. **نازلة تطبيقية (Cas Pratique)**: منهجية حل النوازل بـ 4 خطوات (الوقائع ➔ الإشكال القانوني ➔ القاعدة القانونية ➔ الحل وتطبيق القانون).
  3. **أسئلة نظرية مباشرة**: تعاريف وتمييز بين المفاهيم (التقادم vs السقوط، البطلان vs الإبطال).
  4. **موضوع مقالي قانوني (Dissertation)**: تصميم متوازن (مقدمة، إشكالية، مبحث أول، مبحث ثاني).
- **سؤال تخصيص طريقة الامتحان**:
  - سؤال للطالب: "ما هي طريقة الأستاذ المعتمدة في الامتحانات؟" (QCM، نازلة، موضوع، مختلط) لتكييف الاختبارات مع أسلوب أستاذه.
- **إدارة مواعيد الامتحانات (Exam Calendar & Countdown)**:
  - عداد تنازلي حقيقي للامتحانات القادمة.
  - 3 خيارات لإدخال التاريخ: إدخال يدوي مباشر، تصوير جدول الامتحانات المعلق في الكلية، أو رفع ملف PDF لجدول الامتحانات مع استخراج تلقائي وتأكيد من الطالب.

### 5. "استعمال الزمن" (Timetable Hub) — DEDICATED SPACIOUS HUB
- Dedicated top-level tab in navigation.
- جدول أسبوعي واسع ومريح (من الإثنين إلى السبت) مصمم بـ Tokens وبلا ضيق.
- يدعم: إدخال الحصص يدوياً، أو استيراد ملف (CSV / ICS)، أو تصوير جدول الحصص.
- نظام تنبيهات الحصص: إشعار في المساء ("لديك حصة غداً: ...") وتنبيه قبل الحصة بـ 30 دقيقة.

### 6. "قوانين ومراجع" (Official Legal Corpus) — REAL TEXTS, NO "PENDING_SOURCE" SHELLS
- **CLEAN OUT THE CLUTTER**:
  - Remove "إيصال للمكتبة", "دوراتي", "التقاط", and "إشعار قانوني" from this tab.
- **REAL MOROCCAN LAWS BUNDLED & ACCESSIBLE**:
  - Do NOT leave statutes as empty "pending_source" cards! The user wants the official Moroccan codes present and readable:
    1. **القوانين الأساسية**: ظهير الالتزامات والعقود (ق.ل.ع)، القانون الجنائي، المسطرة المدنية، المسطرة الجنائية، مدونة التجارة، مدونة الأسرة، مدونة الشغل.
    2. **القوانين التنظيمية والإطار**: القانون التنظيمي لقانون المالية (130.13)، القوانين التنظيمية للجماعات الترابية، القانون الإطار للاستثمار، القانون الإطار للمنظومة الصحية، القانون الإطار للتربية والتكوين.
    3. **أهم المراسيم والظهائر التنظيمية**.
  - Seed these texts into the corpus database with clean article navigation so students can actually search and read articles!

### 7. "المجتمع ومجموعات العمل" (Community & Study Squads)
- **3 Distinct Sub-Hubs**:
  1. **الأصدقاء (Friends)**:
     - كود الصداقة بصيغة سهلة وقصيرة `XXXX-XXXX` مع زر مباشر: "مشاركة عبر WhatsApp".
     - بحث سهل بالأكواد أو الأسماء.
  2. **مجتمع الكلية (Campus Community)**:
     - حائط تفاعلي حسب كلية الطالب (إعلانات، تبادل أفواج TD، ونقاشات قانونية).
  3. **مجموعات العمل الأكاديمي (Study Squads)**:
     - **مجموعات للعمل الجاد فقط (بدون شات عشوائي وبدون ستيكرات)**.
     - مشاركة ملخصات، مذكرات، ونوازل محلولة.
     - خيار المجموعة: عامة (Public) أو خاصة (Private).
     - **نظام صلاحيات ومراجعة تغييرات شبيه بـ GitHub**:
       - الأدمن يحدد: هل المشاركة للأدمن فقط، أم مسموح للأعضاء بالتعديل.
       - حذف تاب "تبادل الطلبات" المستقل، ودمج طلبات التعديل (Change Requests) مباشرة داخل الوثيقة بمقارنة التغييرات (Inline Diff) مع زري: "قبول التعديل (Approve)" و "رفض (Reject)".

### 8. استوديو الأفاتار القانوني (Legal Avatar Studio)
- استوديو تصميم أفاتار ممتع وغني بالخيارات (مستوحى من Bitmoji و Duolingo).
- أزياء قانونية مغربية حقيقية ومرسومة بدقة:
  - بذلة القاضي المغربي (مع الوشاح الأخضر المميز).
  - روب المحاماة الأسود (مع ربطة العنق البيضاء الرسمية).
  - جلباب العدل / الموثق المغربي مع محفظة المستندات الجلدية.
  - هندام الأستاذ الجامعي.
  - هندام طالب الحقوق مع الحقيبة الجامعية.

### 9. الهوية البصرية، الشعار، والـ Mascot
- **اسم التطبيق**: **طالب (Talib)** في كامل التطبيق.
- **شعار شفاف بدون خلفية بيضاء**:
  - في الوضع الليلي (Dark Mode)، يجب ألا يظهر أي إطار أو مستطيل أبيض وراء اللوجو نهائياً (SVG / Transparent PNG).
- **الـ Mascot ("طالب الكتاب")**:
  - إعادة دمج تميمة كتاب القانون اللطيف واستخدامه في شاشات الإنجاز، الترحيب، والشاشات الفارغة (مثل Duo في Duolingo).
- **كتابة أكاديمية رصينة (Anti-Cliché)**:
  - إزالة الأرقام الوهمية ("1500 مادة"، "800 نازلة").
  - إزالة الكلمات المبتذلة من الصفحة الرئيسية ("مجان"، "عمل جماعي"، "لا تراجع وحدك").
  - استبدالها بصياغة أكاديمية رصينة تبرز القيمة الحقيقية للمنصة لطالب القانون.

---

## 🛠️ YOUR DELIVERABLE: THE CLAUDE CODE EXECUTION PROMPT

As Claude Opus 5.5, synthesize these exact requirements into a **comprehensive, phase-by-phase, fully executable CLI prompt for Claude Code**.

The prompt you write must:
1. Command Claude Code to apply all pending Prisma migrations on `server/storage/anythingllm.db` first.
2. Direct Claude Code to implement the 6 navigation hubs and all user features above with **REAL WORKING UI & REAL DATA**, not stubs or empty catalogs.
3. Keep `bash scripts/gate.sh` green.
4. Execute fully autonomously with `--dangerously-skip-permissions`.

Generate the complete, authoritative prompt now!
```
