# RECON — Phase 0 (2026-10-12)

Decisions (owner, 2026-10-12): **repo conventions win over the spec** (yarn, jest, `Law*` Prisma prefix, LAW-OS namespaces, stay on branch `qanouni`); brand constant = **Rafiq / رفيق**. Spec path → real path mapping below.

## Reality vs spec assumptions
| Spec assumes | Reality |
|---|---|
| `server/src/...`, `frontend/src/pages/...` | AnythingLLM fork: `server/endpoints/law/*.js`, `server/models/law*.js`, `server/utils/law/**`, `frontend/src/components/LawOS/**`, `frontend/src/pages/LawOS/**` |
| npm + vitest + supertest | yarn workspaces-ish (`yarn --cwd`), **jest at repo root** (`server/__tests__/{law,utils/law,models}`), Node 24 via `npx -y node@24` |
| Prisma ≥ 6.2 | **Prisma 5.3.1**, SQLite only (hard-coded `server/storage/anythingllm.db`). No enums/Json → `String` + validation. Never `prisma format`. |
| `User` model with role | Upstream `users` (bcrypt, `role` = admin/default/manager, `suspended`). LAW accounts in `server/models/lawAccount.js`, per-user isolation via Prisma extension `server/utils/law/tenant.js` |
| Branch `feat/qanouni-v1` | Stay on `qanouni` (unmerged to master; ask before merging) |
| `law-os-android/` in repo | Separate repo `/Users/tayeb/Documents/law-os-android` (applicationId `com.tayeb.lawos`, minSdk 26, targetSdk 35, hardened WebView, keystore in `keystore/` git-ignored) |
| Many things to build | Much exists already — see below. Phases must **extend**, not duplicate. |

## Frontend
- Router: `frontend/src/pages/LawOS/routes.jsx` (lazy; spread into upstream router in `main.jsx`). `/law` children: today, subjects, subjects/:id, capture, method, method/attempt/:id, method/dissertation/:id, review, settings, schedule, profile, qr/:token, legal, squad, squad/w/:id, squad/w/:workspaceId/new, squad/notes/:id, hub, hub/notes/:id, u/:userId, recap, corpus, corpus/a/:canonicalId, corpus/import/:id. Public: /portal, /law/portal, /law/login, /law/register, /law/setup, /law/forgot. Layout `pages/LawOS/index.jsx`; shell `components/LawOS/Shell`.
- i18n: **custom** `components/LawOS/lib/i18n.js` (`tr()`, lazy per-locale dict, `i18nReady`), dictionaries `frontend/src/locales/qanouni/{ary,fr,en}.json` (Arabic is the built-in fallback, no ar.json). No i18next in LAW code (i18next exists for upstream only). 4 languages already match spec.
- Theme: tailwind `darkMode: "class"`; LAW CSS in `components/LawOS/lawos.css`, `pages/LawOS/portal.css`. Tailwind 3.3, no framer-motion/zod/luxon in frontend.
- IndexedDB: raw wrapper `lib/idb.js`, DB `lawos` **v2**, stores cards/reviewQueue/meta/captures/batches. `public/lawos-upload-engine.js` opens the same DB and must carry identical `upgrade()`.
- Service worker: hand-written `public/lawos-sw.js`, `VERSION = "lawos-q1"` (bump on asset change); `lib/serviceWorker.js`; `public/manifest.json` (+ server `utils/law/manifest.js`).
- Components present: Portal (Hero, SupportHub, `MascotRafiq.jsx`), Today, Review (FSRS `lib/fsrs.js`), Capture, Corpus, Method, Notes, Schedule, Profile (XP/friends/QR), Squad, Hub (master notes), Settings, Legal notice, Inbox.

## Server
- Endpoints `server/endpoints/law/`: academic, auth, capture, cards, collab, corpus, helpers, hub, inbox, index, method, notes, profile, qr, radar, system. Helpers/services in `server/utils/law/` (ai/{gemini,deepseek,router}, corpusParser, corpusSearch(fts), timetableParse, scheduler, push, mailer, googleAuth, facebookAuth, writeLock, time, streak, synthesis…).
- AI: **Gemini Flash (multimodal/OCR/audio) + DeepSeek (legal logic)** via `utils/law/ai/router.js`; usage logged in `LawAiCall`. No `LLM_API_KEY` env as in spec.
- Prisma Law models, 43 in total (migrations through `20261017090000_law_social_facebook`): LawSubject, LawTimetableSlot, LawClassSession, LawFlashcard, LawReviewLog, LawStudyDay, LawStreak, LawAsset/Upload/Job/Derivative, LawCode/LawArticle/LawArticleVersion/LawCorpusImport, LawDecision, LawDoctrineRef, LawLink, LawNoteAtom, LawCaseExercise/Attempt, LawDissertation, LawReformEvent, LawWeeklyRecap, LawPushSubscription, LawUserProfile, LawEmailCode, LawQrLogin, LawFriendship, LawUserConsent, LawSquad(+Member/Card), LawModuleWorkspace, LawMasterNote, LawEndorsement, LawReferral, LawSessionSource, plus LawSetting, LawDevice, LawCaptureBatch, LawSourceDocument.
- Spec models to map onto existing ones (not duplicate): Follow→LawFriendship; ConsentRecord→LawUserConsent; Hub*→LawModuleWorkspace/LawMasterNote/LawEndorsement; LegalText/LegalArticle→LawCode/LawArticle(+Version); TimetableSession→LawTimetableSlot; UserPreferences/AcademicProfile→LawUserProfile (extend); ChatThread/Message/Attachment, AiUsage/quota, Concept/Confusion/Learner*/AiCorrection are **new** (`Law`-prefixed).

