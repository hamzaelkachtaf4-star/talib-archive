# Upstream touchpoints

Every edit to an AnythingLLM-owned file. Keep each one small and marked `// LAW-OS` so merges stay easy.
Everything else lives in LAW-OS namespaces:
- `server/endpoints/law/`
- `server/models/law*.js`
- `server/utils/law/`
- `frontend/src/{components,pages}/LawOS/`
- `frontend/src/models/law.js`
- `frontend/public/lawos*`
- `docker/lawos.*`
- `deploy/`

| File | Phase | Change | Why |
|---|---|---|---|
| `server/index.js` | 0 | Require and register `lawEndpoints(apiRouter)`; call `bootLawOS()` | Mount `/api/law/*`. Boot runs WAL pragmas, storage dirs and the FTS index, and never throws |
| `server/index.js` | 0 | In production, when `LAWOS_HIDE_UPSTREAM` is on, `app.get("/manifest.json", serveLawManifest)` before `express.static` | Arabic PWA manifest without editing `MetaGenerator` or the upstream HTML |
| `server/prisma/schema.prisma` | 0 | Appended `LawSetting`, `LawDevice`, `LawAiCall` | Namespaced models (spec §5). Upstream models untouched |
| `server/prisma/migrations/20261010120000_law_phase0/` | 0 | New additive migration | Spec §12 |
| `server/prisma/schema.prisma` | 1 | Appended `LawSubject`, `LawTimetableSlot`, `LawClassSession`, `LawFlashcard`, `LawReviewLog`, `LawStudyDay`, `LawStreak` (append-only; `prisma format` output for upstream models deliberately not kept) | Spec §5.1, §5.5 |
| `server/prisma/migrations/20261010150000_law_phase1_review/` | 1 | New additive migration | |
| `server/package.json`, `frontend/package.json` (+ lockfiles) | 1 | `ts-fsrs@5.4.2` (exact) | FSRS (spec §8.1) |
| `server/prisma/schema.prisma` | 2 | Appended `LawAsset`, `LawCaptureBatch`, `LawUpload`, `LawJob`, `LawDerivative` | Spec §5.2 |
| `server/prisma/migrations/20261010180000_law_phase2_capture/` | 2 | New additive migration | |
| `server/package.json` (+ lockfile) | 2 | `pdf-parse@1.1.1` (exact; same version the collector uses) | Page-level PDF text layer |
| `server/prisma/schema.prisma` + migration `20261011090000_law_phase4_notes` | 4 | Appended `LawNoteAtom` | Spec §5.3 |
| `server/prisma/schema.prisma` + migration `20261011120000_law_phase5_method` | 5 | Appended `LawCaseExercise`, `LawCaseAttempt`, `LawDissertation` | Spec §5.6 |
| `server/prisma/schema.prisma` + migration `20261011150000_law_phase6_radar` | 6 | Appended `LawReformEvent`, `LawWeeklyRecap`, `LawPushSubscription` | Spec §5.4, §5.7 |
| (read only) `server/storage/push-notifications/vapid-keys.json` | 6 | LAW-OS reuses upstream's generated VAPID keys when `VAPID_*` env vars are unset | No new key management |
| `server/.gitignore` | 0 | Ignore `storage/law`, `*.db-wal`, `*.db-shm` | LAW-OS data and SQLite WAL side files |
| `frontend/src/main.jsx` | 0 | Import `lawRoute`/`lawosOwnsHome`; add `lawRoute` to the router; `/` redirects to `/law/today` unless `VITE_LAWOS_HIDE_UPSTREAM=false` | Single route-table touchpoint |
| `docker/Dockerfile` | 0 | Node 18 → **Node 24 LTS** (nodesource `node_24.x` ×2, `node:24-slim` frontend stage) | Node 18 is EOL; built-in `node:sqlite` for the FTS index (DECISIONS D-004) |
| `.nvmrc` | 0 | `v18.18.0` → `v24` | Matches the Dockerfile |
| `.dockerignore` | 0 | Ignore `**/server/storage/law/**` | Keep local LAW-OS data out of the image |
| `.gitignore` | 0 | Ignore `docker/lawos.env` | Deploy secrets |
| `server/prisma/schema.prisma` (`model users`) | Q | Back-relation fields for `LawUserProfile` and every user-owned `Law*` model (additive lines only) | Prisma needs both sides of a relation; owned LAW-OS rows cascade when an upstream user is deleted |
| `users` table (data, migration `law_qanouni_tenancy`) | Q | Inserts one admin `qanouni-owner` with an unusable password if no admin exists | Owner of pre-existing LAW-OS rows; `/law/setup` gives it real credentials |
| `system_settings.multi_user_mode` (data) | Q | Set to `true` by `/api/law/auth/setup` | Upstream's own multi-user switch, so upstream auth (`validatedRequest`, JWT) applies unchanged |
| `server/index.js` | Q | Serve `utils/law/indexPage.js` (Qanouni title, meta, icons) before upstream's MetaGenerator catch-all when `LAWOS_HIDE_UPSTREAM` is on | Branding without editing MetaGenerator |
| `frontend/index.html`, `frontend/public/manifest.json` | Q | Qanouni title, meta, icons (dev server only; production uses the two server routes) | Same branding in `yarn dev` |
| `frontend/src/main.jsx` | Q | Spread `lawAuthRoutes`; upstream `/login` redirects to `/law/login` when LAW-OS owns home | One sign-in screen for everyone; same JWT for upstream pages |
| `frontend/src/models/system.js`, `frontend/src/AuthContext.jsx` | Q | `refreshUser()` marks network failures `offline`; AuthContext keeps the session instead of logging out | Upstream logged users out on every offline cold start in multi-user mode, which broke the offline PWA |
| `server/index.js` | RC2 | `require("./utils/law/phoneKey").assertPhoneKeyConfigured()` just before `bootLawOS()` | Refuse to start when contact matching is enabled without a >=32-char `PHONE_HASH_KEY` |
| `server/index.js` | Q (perf) | `compression()` via `utils/law/compressionMiddleware.js` (skips SSE); `utils/law/staticAssets.js` serves pre-built `.br`/`.gz` and sets `immutable` caching on hashed `/assets/*`, `no-cache` on `index.js` | 3.5 MB uncompressed entry bundle made the app slow on phones and the dv6 |
| `frontend/vite.config.js` | Q (perf) | `manualChunks` (vendor-react, vendor-ui, vendor-math) and a plugin writing `.br`/`.gz` next to every asset | Long-cached vendor chunks; zero compression CPU on the server |
| `frontend/src/locales/resources.js`, `frontend/src/i18n.js`, `frontend/src/locales/*.mjs` | Q (perf) | Upstream dictionaries became lazy per-language chunks (i18next backend); tooling uses `loadResources()` | ~3 MB of upstream locales were in the entry bundle |
| `frontend/src/main.jsx` | Q (perf) | Upstream `Login` and `OnboardingFlow` routes are `lazy` | Kept the LLM settings pages out of the entry bundle |
| `frontend/src/utils/keyboardShortcuts.js` | Q (perf) | `TOGGLE_LLM_SELECTOR_EVENT` inlined instead of imported | That import dragged every LLM settings page into the entry bundle |
| `server/prisma/schema.prisma` (`model users`) | Q | Back-relations `law_friends_requested` / `law_friends_received` for `LawFriendship` | Friendships cascade with the user |
| `server/prisma/schema.prisma` (`model users`) | Q (Collab) | Back-relations `law_consent` (`LawUserConsent`) and `law_squad_membership` (`LawSquadMember`) | Consent and squad membership cascade with the user |
| `server/prisma/schema.prisma` (`model users`) | RC3 P7 | Back-relations `law_campus_posts`, `law_campus_reports` | Campus posts and reports cascade with the user (squad documents deliberately keep plain author ids, like master notes) |
| `server/prisma/schema.prisma` (`model users`) | Q (Hub) | Back-relation `law_endorsements` (`LawEndorsement`) | Endorsements cascade with the user |
| `server/prisma/schema.prisma` (`model users`) | Q (Referrals) | Back-relations `law_referrals_made`, `law_referred_by` (`LawReferral`) and `law_session_sources` (`LawSessionSource`) | Referrals and session sources cascade with the user |

