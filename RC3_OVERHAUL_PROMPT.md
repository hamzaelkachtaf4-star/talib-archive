# Talib ("طالب") — Comprehensive RC3 Architecture & Product Overhaul

> **Audience:** Claude Code (CLI), running non-interactively on branch `qanouni`, baseline `7c03433`.
> **Mode:** Autonomous, phase-by-phase, atomic commits, `bash scripts/gate.sh` green after every phase.
> **Author's intent:** Rebrand Rafiq → Talib and restructure the app around six hubs (اليوم · المسار الدراسي · استعمال الزمن · مركز الامتحانات · قوانين ومراجع · المجتمع) without breaking anything that works today.

---

## 0. HOW TO RUN THIS PROMPT

This is a large release. Treat it as **11 resumable work units**, not one marathon.

1. Before touching code, create `docs/rc3/PROGRESS.md` with one checkbox per phase (−1 through 10). After each phase: tick the box, record the commit SHA, the gate result line, and any deviation from this spec.
2. **On every (re)start, read `docs/rc3/PROGRESS.md` first** and resume at the first unticked phase. Never redo a ticked phase.
3. If the context window gets tight mid-phase, finish the current sub-step, commit with a `wip(rc3): ...` message only if the gate passes, update PROGRESS.md with exactly where you stopped, and stop. A clean stop is better than a degraded finish.
4. Run in a disposable container or VM. You are running with `--dangerously-skip-permissions`; you must never touch anything outside the repo working tree, never push, never force-push, never rewrite history before `7c03433`.

---

## 1. GROUND RULES (NON-NEGOTIABLE)

### 1.1 The gate is the law — and you may not change the law
- Run `bash scripts/gate.sh` at the end of **every** phase. A phase is done only when it passes 100%.
- **You must not edit `scripts/gate.sh`, any gate rule file, any linter allowlist, jest config thresholds, or any existing test to make the gate pass.** No `// eslint-disable`, no `.skip`, no `xit`, no deleted assertions, no new allowlist entries. If a gate check genuinely blocks a correct change, stop, document it in PROGRESS.md under `## Blocked`, and move to the next independent phase.
- The jest suite count will grow beyond 54 — that is expected. If the gate hardcodes `54`, that is a legitimate blocker to report, not to edit.
- Gate checks you must satisfy: `brand-string`, `physical-css`, `fixed-utc-offset`, `idb-destructive-upgrade`, `device-owner-wipe`, `no-createmany`, `ui-hex`, `game-terms`, `arrow-glyph`, `prisma-validate`, `brain-check`, frontend build, jest.

### 1.2 Upstream protection
- This is an AnythingLLM fork. **Zero modifications to upstream AnythingLLM modules** outside the `LawOS` / `law` / `qanouni` namespaces, except one-line route/registry hooks that already have precedent in the repo. If you need an upstream change, wrap it in an adapter inside the law namespace.

### 1.3 Database (Prisma 5.3 + SQLite WAL)
- **No `createMany`. Ever.** Multi-row inserts use `prisma.$transaction([...individual creates])` or a sequential loop inside an interactive transaction.
- Migrations: follow the repo's existing convention (inspect `server/package.json` scripts and `server/prisma/migrations/` naming during Phase −1). One migration per phase that changes schema, named `rc3_pN_<topic>`.
- Migrations are **additive only** in this release: new tables, new nullable columns, new columns with defaults. No column drops, no renames, no type changes on existing columns. Deprecated columns stay and are marked `/// @deprecated rc3` in the schema.
- Every new model with user data has `userId` (or `ownerId`) + `createdAt` + `updatedAt` and `onDelete: Cascade` from the user relation, so account deletion (CNDP / law 09-08 right to erasure) keeps working.
- Enums: SQLite has no native enums in Prisma 5.3 — use `String` columns validated by a shared constant (`server/utils/law/enums.js`) and by request validators.

