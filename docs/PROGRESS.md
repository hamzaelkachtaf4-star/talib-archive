# PROGRESS (Qanouni spec execution)

Decisions (owner, 2026-10-12): repo conventions win (yarn/jest/`Law*` models, branch `qanouni`); brand constant = Rafiq / رفيق.
Gate: `scripts/gate.sh` (base = local tag `gate-base`, moved at each phase start). Brain: `brain/memories/corrections.json`.

| Phase | Commit | Gate | Notes |
|---|---|---|---|
| 0 Recon, gate, brain | 48b8aab, 15aa3cb | pass | RECON.md; 7 seed lessons |
| 1 Brand, design system | 99ea7d2 | pass | brand.js (web+server), `components/LawOS/kit/*`, LawThemeProvider |
| 2 IA, shell | 3139240 | pass | 5 hubs, avatar menu, legacy redirects. **Deviation:** Today page keeps its existing cards (no ActionGrid/WeekStrip rewrite); `/law/capture` stays reachable from the Library until chat attachments replaced it |
| 3 Profile/Settings/consent/portal | 21a690b, 2c60ac5 | pass | prefs+privacy API, AvatarBuilder, device-owner wipe. **Deviation:** existing 3-box consent modal kept (already versioned) rather than a new one-checkbox modal |
| 4 Onboarding | 972e26c | pass | `LawFaculty`, academic profile columns on `LawUserProfile` (not a new AcademicProfile model), resumable wizard |
| 5 FDC timetable | f10ae7c | pass | real PDFs parsed (fixtures), staging/merge/publish, CSV, subscription, overrides, offline queue |
| 6 Corpus, chat, quota | 9032e6a | pass | grounded chat (scoped retrieval + verified citations), quota, norm hierarchy, offline statute packs. **SGG was 503**: no URLs hard-coded (RECON.md) |
| 7 Social graph | 712c27a | pass | follows/blocks/suggestions/contacts(flagged)/notifications |
| 6b Phase-6 audit fixes | (with 8) | pass | strict citation scrubbing, refund-once, upload quota/caps/GC, SW q4 |
| 8 Hub | 3c37d22 | pass | revisions, change requests (ff / 3-way / conflict+rebase), co-authors, reports+auto-hide, moderation queue, DiffViewer. Section-level blame kept from Collab; revisions are lazy snapshots |

## Compliance flag (owner action)
Contact matching processes personal data under Law 09-08. It ships **disabled** (`FEATURE_CONTACT_MATCH=false`). Review CNDP declaration obligations before enabling in production; set `PHONE_HASH_PEPPER`.