## Legacy brand occurrences
~177–201 hits (count varies with the exact path set; command: `grep -rniE 'rafiq|رفيق|law-os|lawos/icons' frontend/src server/utils/law server/endpoints server/models`) across frontend/src + server law code (top: `utils/law/mailer.js` 15, locales fr/en 13 each, `indexPage.js` 6, `manifest.js` 4, Portal.jsx 4, `MascotRafiq.jsx`). Phase 1 centralizes into `frontend/src/config/brand.js` + `server/utils/law/brand.js`. `/lawos/icons/*` paths are a runtime URL namespace (keep) — grep gate only flags *new* literals.

## Baseline (node@24, 2026-10-12)
- `VITE_API_BASE=/api yarn --cwd frontend build`: **PASS**, ~38 s.
- Jest (law + utils/law + models): 37 suites, **423 pass / 1 fail / 1 skip** at first run. The failure (`radar.integration.test.js:204`) was a real bug, not Monday-only: the `weekly_recap` job ignored `payload.weekStart` and used the wall clock. Fixed in `server/utils/law/jobs/radar.js`; Brain L-0007.
- Android `assembleDebug`: **not run** (separate repo; run in Phase 11).
- Server `/api/health`-style smoke test already covered by existing integration tests (no vitest added).

## Phase-0 deliverables
`docs/RECON.md`, `scripts/gate.sh` (`--quick` skips build+jest), `scripts/brain-check.mjs` (+`--render`), `brain/memories/corrections.json` (7 seeds, all guarded), `brain/memories/deploy-pitfalls.md`, CLAUDE.md pointer. The full spec text is **not** saved in the repo (pasted in chat); commit it as `docs/QANOUNI_SPEC.md` when convenient.

**Gate base:** `scripts/gate.sh` measures new/changed lines against local tag `gate-base` (= 8a546c2, before Phase 0). Move it with `git tag -f gate-base <ref>` at each phase start, or set `GATE_BASE`.

## FDC (Phase 5 reality check, 2026-10-12)
- Index: `https://www.fdc.ma/FDC/emploiFDC/emplois_temps.php?type=automne|printemps` (HTTP 200, same page for both: it links PDFs under `Emp/2026-2027/Automne26/`; no Printemps PDFs published yet).
- 25 Automne PDFs: S1/S3/S5 × {Droit privé, Droit public} × {arabe, français}, plus Économie, Gestion, Business Administration, Analyste juriste et fiscal (S5), Langue française (S3), Anglais (S5), Méthodologie du travail universitaire (S1). We keep the law filières by allowlist (`DROIT PRIVE|PUBLIC`).
- PDFs are **text-based** (pdf-parse works, no OCR). One table row per line, columns concatenated without separators: `SEMESTRE 3 TC DROIT PRIVE ARABE` + subject + PROFESSOR + `G01` + DAY + `11H-13H15` + room. Slots: 08H30-10H45, 11H-13H15, 13H30-15H45, 16H-18H15 (end minutes 00/15/30/45; the digits after them are the room). Arabic uses Persian yeh/heh forms (normalized to standard Arabic). S5 has parcours variants (CARR JURID, DRT AFF) in one file; some rows have the filière label and the content on different lines.
- Not parseable: `Méthodologie du travail universitaire` (different template, garbled encoding) -> CSV import. The S5 Droit privé fixture contains no G02 rows for the DRT AFF parcours (absent from the PDF text itself).
- Fixtures: `server/__tests__/fixtures/fdc/*.pdf` + `index-automne.html`. Fetching happens only through the admin route / opt-in weekly job (`FDC_AUTOFETCH=true`), with an identifying User-Agent and sha256 de-duplication.

## SGG corpus ingestion (Phase 6 reality check, 2026-10-12)
- `https://www.sgg.gov.ma/` returned **HTTP 503 (Service Unavailable)** on every attempt today, and `sgg.gov.ma` (no www) does not resolve. No official PDF URLs could be verified, so **none are hard-coded** (spec: do not invent URLs). `LawCode.sourceUrl` stays empty until an admin records the official link.
- The code registry (`models/lawCorpus.js`) now has shells for the Constitution, the three territorial-collectivity organic laws (111.14, 112.14, 113.14), the Code de procédure pénale (22.01) and the administrative courts law (41.90); articles arrive through the existing admin import (paste/upload the official text -> parse -> review -> commit), flagged `reviewed=false` until checked. Pre-seeded codes (DOC, CP, CPC, Moudawana, CT, CCOM) keep `reviewed=true`.
- Search stays on SQLite FTS5 (`law_fts_*`); there is no PostgreSQL path in this deployment, so the spec's search-repo interface is not built (Prisma is SQLite-only here).
- Not built in Phase 6 (documented deviation): DOCX/PDF text download endpoint, hub-document scope in the chat (hub docs live in the Collab tables; Phase 8 adds them), automatic SGG download.
