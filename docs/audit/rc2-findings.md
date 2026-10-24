# Qanouni v1.0.0-rc1 → rc2 audit

## Phase 0 — Baseline and stack map
- Base: `99d57e7` (tag `v1.0.0-rc1`), branch `qanouni`. Baseline `scripts/gate.sh`: **GATE PASS** (brand-string, physical-css, fixed-utc-offset, idb, prisma validate, brain-check, build, jest 54 suites).
- **Differences from the prompt:** DB is **SQLite (WAL) via Prisma 5.3**, not Postgres → quota "atomic upsert" is a Prisma conditional `updateMany` (equivalent, single-statement). Auth is **Bearer JWT**, not cookies → cookie-flag item is N/A. `origin` remote is **upstream Mintplex-Labs/anything-llm** → no push is performed (see Phase 5). Package manager: yarn (no npm lockfile).
- Stack: Express 4 + Prisma/SQLite; React 18 + Vite + Tailwind 3.4 (+ LAW-OS CSS in `lawos.css`); in-house i18n `tr()` (ar/fr/en/ary JSON in `frontend/src/locales/qanouni`); Markdown = `markdown-it` + DOMPurify; tests = root Jest (node env) + browser e2e scripts in `deploy/e2e/*.cjs` (Playwright). Tests run under `npx -y node@24`.

## Phase 1 — Security & data integrity
| # | Where | Finding | Sev | Status |
|---|---|---|---|---|
| 1.1a | `utils/law/aiQuota.js` | Quota reserve is a single conditional `updateMany(count < limit)` on composite PK `(userId, day)`, day via `Africa/Casablanca`, refund on provider failure, user id from session | — | verified OK (added 50-way concurrency test: exactly 10 win) |
| 1.1b | AI routes | No per-user in-flight cap, no per-IP limit on any AI route | high | **fixed** `utils/law/aiGuard.js` (2 in-flight, 60/min/IP) on chat send/attach, case submit/model-answer, dissertation critique, drill answer, brain drill/corrections, squad synthesize. `aiGuard.test.js` |
| 1.1c | `lawMethod` AI calls (critique, model answer, drill judge, dissertation critique) | Not counted by the daily chat quota (only by global AI budget + job caps) | medium | deferred: product decision whether case practice shares the chat allowance; now bounded by 1.1b |
| 1.2a | `LawHub.profile` (`GET /law/students/:id`) | Any viewer got XP/streak/level/TD group/notes/badges of a **private** account that had `publicProfile` on; blocks and follow status ignored | high | **fixed** `utils/law/privacy.js#canViewProfile` (FULL/PUBLIC_CARD/NONE), allowlist `publicCard`, same 404 for blocked/not-opted-in. Test in `qanouniHub.integration.test.js` (red first) |
| 1.2b | `LawSocial.find/friends/suggestions/contacts` | Return `card()` = name, handle, avatar, isPrivate only; blocked filtered; discoverable required (except exact friend code) | — | verified OK |
| 1.2c | Squad member list | Shows XP/streak to squad-mates (membership is the consent) | low | verified OK (by design) |
| 1.3 | `LawSocial.phoneHash` | HMAC already; env was `PHONE_HASH_PEPPER` ≥16, no boot check | medium | **fixed** `utils/law/phoneKey.js`: `PHONE_HASH_KEY` ≥32 (legacy name read), server refuses to start if `FEATURE_CONTACT_MATCH=true` without it; rotation in `docs/security.md`. No raw-number logging found (grep). Rate limit 3/day, 500/batch already present |
| 1.4a | `MasterNoteView` Markdown | html:false + DOMPurify OK; but no link-scheme allowlist nor `rel` | medium | **fixed** `lib/mdPolicy.js` + `mdPolicy.test.js` (javascript:/data:/vbscript:/file: never become links; `rel=noopener noreferrer nofollow`) |
| 1.4b | `dangerouslySetInnerHTML` | one use, sanitized | — | verified OK |
| 1.4c | `hubMerge.js` | Text block merge (diff of paragraphs), no JSON/object merge → prototype pollution not applicable | — | verified OK |
| 1.4d | Chat attachments | MIME allowlist + 10 MB cap server-side, 20 uploads/day, filenames not interpolated | — | verified OK |
| 1.4e | Prompt injection | Student material was inlined with a one-line "study material" rule | medium | fixed in Phase 2 (prompt v3 with delimited data blocks) |
| 1.4f | CSP | none | medium | **fixed** index page CSP (`script-src 'self' 'sha256-…'`, no unsafe-inline) + nosniff + referrer policy; `brand.test.js` |
| 1.5a | `radar/politeFetch.js` | `fetch(url, redirect:"follow")`, no host allowlist, no size cap (URLs come from scraped pages/DB) | high | **fixed** `utils/law/safeFetch.js` (exact-host allowlist, DNS+private-range check at connect time, per-hop redirect re-validation, 10 s, size cap). `safeFetch.test.js`: 127.0.0.1, 169.254.169.254, `sgg.gov.ma.evil.com`, redirect to localhost, `http://2130706433` |
| 1.5b | `timetable/fetchSources.js` | same-origin + redirect:error already; no host allowlist/private check | medium | **fixed** now via `safeFetch` (`www.fdc.ma` + `FDC_ALLOWED_HOSTS`) |
| 1.6a | Routes without `auth` | only public auth endpoints, signed-URL asset stream, squad-guarded routes | — | verified OK |
| 1.6b | CORS `origin:true` | reflects any origin; auth is Bearer (no ambient credentials) so not exploitable cross-site | low | deferred (upstream `server/index.js` touchpoint) |
| 1.6c | Cookies | none used | — | N/A |
| 1.6d | `yarn audit` (prod deps) | server: 9 critical / 166 high; frontend: 1 critical / 11 high — nearly all upstream AnythingLLM agent/LLM deps (expr-eval, protobufjs, fast-xml-parser, proxy-addr…) | high | deferred: bumping upstream deps breaks fork mergeability; LAW-OS routes don't reach the agent stack. Track in a dedicated upgrade |
| 1.6e | Secrets in history | only `.env.example` placeholders | — | verified OK |