### 1.4 Frontend
- Tailwind 3.4 + `frontend/src/styles/tokens.css`. **Logical properties only** (`ms- me- ps- pe- start- end- text-start text-end inset-inline-*`). No `ml/mr/pl/pr/left/right`.
- **No hex colors in components.** Every color is a `var(--law-*)` token. New colors are added to `tokens.css` for both paper and midnight themes in the same commit.
- Directional arrows only through `frontend/src/components/LawOS/kit/DirArrow.jsx`.
- All user-facing strings go through the qanouni locale files (`ar`, `ary`, `fr`, `en`) — all four keys added in the same commit. `ar` is the reference locale; `ary` may equal `ar` where Darija adds nothing.
- Dates/times: always IANA zone `Africa/Casablanca` via the existing time utility. **Never** a fixed offset (`+01:00`, `+00:00`) — Morocco switches offset around Ramadan, and the `fixed-utc-offset` gate exists for that reason.
- IndexedDB: schema changes are **version bumps that only add stores/indexes**. Never `deleteObjectStore`, never clear on upgrade (`idb-destructive-upgrade` gate). Never wipe another device-owner's local data (`device-owner-wipe` gate).
- Before writing any gamified copy (Phase 2, 3, 4), read the `game-terms` gate rule and use only permitted vocabulary.

### 1.5 Brand
- The only places the product name may appear as a literal: `frontend/src/config/brand.js` and `server/utils/law/brand.js`. Everything else consumes `BRAND`.
- **Do not rename internal identifiers** that contain `qanouni` / `Qanouni` (folder `locales/qanouni/`, `MascotQanouni.jsx`, route namespaces, DB tables, IDB names, localStorage keys, the branch). Renaming them breaks installed APKs/PWAs and existing user data for no user-visible gain. Internal names are not brand strings. Record this decision in `docs/rc3/DECISIONS.md`.

### 1.6 Legal content integrity (this is a law app — errors are product-breaking)
- **Never generate statute text, article numbers, penalties, or court decisions from model memory.** Legal text enters the app only through the ingestion pipeline from an official source file, with source URL, edition/consolidation date, and checksum stored alongside it.
- Seed data that encodes academic facts (semester module lists, exam formats) must be flagged `verified: false` with a visible "to confirm" marker until a human flips it. You are writing the plumbing, not certifying the curriculum.
- AI-generated study content (summaries, drills, model answers) must be visibly labelled as AI-generated and must cite the user's own sources (polycopié chunk / lecture) when it relies on them.
- Anything extracted by OCR/PDF parsing (exam dates, timetable rows) is shown to the user as a **review-and-confirm** step. Never auto-commit extracted dates.

### 1.7 Privacy
- No new third-party trackers or SDKs.
- Camera/microphone permissions are requested only on explicit user action, only on mobile for the QR scanner, and with a fallback path when denied.
- Lecture audio uploads show a one-time notice that the student is responsible for having permission to record. Raw audio is deleted after transcription unless the user opts to keep it.
- Phone matching stays HMAC-only (`LawPhoneHash`); never store or log raw phone numbers in new code.

### 1.8 Commits
- Conventional commits. At least one commit per phase; prefer several small commits per phase (schema → server → client → tests), each leaving the gate green.
- Every commit body ends with: `Gate: PASS (<n> suites)`.

---

## PHASE −1 — Reconnaissance (no product code)

**Goal:** Ground every later phase in what the code actually is. Do not skip; later phases reference what you find here.

**Do:**
1. `git status` clean, `git log -1` shows a descendant of `7c03433` on `qanouni`. Run `bash scripts/gate.sh` and record the baseline result. If baseline is red, stop and report — do not fix unrelated failures inside this release.
2. Read and summarise into `docs/rc3/RECON.md`:
   - `scripts/gate.sh` — the exact rule for each check (what pattern, which paths, allowlists).
   - `server/prisma/schema.prisma` — every law/qanouni model (Squad, Friend, Hub, Course, Lecture, Flashcard, Notification, etc.), with fields.
   - `frontend/src/navigation/nav.config.js`, the router file(s), `Shell/index.jsx`, `NotificationBell`, any QR component.
   - The IndexedDB layer: DB name, current version, stores.
   - The AI call path used by existing LawOS features (`LawBrain`, provider abstraction, any OCR/vision/transcription helper). **All new AI features in this release reuse that path.** Do not add a new provider SDK.
   - The existing `Review.jsx` / FSRS engine, `Library.jsx` data source, `Squad.jsx` / `Hub.jsx` data model.
   - Logo asset files and every place they are rendered.
   - Every occurrence of `رفيق` / `Rafiq` / `Rafi9` (grep, case-insensitive, all file types including `index.html`, `manifest.json`, service worker, Android wrapper config).
