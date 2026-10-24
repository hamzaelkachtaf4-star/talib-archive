# TALIB (طالب) — FULL PRODUCT DELIVERY RUN
Branch: `qanouni` · Stack: Express + SQLite/Prisma (`server/storage/anythingllm.db`) + React 18 / Tailwind 3.4 · RTL Arabic-first

You are Claude Code running autonomously. The previous run shipped empty shells: `pending_source` catalog cards, unseeded S3 modules (kept empty to satisfy an outdated test), adapters returning `NOT_IMPLEMENTED`, and migrations that were created but never applied. The user opened the app and found most of what was agreed missing.

This run ships the finished product: working UI, real data, applied migrations. Work through every phase below in order, do not stop to ask questions, and do not end the run until the Definition of Done at the bottom is met.

---

## GLOBAL RULES (apply to every phase)

1. **No placeholders.** Forbidden in shipped code paths: `NOT_IMPLEMENTED`, `pending_source`, `TODO`, `coming soon`, `قريباً`, lorem ipsum, fake counters, empty-state screens standing in for features that were requested. If a feature is listed here, it must work end to end (UI → API → DB → back).
2. **Tests follow the product, not the other way round.** When an existing test asserts old behavior that this spec replaces (e.g. "S3 module list is empty", "bell navigates to friends tab", "/law/subjects route exists"), rewrite that test to assert the new behavior. Never weaken the product to keep a stale test green. Never delete a test without replacing its coverage.
3. **Never fabricate legal text.** Statute articles, article numbers, and legal deadlines shown to students must come from a real source file (see Phase 7). Generated content (quizzes, summaries, model answers) must be produced from real corpus/module content and cite the article or lecture it came from. Inventing law is the one thing worse than an empty card.
4. **Design tokens only.** All colors, spacing, radii from the existing Tailwind theme tokens; full dark-mode parity; RTL logical properties (`ms-`/`me-`/`ps-`/`pe-`, `start`/`end`), never hard-coded left/right.
5. **Offline-first stays intact.** Anything the student creates (todos, module settings, timetable, avatar) persists in IndexedDB and syncs to the server endpoint; the UI never blocks on network.
6. **Commit per phase** with a clear message. Run `bash scripts/gate.sh` at the end of every phase; fix failures before moving on.
7. **Blockers go in the report, not in the UI.** If something truly cannot be completed (e.g. an official PDF cannot be downloaded), finish everything else, and list the blocker with the exact reason and the exact file the user must provide. Do not ship a stub for it.

---

## PHASE 0 — Recon & safety net

- `git status`; create working branch `qanouni-delivery` from `qanouni`.
- Back up the dev DB: `cp server/storage/anythingllm.db server/storage/anythingllm.db.bak-$(date +%Y%m%d%H%M)`.
- Read `CLAUDE.md` / README / `scripts/gate.sh` to learn conventions, then map the current routes, nav config, Prisma schema, and the `/law/*` API surface. Write a short `docs/delivery-map.md` (routes, models, components you will touch). Keep it brief; then build.
- Grep for every placeholder pattern in Rule 1 and list hits in `docs/delivery-map.md`. Every hit must be resolved by the end of the run.

## PHASE 1 — Database: apply migrations to the dev DB (MANDATORY FIRST FIX)

- Ensure `DATABASE_URL` points to `file:../storage/anythingllm.db` (relative to the Prisma schema; verify the real path).
- Run `npx prisma migrate deploy` from `server/`, then `npx prisma generate`.
- If deploy fails on drift, inspect `_prisma_migrations`, resolve with `prisma migrate resolve` only after confirming the change is already present; never `migrate reset` the dev DB.
- Verify with sqlite3:
  - `PRAGMA table_info(LawUserProfile);` → contains `shareCode`
  - `PRAGMA table_info(LawTimetableSlot);` → contains `professor`
  - every model in `schema.prisma` has its table and columns.
- Boot the server and hit `/law/profile` and `/law/timetable` to confirm Prisma no longer crashes.
- Add a gate check (in `scripts/gate.sh` or a test) that fails if `prisma migrate status` reports pending migrations against the dev DB.
- All new schema changes in later phases: create migration **and** apply it with `migrate deploy` in the same step.

## PHASE 2 — Brand, shell, navigation

- **Name:** “طالب” / “Talib” everywhere (titles, manifest, PWA name, splash, emails, meta). Grep for old names (`Qanouni`, `قانوني` as app name, `AnythingLLM` in user-facing strings) and replace.
- **Logo:** transparent SVG (and transparent PNG for manifest/APK icons). In dark mode no white box or frame behind it; check every place the logo renders.
- **Desktop header (RTL):** logo + profile avatar at the **right** (start), nav in the middle, bell + QR at the left (end).
- **Top-level nav = exactly 6 hubs:**
  1. اليوم
  2. المسار الدراسي
  3. مركز الامتحانات (“شنو فهمت؟”)
  4. استعمال الزمن
  5. قوانين ومراجع
  6. المجتمع