## Phase 2 — Legal reasoning rigor
| # | Where | Finding | Sev | Status |
|---|---|---|---|---|
| 2.1a | `chatCitations.scrub` + `grounding.retrieveEvidence` | Retrieval is from the local corpus, scoped to the student's selected codes; the only accepted form is `[CODE:n]` present in this turn's evidence; bare mentions (Arabic/French/abbreviated, Arabic-Indic digits) are stripped and the answer carries an "unverified" banner; nothing retrieved ⇒ canned answer, no model call | — | verified OK |
| 2.1b | `scrub` | A bracketed id with a non-corpus code (`[FRCC:1134]`) was left in the text | medium | **fixed** step 1b strips and reports any bracketed `[CODE:n]` not in evidence |
| 2.1c | Prompt `legal_tutor.v2` | No rule on French/foreign law, no explicit data fence for attachments/notes (prompt injection), no "corpus empty" behaviour | medium | **fixed** `legal_tutor.v3.md` (rules 13–15): `<student_material>` fence (tags stripped from user content), French law only as «القانون المقارن», explicit "nothing in references" statement. v2 kept |
| 2.1d | Verified citations → link | `citations[]` returns `canonicalId` per verified id; UI resolves to corpus entry | — | verified OK |
| 2.2 | Branch rules | Commercial/criminal/admin hints lived inline in one prompt (commercial correctly cites Art. 2 of the Code de Commerce, not the DOC); family law missing | medium | **fixed** `utils/law/legal/branches/{commercial,criminal,administrative,family}.js` (versioned, chosen by `LawCode.domain` of the scoped codes, injected as `<branch_rules>`). Family adds Moudawana Art. 400/Maliki. `branches.test.js` + chat integration test |
| 2.3 | `LawBrain` / `LawLearnerMemory` | Closed concept-pair taxonomy (dedupe by pair, evidence rows, status SUSPECTED→ACTIVE→IMPROVING→RESOLVED, 30-day decay, DISMISSED cooldown), classifier only on chat turns with confidence gate and daily budget, student can list/dismiss/delete/export/reset. Active entries are naturally bounded by the closed taxonomy | — | verified OK (`brainMemory.test.js` covers lifecycle/dedupe/resolve) |
| 2.T | Tests | Added `chatCitations.test.js`: 20 fabricated-citation cases across civil/commercial/criminal/administrative/family (invalid article, unknown code, French article presented as Moroccan, abbreviations, Arabic-Indic digits) | — | added (a 20-per-branch live-model golden set would need real model calls; the deterministic validator is what is tested) |