**Not edited on purpose:**
- `docker/docker-compose.yml`: LAW-OS uses `docker/lawos.compose.yml`.
- `MetaGenerator.js` and `frontend/index.html`: the manifest is overridden by route, and `dir`/`lang` are set
  at runtime by the LAW-OS layout.
- `PrivateRoute`: LAW-OS has its own offline-tolerant `LawRoute`.
- Upstream's `/service-workers/push-notifications.js` keeps its narrower scope. It gets merged into
  `lawos-sw.js` in Phase 6.
- `server/index.js`: `app.set("trust proxy", "loopback, linklocal, uniquelocal")` so per-IP rate limits see real
  clients behind Tailscale Serve/Docker; plus a `SlowBuffer` polyfill so upstream deps load on Node 26 (Node 24
  is still the supported runtime).
- `frontend/src/main.jsx`: `/` renders the LAW-OS Portal (signed-out visitors only; a stored session redirects
  to `/law/today`).

- Phase 3: `server/prisma/schema.prisma` `users.law_preferences LawUserPreferences?` (back-relation only).
- Phase 4: `users`-side none; new `LawFaculty` table; LawUserProfile gains onboarding/academic columns (additive migration 20261019090000; backfills onboardingCompletedAt for existing students).
- Phase 5: new tables LawTimetableSource/LawFdcSession/LawTimetableSubscription/LawTimetableOverride (+ back-relations on `users`: law_tt_subscription, law_tt_overrides). IndexedDB v3 adds `ttQueue`.
- Phase 7: new tables LawFollow/LawBlock/LawPhoneHash/LawNotification (+ back-relations on `users`). LawProgress friend flow mirrors into LawFollow.
- Phase 8: LawMasterNote gains headRevisionId/moderationStatus/hiddenReason/appealedAt; new LawNoteRevision/LawChangeRequest/LawNoteCoAuthor/LawNoteReport. LawProgress XP counts merged change requests.
- Phase 9: new tables LawCourseModule/LawPathNode/LawNodeProgress/LawPathPin (+ users back-relations). Amiri font (SIL OFL) vendored under server/utils/law/assets/fonts for DOCX export.
- Phase 10: new tables LawConcept/LawConfusionPair/LawDrillItem/LawLearnerMemory/LawLearnerEvidence/LawConceptMastery/LawAiCorrection/LawRateCounter; users back-relations (law_learner_memories, law_concept_mastery, law_blocks_*, law_note_reports, law_change_requests, law_coauthored, law_chat_attachments).
| `server/prisma/schema.prisma` (`model users`) | RC3 P2 | Back-relation `law_todos` (`LawTodo`) | Todos cascade with the user |
| `server/prisma/schema.prisma` (`model users`) | RC3 P3 | Back-relations `law_owned_modules`, `law_curriculum_seeds`, `law_module_profiles`, `law_professor_cards`, `law_lecture_sources`, `law_module_nodes`, `law_module_proposals` | Per-student module data cascades with the user |