- Remove `/law/subjects` (المواد), `/law/method` (المنهجية), and المراجعة الذكية from nav. Add redirects from old routes to their new homes so bookmarks don't 404. Move their useful logic into the module workspace (Phase 4) and exam center (Phase 5).
- Mobile: bottom tab bar with the 6 hubs (icon + short label), profile/avatar reachable from the header.

## PHASE 3 — “اليوم” (Today)

- **Desktop layout:** responsive 3-column grid at `xl`, 2 at `lg`, 1 on mobile. No large empty regions; cards size to content.
- **قائمتي اليومية (Daily to-do hub)**, top and prominent:
  - Quick-add input (Enter submits), checkbox toggle, priority tag (عالية / متوسطة / عادية), delete, drag or simple reorder.
  - Persist in IDB + `GET/POST/PATCH/DELETE /law/todos` (create the model + migration if missing).
  - Auto-surfaced items (visually distinct, not deletable but dismissible for today): today's next class from the timetable, due reviews, and exams within 7 days.
- **Cards:** next class, upcoming exam countdown (from Phase 5), module progress snapshot (from Phase 4), recent squad activity. One of each — remove duplicates.
- **Remove** the 15/20/30-minute goal picker entirely (UI, state, API usage).
- **QR button:**
  - Desktop/web (no touch / wide viewport): opens a modal with the student's QR card (avatar, name, faculty) + share code `XXXX-XXXX` + copy button + “مشاركة عبر WhatsApp”. Must **not** request camera.
  - Mobile: bottom sheet with two choices — 📷 “مسح رمز QR” (opens camera scanner, on success sends friend request) and 🪪 “إظهار رمزي” (same card as desktop).
- **Notification bell:** opens an anchored popover (not a route change). Lists unread notifications with inline actions: قبول / رفض (friend request), عرض (note/change request → deep link), تعليم كمقروء, and “تعليم الكل كمقروء”. Badge count updates live. Closes on outside click / Esc. Fully keyboard accessible.

## PHASE 4 — “المسار الدراسي” (Academic path & modules)

- **Semester selector** S1–S6 + track (قانون خاص / قانون عام) + language (عربية / Français).
- **S3 is pre-seeded.** Seed via the app's seed mechanism (idempotent upsert, runs on deploy and in tests) these modules for S3, both tracks, both languages (French titles for the French track):
  1. المسؤولية المدنية — Responsabilité civile
  2. قانون الشركات — Droit des sociétés
  3. القانون الاجتماعي / قانون الشغل — Droit social / du travail
  4. التنظيم القضائي للمملكة — Organisation judiciaire du Royaume
  5. الأنظمة الدستورية المقارنة — Systèmes constitutionnels comparés
  6. قانون الميزانية والمالية العامة — Finances publiques et droit budgétaire
  Selecting S3 shows these immediately. Rewrite any test asserting an empty list so it asserts these six.
- “+ إضافة مادة” button always visible (custom module: name, professor, semester).
- **Module workspace** (one route per module, e.g. `/law/path/:moduleId`):
  - **Onboarding questionnaire** on first open (editable later from module settings):
    - هل يوجد مطبوع رسمي؟ نعم / لا (if نعم → offer PDF upload of the polycopié)
    - استراتيجية العمل: بناء الدرس كاملاً للامتحان / متابعة محاضرة بمحاضرة
    - طريقة العرض (switchable anytime via a one-click segmented control in the module header):
      1. 🎯 مسار المراحل — staged node path, nodes unlock sequentially, XP per node
      2. 📖 القارئ الأكاديمي — chapters/sections, clean reading typography
      3. 🌳 شجرة العناوين — collapsible outline tree, expand/collapse all, search
      4. ⚖️ محاور المطبوع — القسم › الباب › الفصل › المبحث › المطلب › الفقرة
      All four views render the **same underlying content model** (one tree of nodes with level + body); switching never loses data.
    - مستوى التفصيل: مختصر ولاصق / مفصل وشامل / غير ملخص — passed to the AI summarizer.
  - **Progress recap card:** sessions attended (counter with +/−), completion % (nodes done / total), comprehension status (self-rated + derived from exam-center results for this module).
  - **بطاقة الأستاذ:** editable fields — أسلوب التدريس (المطبوع فقط / الشرح الشفهي / مختلط), التركيز على الحضور (low/medium/high), طبيعة الامتحان (تعاريف وحفظ / نوازل وقضايا / مختلط). This card feeds Phase 5 question mix.
  - **In-module AI mentor chat:** uses the existing AnythingLLM workspace/LLM plumbing, one workspace (or thread) per module, system prompt scoped to that module's content and linked corpus texts. Two entry modes: “طرح سؤال أو استشارة منهجية” and “متابعة بناء وتلخيص الدرس” (the latter writes accepted output into the module content tree). Answers cite lecture/article sources when available.
  - **Multimodal lecture ingestion** — all four inputs must work:
    - نص (paste/typed summary)
    - تسجيل صوتي → transcription via the app's configured speech-to-text (AnythingLLM's whisper provider) → text
    - صور السبورة/الدفتر → OCR via the configured vision-capable LLM or tesseract (`ara+fra`) → text
    - PDF (polycopié chapters) → text extraction via existing document collector
    Extracted text → user preview/edit → AI structures it into nodes at the chosen detail level → inserted into the module tree.
  - **Boundary:** no quizzes or exams inside the module. A single “اختبر نفسك في هذه المادة” button deep-links to the exam center pre-filtered to this module.