## Open TODOs
- TODO(design): replace the placeholder mascot (Rafiq SVG) if a designed asset exists.
- Weekly leagues are out of scope for v1 (XP rank tiers only).
| 9 Course path | (this commit) | pass | modules from the published timetable (no invented curricula), scaffold nodes (admin-editable), unlock logic, FSRS crowns, hub pins, DOCX (RTL + embedded Amiri) export. **PDF path:** browser print page (`/law/path/modules/:id/print`); server returns 501 with the print URL since headless Chromium is not installed on the target |
| 7-8b audit fixes | (this commit) | pass | blocks cover legacy friends + Hub, atomic rate limits, no phone oracle, CR visibility, XP per note, merge claim ordering, raw block preservation, strict scrub with known slugs. **Phone verification (OTP) still missing: keep `FEATURE_CONTACT_MATCH=false` until it exists** |
| 10 Brain | a9914b9 (+ hardening in 12) | pass | learner memory (closed taxonomy, lifecycle, opt-out, export, k>=20 aggregates), drills (bank + corpus-grounded AI), chat injection (prompt v2), nudge, tutor corrections (verify -> global MODEL_ERROR + eval case), consent 1.1.0. `yarn --cwd server eval:ai` is opt-in (LAWOS_EVAL=1, costs credits). Item bank ships EMPTY on purpose: legal contrast items must be authored and reviewed by a human; concepts carry no article refs until an admin links them |
| 11 Android + download guide | (this commit; Android repo 0098b2a) | pass | Mascot icon (web icons were still the old scales: fixed here, PWA PNGs regenerated), Android adaptive + monochrome icon, cream splash, `app_name` رفيق/Rafiq, R8+shrink release build OK (APK 2.0 MB, signed, v2.1.0, SHA-256 fdcbb47d…8ebc), unused permission removed, download card with Play Protect steps + SHA-256. WebView file chooser / back handling / external links already existed. Legacy PNG mipmaps skipped (minSdk 26 = adaptive only). **Honest note for the owner:** the guide *explains* the Play Protect warning, it cannot remove it. Lasting fixes: publish on Google Play (TWA/WebView) and/or Google's developer verification: check the current requirements and rollout dates for Morocco before relying on sideloading. The release APK was not run on a device/emulator here |
| 9-10 audit fixes | (this commit) | pass | strict scrub (no 'من الكتاب' bypass), AI drills private/scrubbed/never penalize, drill reports + generation limits, prompt-block sanitizing, admin owns correction wording + eval question (no student chat in eval files), k-anonymity hardened (cohort >= 40, cells 20/20, 10% buckets, seasoned accounts), consent-gated memory, path XP only for the current semester (6/day), progress carried over when nodes are replaced, ordered offline flush, DOCX control-char safety. Migration `20261026090000_law_phase12_hardening` |
| 12 Final audit + runbook | (this commit) | pass | see below |

## Phase 12 audit results (2026-10-12)
- [x] Frontend build OK; `scripts/gate.sh` green (brand/CSS/offset/IDB/PDF/consent/prefs/createMany greps, prisma validate, brain-check, build, 600+ jest tests).
- [x] Migrations on a **copy** of the dev DB: all migrations apply, 81 existing tables keep every row, FK + integrity checks clean (note: the `facebookId` drift above).
- [x] Brain: 24 guarded entries; every guard runs inside the gate. `eval:ai` exists but needs provider keys and credits: **not run** (owner supplies keys).
- [x] Browser audit (`deploy/e2e/final-audit.cjs`, Brave via Puppeteer): 12 screens x 4 widths (360/390/768/1280) x ar/fr x light/dark = 192 loads, **0 horizontal overflows, 0 dir mismatches, 0 page errors**; 96 screenshots (390 and 1280) in `docs/screens/final/`. Onboarding was not part of the matrix (it needs an incomplete account); it was exercised by the API tests.
- [x] Old bookmarks: /law/subjects, /method, /schedule, /squad, /hub, /corpus all redirect.
- [x] IndexedDB upgrade v2 -> v4 keeps data (sentinel survives) and adds `ttQueue` + `legalTexts`.
- [x] Offline (service worker): Today, Review, Library, Timetable, Path render with the network off. The offline *write* flows (review sync, timetable override queue, path completions) are covered by unit/integration tests and the existing `deploy/e2e/review-offline.cjs`; the older e2e scripts were not re-run after the IA change (several assert text that moved).
- [x] Auth regression + isolation: covered by the jest suites (tenancy, accounts, chat/path/brain isolation, device-owner wipe).
- [~] Lighthouse (mobile, public portal): accessibility **100**, performance **77**; Lighthouse 12 has no PWA category and the authenticated Today page was not audited.
- [x] Secrets: no keys, keystores or .env files in the diff; the Android keystore is untracked.
- **Incident to know about:** while restoring my test setup, the pre-audit copy of the local dev database was lost from /tmp. `server/storage/anythingllm.db` is now the *migrated* copy (all original rows verified present before and after migrating, plus the e2e script's test data). Nothing production-related was touched.
- **Known limits (owner decisions):** phone verification (OTP) before enabling contact matching; PDF export relies on the browser print page; SGG corpus download needs the site to be reachable; admin should review the Brain taxonomy and author the drill bank; weekly leagues deferred; Android build was not run on a device.