3. Create `docs/rc3/PROGRESS.md` and `docs/rc3/DECISIONS.md`.

**Commit:** `chore(rc3): add recon notes and progress tracker`

---

## PHASE 0 — Baseline & Brand Migration

**Files:**
- `frontend/src/config/brand.js`
- `server/utils/law/brand.js`
- `frontend/src/locales/qanouni/{ar,ary,fr,en}.json`
- `frontend/index.html`, `frontend/public/manifest.json` (or equivalent), service-worker cache name only if it embeds the display name (keep cache keys stable otherwise)
- Logo asset(s) + logo component
- `frontend/src/components/LawOS/Mascot/MascotQanouni.jsx` (+ new `MascotSlot.jsx`)

**0.1 Brand config**
```js
// frontend/src/config/brand.js
export const BRAND = Object.freeze({
  name:      { ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" },
  shortName: { ar: "طالب", ary: "طالب", fr: "Talib", en: "Talib" },
  tagline: {
    ar:  "المنصة الشاملة لطالب الحقوق بالمغرب",
    ary: "المنصة الشاملة لطالب الحقوق فالمغرب",
    fr:  "La plateforme complète de l'étudiant en droit au Maroc",
    en:  "The complete platform for Moroccan law students",
  },
  // keep every other existing key unchanged
});
export const brandName = (lang) => BRAND.name[lang] ?? BRAND.name.ar;
```
Mirror the same values in `server/utils/law/brand.js` (CommonJS, same shape). Add a jest test `server/__tests__/law/brand.parity.test.js` that imports both and asserts deep equality of `name`, `shortName`, `tagline`.

**0.2 Scrub old name**
- Replace every user-facing `رفيق`/`Rafiq` with interpolation of `BRAND` (locales use `{{brand}}` placeholders filled at render; server templates call `brandName(lang)`).
- `index.html` `<title>` / meta: set from build-time import of brand config if the build supports it; otherwise update the literal and confirm with the `brand-string` gate whether `index.html` is in its allowlist. Do not add it to the allowlist yourself.
- Careful: `رفيق` is also an ordinary Arabic word. Only replace occurrences that refer to the product.

**0.3 Logo transparency**
- Inspect the asset. If SVG: remove the full-bleed background `<rect>`/`fill="#fff"` and any white stroke halo; make foreground fills `currentColor` or token-driven so it can be themed. If PNG/WebP: regenerate with alpha (use `sharp` if already a dependency; otherwise prefer converting to SVG if a vector source exists in the repo). If no clean source exists, implement the logo component so it renders correctly on both surfaces and note in PROGRESS.md that a designer-provided transparent master is still required.
- Remove any `bg-white` / white wrapper behind the logo in the component.
- Test: render the logo component under `data-theme="dark"` and assert no element in its tree has a background other than `transparent`.

**0.4 Mascot**
- Create `MascotSlot.jsx`: `<MascotSlot moment="empty|onboarding|milestone|celebrate" message={...} />`, wrapping `MascotQanouni` with pose/expression per moment, `prefers-reduced-motion` respected, `aria-hidden` on the illustration with the message as real text.
- Do not place it yet beyond one existing empty state as a smoke test; later phases place it.

**Tests:** brand parity test; a frontend test (or jest-dom) that the Shell header renders `Talib`/`طالب` per locale.

**Commits:**
- `feat(brand): rename product to Talib (طالب) via central brand config`
- `fix(brand): transparent logo for paper and midnight themes`
- `feat(mascot): add MascotSlot wrapper for contextual mascot moments`

---

## PHASE 1 — Shell & Navigation Ergonomics