## PHASE 5 — “مركز الامتحانات والاختبارات” (“شنو فهمت؟”)

- Replaces المراجعة الذكية (route, nav, any leftover components). Keep the FSRS scheduling engine if present and expose due reviews as a section here.
- **Module filter** at the top (all modules / one module).
- **Four drill types, each fully playable:**
  1. **QCM** — articles, legal deadlines, sanctions. Instant feedback, explanation with source citation, score summary.
  2. **نازلة تطبيقية** — 4-step guided answer: الوقائع ➔ الإشكال القانوني ➔ القاعدة القانونية ➔ الحل. Student writes each step; AI evaluates per step against a rubric and shows a model answer.
  3. **أسئلة نظرية** — definitions and distinctions (e.g. التقادم vs السقوط، البطلان vs الإبطال). Free-text answer, AI feedback.
  4. **موضوع مقالي** — student builds a plan (مقدمة، إشكالية، مبحث أول/مطلبان، مبحث ثاني/مطلبان); AI critiques balance and coherence.
- **Question generation:** generated by the LLM from the selected module's content tree and linked corpus articles, never from model memory alone; each question stores its source reference. Cache generated questions per module; store attempts and scores (model + migration).
- **Professor exam style question:** “ما هي طريقة الأستاذ المعتمدة في الامتحانات؟” (QCM / نازلة / موضوع / مختلط), prefilled from the professor card, adjusts the default drill mix.
- **Exam calendar & countdown:**
  - Live countdown (days/hours) for each upcoming exam, nearest first; also shown on Today.
  - Three input paths: manual entry; photo of the posted exam schedule (OCR → parsed rows); PDF of the schedule (text extraction → parsed rows). Parsed rows always go through a **confirmation table** where the student edits/approves before saving.

## PHASE 6 — “استعمال الزمن” (Timetable hub)

- Top-level tab. Spacious weekly grid Monday → Saturday, time rows, readable slot cards (module, type CM/TD, room, professor), tokens only, dark mode, horizontal scroll on mobile with sticky time column — or a day-by-day view on small screens.
- Add/edit/delete slots manually (modal form; slot links to a module).
- **Import:** CSV (documented header row; provide a downloadable template), ICS (parse VEVENT with RRULE weekly), and photo (OCR → confirmation table → save).
- **Reminders:** evening notification at a user-set time (default 20:00) “لديك حصة غداً: …”, and 30 minutes before each class. Use the existing notification system (web push / local notifications in the APK/PWA wrapper); notifications also appear in the bell popover. Settings toggle for both.

## PHASE 7 — “قوانين ومراجع” (Official legal corpus)

- **Remove** from this tab: إيصال للمكتبة، دوراتي، التقاط، إشعار قانوني (move any still-needed legal notice to settings/about).
- **Real texts, imported from real sources.** Build an importer script `server/scripts/import-corpus.(js|ts)`:
  - Input: official PDFs/text files placed in `server/storage/corpus-sources/` plus any already in the repo. Before anything else, search the repo and storage for existing source files.
  - Where network is available, download official consolidated versions from official Moroccan government sources (e.g. the SGG — sgg.gov.ma — and the Ministry of Justice legal portal adala.justice.gov.ma). Record source URL, version/date, and file hash for each text.
  - Parse into: code → book/part/title/chapter → article (number + body). Arabic-number and “الفصل/المادة” patterns both handled. Store in the corpus tables with full-text search (SQLite FTS5).
  - Validate: article count roughly matches the code's known structure, no empty bodies, sequential numbering with gaps reported.
- **Target texts:**
  - القوانين الأساسية: ظهير الالتزامات والعقود، مجموعة القانون الجنائي، قانون المسطرة المدنية، قانون المسطرة الجنائية، مدونة التجارة، مدونة الأسرة، مدونة الشغل.
  - القوانين التنظيمية والإطار: القانون التنظيمي 130.13 لقانون المالية، القوانين التنظيمية للجماعات الترابية (111.14، 112.14، 113.14)، القانون الإطار بمثابة ميثاق الاستثمار، القانون الإطار للمنظومة الصحية، القانون الإطار 51.17 للتربية والتكوين.
  - أهم المراسيم والظهائر التنظيمية (import what is obtainable; list the rest).
