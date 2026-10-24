# RC3 recon (Phase −1)

Baseline: `7c03433` + `1792043` (RC2 working-tree changes committed with the owner's approval). Baseline gate: PASS (full, 1m43s).

## Gate (`scripts/gate.sh`, measured against local tag `gate-base`)
- brand-string: added lines in `frontend/src|server/(utils|endpoints|models)/**/*.js(x)`, excluding `brand.js` and `locales/`, must not contain Qanouni/Rafiq/RAFIQ/LAW-OS/رفيق as a standalone word.
- physical-css: added lines in `frontend/src/**/*.{jsx,css}` must not use ml/mr/pl/pr/left/right utilities, text-left/right, border-l/r, rounded-l/r…, `margin-left:` etc.
- fixed-utc-offset: `server/utils/law` + `server/endpoints/law` (except `time.js`) must not match `UTC+n`, `±0n:00`, `getTimezoneOffset`, `Etc/GMT`, `3600*1000*0|1`.
- idb-destructive-upgrade: no `deleteObjectStore` anywhere in frontend.
- device-owner-wipe: `lib/session.js` must keep `OWNER_KEY` and `previousId !== String(user.id)`.
- prefs-snapshot-push, onboarding-server-authoritative: textual guards on prefsSync / Shell (`isOnboarded` must not appear in Shell/index.jsx).
- no-createmany: no `.createMany(` in `server/models/law*.js`, `server/utils/law`, `server/endpoints/law`.
- pdf-no-arabic-shaping: no pdf libs / drawText in LAW-OS code.
- ui-hex: no `#hex` in `components/LawOS` and `pages/LawOS` (exempt: `LawOS/avatar/`, `MascotRafiq.jsx`, social buttons, `SubjectForm.jsx`, `PathPrint.jsx`).
- game-terms: no 🔥👑🎉🏆⭐🏅 and no `tr("…XP|boss|crown|checkpoint|streak|level up…")` / `>XP<` in jsx.
- arrow-glyph: no `←→` in LawOS jsx (use `kit/DirArrow`).
- e2e-a11y (skipped w/o env), offsite-backup, entrypoint, prisma-validate, brain-check, frontend build, jest.
- Gate does not hardcode "54" suites.

## Conventions found
- Migrations: `server/prisma/migrations/<YYYYMMDDHHMMSS>_law_<topic>/migration.sql`, last `20261028090000_law_knowledge_gaps`. RC3 uses `<ts>_rc3_pN_<topic>`. Schema DB url is hardcoded; never run `prisma format`.
- 76 `Law*` models (see schema). Relevant: LawSquad/Member/ModuleWorkspace/MasterNote/Endorsement/Card, LawFriendship, LawNotification, LawChangeRequest/NoteRevision/NoteCoAuthor/NoteReport, LawTimetableSlot/Source/Override/Subscription, LawFdcSession, LawCourseModule/PathNode/NodeProgress, LawStudentCourse/CourseTopic/KnowledgeGap, LawFlashcard/ReviewLog, LawDrillItem, LawConcept*, LawChat*.
- Endpoints: `server/endpoints/law/*.js` (academic, brain, capture, cards, chat, collab, corpus, course, hub, hubcollab, inbox, me, method, notes, path, profile, qr, radar, social, system, timetable).
- Nav: `frontend/src/navigation/nav.config.js` (NAV_HUBS: today, path, review, library, community), `legacyRedirects.js`, routes in `pages/LawOS/routes.jsx` (lazy `pages` map + `LEGACY_REDIRECTS`). Shell: `components/LawOS/Shell/index.jsx` (SideNav, BottomTabs, Header with inline NotificationBell → /law/community/friends, QR scanner button, AvatarMenu).
- i18n: Arabic source text IS the key (`tr("…")`); dictionaries `locales/qanouni/{ary,fr,en}.json` (no `ar.json`; Arabic falls back to the key). `scripts/i18n-add.mjs` helper exists.
- IndexedDB: name `lawos`, VERSION 4, stores cards, reviewQueue, meta, captures, batches, ttQueue, legalTexts (`lib/idb.js`). Upgrades only add stores.
- QR: `Profile/QrScanner.jsx` (BarcodeDetector, jsQR fallback), `qrcode.react` for display, server `qr.js`.
- AI path: `server/utils/law/ai/{router,gemini,deepseek,http,errors}.js` + `aiGuard.js`, `aiQuota.js`, prompts in `utils/law/prompts*`. All new AI work reuses `ai/router`.
- Brand: `frontend/src/config/brand.js`, `server/utils/law/brand.js`; logo `kit/BrandLogo.jsx` renders `/lawos/icons/icon.svg`; mascot `Portal/MascotRafiq.jsx`; kit `EmptyState.jsx`.
- Old-name occurrences (case-insensitive رفيق/rafiq/rafi9): frontend/index.html, public/manifest.json, public/lawos/icons/{icon,mascot}.svg, public/downloads/rafiq.apk.sha256, locales (ary/fr/en), config/brand.js, Portal/* (Hero, MascotRafiq, Download, SupportHub, IosInstall), Auth/*, kit/EmptyState, Profile/*, Legal/notice.jsx, pages Portal/Profile/Welcome/Chat/Login, server utils indexPage/manifest/mailer/brand/assets/mascot.svg, docker env examples, docs.

## Deviations from the prompt's assumptions
- Prompt names `MascotQanouni.jsx`; the file is `MascotRafiq.jsx` (gate-exempt for hex). Kept (internal identifier).
- Nav already has 5 hubs (not 6). No `ar.json`. Notification endpoints are `GET /law/notifications` and `POST /law/notifications/read`.