**Files:**
- `frontend/src/navigation/nav.config.js`
- router file(s) identified in recon
- `frontend/src/components/LawOS/Shell/index.jsx`
- `frontend/src/components/LawOS/Shell/BottomNav.jsx` (new or refactor)
- `frontend/src/components/LawOS/notifications/NotificationPopover.jsx` (new)
- `frontend/src/components/LawOS/qr/QrEntry.jsx`, `QrShowModal.jsx`, `QrChoiceSheet.jsx`, `QrScanner.jsx` (new/refactor)
- `frontend/src/hooks/useDeviceClass.js` (new)

**1.1 Navigation**
```js
// nav.config.js — six hubs, in this order
export const NAV = [
  { id: "today",     path: "/law/today",     labelKey: "nav.today" },     // اليوم
  { id: "path",      path: "/law/path",      labelKey: "nav.path" },      // المسار الدراسي
  { id: "timetable", path: "/law/timetable", labelKey: "nav.timetable" }, // استعمال الزمن
  { id: "exam",      path: "/law/exam",      labelKey: "nav.exam" },      // مركز الامتحانات
  { id: "library",   path: "/law/library",   labelKey: "nav.library" },   // قوانين ومراجع
  { id: "community", path: "/law/community", labelKey: "nav.community" }, // المجتمع
];
```
- **Every removed or renamed route gets a redirect**, never a 404 — old APKs and shared links point at them:
  `/law/subjects → /law/path`, `/law/method → /law/path`, `/law/review → /law/exam`, and any other path that changes. Put redirects in one `LEGACY_REDIRECTS` table with a test that iterates it.
- New hubs whose pages arrive in later phases get a minimal placeholder page (with `MascotSlot moment="empty"`) so navigation works after Phase 1.

**1.2 Desktop header (≥1024px)**
- Brand logo + profile avatar sit at the **inline-start** of the header (right in RTL, left in LTR). Implement with flex + logical order, **not** with physical `right`. Notification bell and QR entry sit at inline-end.

**1.3 Notification popover**
- Clicking the bell opens `NotificationPopover` anchored to the bell; no navigation.
- Contents: grouped recent items (friend requests with accept/decline inline, squad mentions, change-request reviews, session reminders), "mark all as read", per-item mark read, "عرض الكل" link to a full list route.
- Accessibility: `role="dialog"`, focus trap, Escape closes, focus returns to bell, outside click closes.
- On `<640px` render as a bottom sheet instead of an anchored popover.
- Reuse the existing notification API; if mark-as-read endpoints are missing, add `PATCH /api/law/notifications/:id/read` and `POST /api/law/notifications/read-all` with Bearer auth and ownership checks.