- **UI:** category sections → code page → article tree navigation (collapsible) → article reader with copy, share, bookmark, and “اربط بمادة” (link article to a module). Global search across all codes (article number or keyword). Only imported texts appear; there are no placeholder cards.
- **Never type article text from memory.** If a text cannot be obtained, it is absent from the UI and listed in the final report with the source the user should download.

## PHASE 8 — “المجتمع” (Community)

Three sub-tabs:

1. **الأصدقاء** — share code `XXXX-XXXX` (unambiguous alphabet, unique, from `LawUserProfile.shareCode`), copy, “مشاركة عبر WhatsApp” (`https://wa.me/?text=` with invite text + code), search by code or name, friend requests (send/accept/decline) wired to notifications.
2. **مجتمع الكلية** — wall scoped to the student's faculty: posts typed إعلان / تبادل أفواج TD / نقاش قانوني, comments, report button, author can delete. Pagination.
3. **مجموعات العمل** — serious study squads, no free chat, no stickers:
   - Create: name, module, public/private (private = invite by code/link).
   - Shared documents only: ملخصات، مذكرات، نوازل محلولة (rich text or uploaded file).
   - Admin permission setting: “الأدمن فقط ينشر” vs “الأعضاء يقترحون تعديلات”.
   - **GitHub-style change requests inside the document view:** member edits produce a change request; the document page shows pending requests with an inline word-level diff (Arabic-safe, RTL) and buttons “قبول التعديل” / “رفض”. Accepted → new document version (keep history). Notifications to admin and author.
   - Remove the standalone تبادل الطلبات tab.

## PHASE 9 — استوديو الأفاتار القانوني (Avatar studio)

- Layered SVG avatar builder (Bitmoji/Duolingo feel): skin tone, face shape, hair (incl. hijab options), eyes, brows, facial hair, glasses, background color.
- **Outfits — original SVG illustrations, drawn with care:**
  - زي القاضي المغربي (black robe with the green sash)
  - روب المحاماة الأسود with white bands/tie
  - جلباب العدل / الموثق with a leather document folder
  - هندام الأستاذ الجامعي
  - هندام طالب الحقوق with a university bag
- Live preview, randomize, save. Avatar renders in header, QR card, friends list, squads, wall posts. Persist as JSON config (IDB + server).

## PHASE 10 — Mascot & copy

- Mascot “طالب الكتاب” (the friendly law-book character with graduation tarboosh, existing asset if present, otherwise a new consistent SVG) on: onboarding/welcome, achievement/level-up screens, empty states where the student simply has no data yet (e.g. no todos), and errors.
- Landing/home copy: remove fake numbers (“1500 مادة”, “800 نازلة”, any invented stats) and clichés (“مجان”, “عمل جماعي”, “لا تراجع وحدك”). Replace with sober academic Arabic stating real value: structured courses by module, the official legal texts with search, exam drills modeled on FSJES formats (QCM، نازلة، موضوع), timetable and exam planning, serious study groups.

## PHASE 11 — Verification & report

1. `bash scripts/gate.sh` → green.
2. `npx prisma migrate status` against the dev DB → up to date.
3. Placeholder grep (Rule 1 patterns) over `frontend/src` and `server` (excluding tests and node_modules) → zero hits in shipped paths.
4. Boot server + frontend; walk each hub with Playwright (install if absent) at 1440px and 390px, light and dark, and save screenshots to `docs/delivery-screens/`. Required flows:
   - add/complete/delete a todo; QR modal on desktop (no camera prompt); bell popover with an actionable notification
   - select S3 → six modules visible → open one → questionnaire → switch all 4 views → ingest a pasted text lecture
   - play one drill of each type; add an exam manually and see the countdown on Today
   - add a timetable slot; import the CSV template
   - search an article in the corpus and open it
   - send + accept a friend request between two seeded test users; open a squad doc, submit a change request, approve it from the diff view
   - build and save an avatar with each of the five outfits
5. Write `docs/DELIVERY_REPORT.md`:
   - per phase: what shipped, files touched, tests added/rewritten (and why)
   - corpus table: each text, source URL, version date, article count
   - any blockers with exact reason and the exact action/file the user must provide
   - how to run: dev commands, seed command, corpus import command

**Definition of Done:** every item above works in the running app with real data, migrations are applied to `server/storage/anythingllm.db`, the gate is green, screenshots exist for every hub, and the report lists nothing as “not implemented” except genuine external blockers.

Begin with Phase 0 now.