## Phase 3 — Visual maturity
Screenshots (roadmap, module path, review, profile, Hub, chat, today, settings; ar/fr, light/dark, 390/1280) taken with `deploy/e2e/rc2-shots.cjs` before and after: `docs/audit/screens/before/` and `docs/audit/screens/after/` (0 CSP violations, 0 page errors in both runs).

| # | Where | Finding | Sev | Status |
|---|---|---|---|---|
| 3.1a | Tokens | Palette lived in `lawos.css`, plus extra hard-coded flame/xp/sky/edge colours | medium | **fixed** `frontend/src/styles/tokens.css` is the single source (paper/midnight palette from the brief, `--law-gold` for fills + `--law-gold-ink` for text, radii 6–10 px, 180 ms ease-out, type scale, tabular numerals, Arabic line-height 1.75). All text pairs ≥ 4.5:1 (checked with a script: gold used only for non-text ≥ 3:1) |
| 3.1b | Hex in components | 93 hard-coded colours (flame orange, red, per-kind pill colours…) | medium | **fixed** → tokens. Documented exceptions: avatar art/palette, mascot SVG, Google/Facebook brand buttons, user-chosen subject colours, print view. New gate section `ui-hex` |
| 3.1c | 3D buttons/cards, bounce/shake/confetti/float animations, portal gradients | juvenile | high (brief) | **fixed** flat 1 px controls (class names `law-btn3d/law-card3d` kept so call sites don't change), all portal keyframes removed except a 180 ms fade, confetti removed, portal restyled on tokens (follows the theme instead of forcing light) |
| 3.1d | Emoji in UI chrome | 20 hits (🔥 🎉 📖 ⚡ 📱 🔒 🔄 ✓…) | low | **fixed** Phosphor icons / plain text; ✓ ticks kept only inside user-answer feedback. Gate `game-terms` |
| 3.1e | Mascot | on path, quiz result, download steps, support, hero | low | **fixed** now only onboarding (`Welcome`), `EmptyState`, portal logo and the chat empty state |
| 3.1f | Typography | Plex Sans Arabic already bundled (`LawOS Arabic`) | — | verified OK (Latin falls back to Inter/system) |
| 3.2 | Roadmap | zig-zag bubble nodes, mascot, flat 3-section scaffold | high (brief) | **fixed** seal nodes (octagon outline, engraved index, gold fill only when completed) on a vertical rail; hierarchy is **data-driven** with no migration: a node's `section` may be a path `قسم › فصل › مبحث › مطلب › فقرة` (separator ` › `), grouped by `lib/pathGroups.js#groupNodes` (unit-tested to 5 levels) with a `done/total` fraction and hairline bar per level. Scaffold titles reworded; titles already stored in DBs are displayed with the new wording via a small legacy map (no data migration) |
| 3.3 | Terminology | BOSS / Crowns / Checkpoint / XP / Streak / Level up | medium | **fixed** display strings only (DB `kind` values and API fields `xp/streak/crowns` unchanged): النازلة الكبرى → *محاكاة الامتحان النهائي*, تيجان → *مستوى التمكن الأكاديمي* (3 hairline segments), محطة → *محطة تقييمية*, XP → *نقاط التحصيل* / «نقطة», سلسلة → *المواظبة*; fr/en/ary dictionaries re-keyed together (`i18n.test.js` green). Server notifications/push/recap copy contained no game words (verified by grep) |
| 3.T | Tests | `pathGroups.test.js`, gate sections `ui-hex` + `game-terms` | — | added |