**1.4 QR handshake**
- `useDeviceClass()` returns `"desktop" | "mobile"` from pointer/hover media queries plus the existing APK/PWA detection — not user-agent sniffing alone.
- Desktop: `QrEntry` click → `QrShowModal` (user's friend QR + human-readable friend code from Phase 7; until then, the existing identifier). **No `getUserMedia` call on desktop.**
- Mobile: `QrEntry` click → `QrChoiceSheet` with two actions: "مسح رمز QR" → `QrScanner`; "إظهار رمزي" → `QrShowModal`.
- `QrScanner`: request camera only on that tap; if denied or unsupported (some iOS PWA contexts), fall back to `<input type="file" accept="image/*" capture="environment">` decoding, and to manual code entry.
- Reuse the QR library already in `package.json`; do not add a second one.

**1.5 Mobile bottom nav (<1024px)**
- Six items is too many for a thumb bar: show five (`today`, `path`, `exam`, `timetable`, `community`) and put `library` + profile/settings under a "المزيد" item. Record this in DECISIONS.md.
- Active state uses tokens only; tap feedback via a short CSS scale/opacity transition (disabled under `prefers-reduced-motion`); call `navigator.vibrate?.(8)` only inside the Android APK wrapper context, never on web.
- Respect `env(safe-area-inset-bottom)`.

**Tests:** redirect table test; nav config snapshot; popover opens without route change (assert `location.pathname` unchanged); QR desktop path never calls `navigator.mediaDevices.getUserMedia` (mock and assert not called).

**Commits:**
- `refactor(nav): six-hub navigation with legacy redirects`
- `feat(shell): inline-start brand and avatar on desktop header`
- `feat(notifications): inline notification popover`
- `feat(qr): device-aware QR show/scan handshake`
- `feat(shell): mobile bottom navigation with overflow menu`

---

## PHASE 2 — Today Dashboard Overhaul

**Files:**
- `frontend/src/pages/LawOS/Today.jsx` + `frontend/src/components/LawOS/today/*`
- `server/prisma/schema.prisma` (+ migration `rc3_p2_todos`)
- `server/endpoints/law/todos.js` (or the repo's endpoint convention)
- IDB layer (new `todos` store via version bump)

**2.1 Schema**
```prisma
model LawTodo {
  id          Int       @id @default(autoincrement())
  userId      Int
  user        users     @relation(fields: [userId], references: [id], onDelete: Cascade)
  clientId    String    // UUID generated on device, for offline-first idempotency
  title       String
  kind        String    @default("custom") // custom | lecture | reading | review
  refType     String?   // module | lecture | deck | session
  refId       String?
  dueDate     String?   // YYYY-MM-DD in Africa/Casablanca
  done        Boolean   @default(false)
  doneAt      DateTime?
  sortOrder   Int       @default(0)
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([userId, clientId])
  @@index([userId, dueDate])
}
```

**2.2 Sync**
- Offline-first: writes go to IDB `todos` store with `dirty: true`; a sync worker pushes `POST /api/law/todos/sync` with a batch; server upserts each in a `$transaction` keyed by `(userId, clientId)`; last-write-wins on `updatedAt`. Soft delete via `deletedAt`.
- Auto-generated items (today's lectures from Timetable, due review cards from FSRS) are **computed, not stored** until the user edits/checks them — avoids duplicate rows.

**2.3 Layout**
- Grid: 1 column `<768`, 2 columns `768–1279`, 3 columns `≥1280`, max content width from tokens; no large empty gutters.
- Top band (full width): To-Do hub — quick-add input (Enter to add), toggle, inline edit, drag reorder (keyboard accessible), filter chips (اليوم / المتأخر / الكل).
- Cards (each only if it has data; otherwise collapse, don't show a hollow card):
  - الحصة القادمة (next session from Timetable; placeholder link until Phase 5).
  - نقاشات غير مقروءة (unread squad items count + latest 3).
  - رادار الفجوات (top 3 weak topics from `LawBrain` gap radar, linking into the module).
  - الامتحان القادم (countdown from Phase 4; placeholder until then).
- **Remove:** the 15/20/30-minute goal picker and any card that duplicates another. Keep any underlying streak/XP data model intact (don't drop columns); just stop rendering the picker.
- `MascotSlot moment="celebrate"` when all of today's todos are done.

**Tests:** sync endpoint (idempotency on repeated clientId, ownership enforcement, soft delete); IDB upgrade test asserting existing stores survive; Today renders without the minute picker.

**Commits:**
- `feat(today): LawTodo model and offline-first sync endpoint`
- `feat(today): responsive dashboard grid with daily to-do hub`
- `refactor(today): remove minute-goal picker and redundant cards`

---

## PHASE 3 — Semester Context & In-Module Learning Workspace

**Files:**
- `server/prisma/schema.prisma` (+ `rc3_p3_modules`)
- `server/data/law/curricula/*.json` (seed data)
- `server/endpoints/law/modules.js`, `lectures.js`, `professors.js`, `moduleChat.js`
- `frontend/src/pages/LawOS/ModulePath.jsx`, `Course.jsx`
- `frontend/src/components/LawOS/module/{ModuleSetupWizard,ModuleRecap,LectureIngest,ProfessorCard,ModuleMentorChat}.jsx`
- `frontend/src/components/LawOS/module/views/{TrailView,ReaderView,TreeView,AxesView}.jsx`

**3.1 Semester-aware loading**
- If the user profile has semester + track (`private|public`) + language (`ar|fr`) + faculty, `/law/path` opens directly on that semester's module list.
- Curricula seed: populate the default S3 lists **only** with the module names supplied by the project lead (المسؤولية المدنية، قانون الشركات، القانون الاجتماعي، التنظيم القضائي، الأنظمة الدستورية). Show a discreet "قائمة افتراضية — تحقق منها" badge while `verified: false`.
- Seeding into DB per user: on first visit, copy the default list into user-scoped `LawModule` rows in a `$transaction`. Never show "لا مواد منشورة لهذا الفصل" when the semester is known; if the seed is empty, show the add-module CTA with `MascotSlot moment="empty"`.
- "+ إضافة مادة": custom module.

**3.2 Consolidation**
- Remove standalone "المواد" and "المنهجية" tabs from nav. Methodology content moves into each module as a "المنهجية" section.

**3.3 Schema**
```prisma
model LawModuleProfile {
  id             Int      @id @default(autoincrement())
  userId         Int
  moduleId       Int      @unique
  hasPolycopie   Boolean?
  strategy       String?  // full_course | per_lecture
  viewStyle      String   @default("reader") // trail | reader | tree | axes
  depth          String   @default("concise") // concise | detailed
  setupDoneAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model LawProfessorCard {
  id               Int      @id @default(autoincrement())
  userId           Int
  moduleId         Int
  name             String?
  teachingStyle    String?  // reads_polycopie | verbal_detail | mixed
  attendanceFocus  String?  // strict | flexible | unknown
  examTendency     String?  // definitions | cases | mixed | unknown
  examFormat       String?  // qcm | case | direct | dissertation | mixed
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([userId, moduleId])
}

model LawLectureSource {
  id          Int      @id @default(autoincrement())
  userId      Int
  moduleId    Int
  lectureId   Int?
  kind        String   // text | audio | image | pdf
  status      String   @default("pending") // pending | processing | ready | failed
  storageKey  String?
  keepRaw     Boolean  @default(false)
  extracted   String?
  error       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId, moduleId])
}
```
The professor card is **private to that student**.

**3.4 Module setup wizard**
1. هل يوجد مطبوع رسمي؟ — نعم / لا
2. استراتيجية الدراسة — بناء الدرس كاملاً / متابعة محاضرة بمحاضرة
3. طريقة العرض — مسار المراحل · قارئ أكاديمي · شجرة قابلة للطي · محاور المطبوع
4. العمق — مختصر ومباشر / مفصل وشامل

**3.5 Four views over one content model**
- One underlying tree of nodes (`{id, parentId, level, title, body, order, sourceRefs}`). Four views: `TrailView`, `ReaderView`, `TreeView`, `AxesView`.

**3.6 Multimodal lecture ingestion**
- Inputs: paste text · audio upload · photos · PDF chapter.
- Limits: file size/type validation server-side; per-user rate limit. One-time audio notice.

**3.7 Module recap widget**
- Lectures added, nodes completed, notes generated, gap radar score.

**3.8 In-module mentor chat**
- Scoped strictly to that module's sources. Two modes: Q&A vs proposing diffs to build course notes. No drills or grading here (links to Exam Center).

**Tests:** seeding transaction; module ownership; ingestion state machine; chat retrieval filter; view toggle persists.

**Commits:**
- `feat(path): semester-aware module loading with verifiable curriculum seeds`
- `refactor(path): fold subjects and methodology into module workspace`
- `feat(module): setup wizard and switchable views over one content tree`
- `feat(module): multimodal lecture ingestion pipeline`
- `feat(module): private professor card and progress recap`
- `feat(module): module-scoped mentor chat with diff-based course building`

---

## PHASE 4 — Exam & Testing Center ("شنو فهمت؟")

**Files:**
- `frontend/src/pages/LawOS/ExamCenter.jsx` (`Review.jsx` kept internally for FSRS cards)
- `frontend/src/components/LawOS/exam/{DrillQcm,DrillCase,DrillDirect,DrillDissertation,ReadinessRadar,ExamCountdown,ExamScheduleImport}.jsx`
- `server/prisma/schema.prisma` (+ `rc3_p4_exams`)
- `server/endpoints/law/exams.js`, `server/utils/law/drills/*`

**4.1 Keep what works**
- FSRS flashcard review continues functioning as "مراجعة البطاقات".

**4.2 Schema**
```prisma
model LawExamDate {
  id          Int      @id @default(autoincrement())
  userId      Int
  moduleId    Int?
  title       String
  startsAt    DateTime
  room        String?
  source      String   @default("manual") // manual | photo | pdf
  confirmed   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId, startsAt])
}

model LawDrillAttempt {
  id          Int      @id @default(autoincrement())
  userId      Int
  moduleId    Int
  type        String   // qcm | case | direct | dissertation
  promptJson  String
  answerJson  String?
  feedbackJson String?
  score       Float?
  createdAt   DateTime @default(now())
  @@index([userId, moduleId, type])
}
```

**4.3 Four drill types**
1. **QCM** — 4 options, 1 correct, cites module node.
2. **نازلة تطبيقية** — 4 required sections: الوقائع → الإشكال القانوني → القاعدة القانونية → الحل وتطبيق القانون.
3. **أسئلة نظرية مباشرة** — definitions and distinctions.
4. **موضوع مقالي** — outline builder (مقدمة · إشكالية · المبحث الأول · المبحث الثاني).

**4.4 Professor format matcher**
- Matches `LawProfessorCard.examFormat`.

**4.5 Readiness radar & 4.6 Exam schedule**
- Countdown component. Photo/PDF extraction requires user confirmation before saving.

**Tests:** drill generation rejects uncited items; dissertation outline validator; schedule import confirm check; FSRS regression test.

**Commits:**
- `feat(exam): exam center shell preserving FSRS card review`
- `feat(exam): QCM, case, direct and dissertation drills with cited feedback`
- `feat(exam): professor exam-format matcher and readiness radar`
- `feat(exam): exam dates with countdown and confirm-before-save import`

---

## PHASE 5 — Timetable Hub ("استعمال الزمن")

**Files:**
- `frontend/src/pages/LawOS/Timetable.jsx`, `frontend/src/components/LawOS/timetable/*`
- `server/prisma/schema.prisma` (+ `rc3_p5_timetable`)
- `server/endpoints/law/timetable.js`, `server/utils/law/reminders.js`
- `server/utils/law/timetable/importers/{manual,ics,csv,image,fdcAdapter}.js`

**5.1 Schema**
```prisma
model LawTimetableSession {
  id          Int      @id @default(autoincrement())
  userId      Int
  moduleId    Int?
  weekday     Int      // 1=Mon … 6=Sat
  startTime   String   // "HH:mm" local Casablanca
  endTime     String
  kind        String   @default("cours") // cours | td | tp
  room        String?
  professor   String?
  group       String?
  validFrom   String?
  validTo     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId, weekday])
}

model LawReminderPref {
  id            Int     @id @default(autoincrement())
  userId        Int     @unique
  enabled       Boolean @default(true)
  eveningBefore Boolean @default(true)
  minutesBefore Int?
}
```

**5.2 UI & Import**
- Grid on desktop, day tabs on mobile. Quick add/edit.
- Manual, ICS, CSV, and photo OCR with review step.
- `fdcAdapter.js`: interface stub only (no scraping/credentials).

**5.3 Reminders**
- Evening before reminder ("لديك حصة غداً: {{module}} — {{room}}") in Casablanca zone. Surfaces on Today dashboard.

**Tests:** weekday/time computations; reminder idempotency; CSV/ICS parsers.

**Commits:**
- `feat(timetable): session model and weekly timetable hub`
- `feat(timetable): ICS/CSV/photo import with review step`
- `feat(timetable): session reminders in Casablanca time`

---

## PHASE 6 — Pure Legal Corpus ("قوانين ومراجع")

**Files:**
- `frontend/src/pages/LawOS/Library.jsx`
- `server/data/law/corpus/catalog.json`
- `server/scripts/law/ingest-corpus.js`

**6.1 Declutter**
- Relocate non-corpus items. Keep legal notice reachable in footer/settings.

**6.2 Categories & Catalog**
1. القوانين الأساسية
2. القوانين التنظيمية والقوانين الإطار
3. أهم الظهائر والمراسيم
- Catalog entries have `status: "pending_source"`. Ingestion script validates and records `sha256` + `consolidated_as_of`.

**Tests:** catalog schema; ingest idempotency; three categories rendered.

**Commits:**
- `refactor(library): remove non-corpus items and relocate their features`
- `feat(library): three-category legal corpus catalog with provenance`
- `feat(library): SGG corpus ingestion script with checksums`

---

## PHASE 7 — Community, Friends & Study Squads

**Files:**
- `frontend/src/pages/LawOS/Community.jsx` (sub-routes: `friends`, `campus`, `squads`), `Squad.jsx`, `Hub.jsx`
- `server/prisma/schema.prisma` (+ `rc3_p7_squads`)
- `server/endpoints/law/{friends,campus,squads,squadDocs}.js`
- `server/utils/law/permissions.js`

**7.1 Friend codes**
- 8-char unambiguous code `XXXX-XXXX`, unique, WhatsApp share link. Search by code.

**7.2 Campus community**
- Faculty-scoped wall: announcements, TD threads. Moderation tools (report/hide).

**7.3 Squads & Collaborative docs (GitHub-style)**
- Post types restricted to work artifacts (`summary`, `case_brief`, `mock_exam`, `question`, `resource_link`). No free-text chat/stickers.
- Roles: `owner, admin, editor, viewer`.
- Schema: `LawSquadMember`, `LawSquadDoc`, `LawSquadDocRevision`, `LawSquadChangeRequest`.
- Inline diff review (Approve / Reject). Stale base detection. Subsumes separate change requests tab.

**Tests:** permission matrix; stale rebase check; viewer edit denial; friend code uniqueness.

**Commits:**
- `feat(friends): human-readable friend codes with WhatsApp sharing`
- `feat(community): faculty campus wall with moderation`
- `feat(squads): work-only post types and visibility`
- `feat(squads): role permissions and inline change requests with revisions`

---

## PHASE 8 — Legal Avatar Studio

**Files:** `frontend/src/components/LawOS/avatar/*`.

- Layered SVG avatar: skin, face, hair/hijab, expression, outfit, accessory, background.
- Moroccan legal sets: بذلة القاضي (robe with green sash), روب المحاماة (black gown), عدل/موثق, أستاذ جامعي, طالب حقوق. No national emblem or court coat of arms.
- Category tabs, live preview in both themes, randomize, undo.

**Tests:** avatar config validation; render snapshot; no hardcoded hex.

**Commit:** `feat(avatar): legal avatar studio with Moroccan legal attire sets`

---

## PHASE 9 — Copywriting & Polish

**Files:** landing page component(s), onboarding screens, locales.

- Remove "1500 مادة", "800 نازلة مشروحة", "مواظبة يومية", "مجان", "عمل جماعي", "لا تراجع وحدك".
- New positioning:
  - "المنصة الذكية التي ترافقك في تفكيك المنهجية القانونية والتحضير المتين للامتحانات والمباريات"
  - "منهجية قانونية رصينة · مواكبة دقيقة لكل مادة · تلخيص ومراجعة توافق أسلوب أساتذتك"
- Empty states use `MascotSlot`. Responsive pass (360px, 768px, 1280px, 1920px) in ar RTL & fr LTR.

**Tests:** locale completeness; removed claims assertion.

**Commits:**
- `docs(copy): elite academic positioning, remove inflated claims`
- `style(polish): responsive and bidi pass across the six hubs`

---

## PHASE 10 — Final Audit & Gate Certification

1. `bash scripts/gate.sh` — full pass.
2. `npm audit --omit=dev`.
3. `npx prisma validate` and verify migrations on pre-RC3 DB copy.
4. IDB upgrade test.
5. Brand grep (`رفيق` only in changelog/decision context), logical-CSS and hex greps.
6. Write `docs/rc3/RELEASE_REPORT.md`.

**Commit:** `chore(release): RC3 audit report and gate certification`

---

## STOP CONDITIONS

Stop the current phase and document in PROGRESS.md when:
- Gate fails requiring gate/test/upstream edits.
- Schema change requires dropping/renaming existing columns.
- Feature requires fabricating legal text or official URLs.
- Feature requires credential scraping.
Stop entire run if baseline gate is red or pre-RC3 migration fails.
