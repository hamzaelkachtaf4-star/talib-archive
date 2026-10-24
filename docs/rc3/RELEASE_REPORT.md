# RC3 release report

Branch `qanouni`, from `gate-base` (the tag before RC3) to the commit that carries this file. Product name: **Talib / طالب**.
Internal identifiers (`qanouni_*` storage keys, `QanouniNative`, `MascotRafiq`, `/downloads/rafiq.apk`) are unchanged on purpose
(DECISIONS #2): renaming them would break installed apps, saved sessions and the Android bridge.

## Gate certification

| Check | Result |
| --- | --- |
| `bash scripts/gate.sh` (brand-string, physical-css, fixed-utc-offset, idb-destructive-upgrade, device-owner-wipe, prefs-snapshot-push, onboarding-server-authoritative, no-createmany, pdf-no-arabic-shaping, ui-hex, game-terms, arrow-glyph, offsite-backup, entrypoint-collector, prisma-validate, brain-check, frontend build, jest) | **PASS** on the final tree |
| Jest (LAW-OS: `server/__tests__/law`, `utils/law`, `models`) | 94 suites, 1,320 tests passed, 1 skipped (the 90-minute ffmpeg test, needs `LAWOS_TEST_FFMPEG`) |
| `e2e-a11y` | **SKIPPED** by the gate (needs a running server, Puppeteer and Chrome). Not run in this environment. |
| `prisma validate` | valid |
| Schema drift (`prisma migrate diff --from-migrations … --to-schema-datamodel`) | none ("empty migration") |

The gate was never edited. No gate rule, allowlist, jest configuration or existing test was weakened. `## Blocked` in `PROGRESS.md` is empty.

## Migrations verified on a pre-RC3 database

Method (`scratchpad/migverify`, reproducible): build a database from the 62 migrations at `gate-base`; seed **every one of its 106 tables**
(318 rows, foreign-key consistent); apply the 10 newer migrations in order; compare.

* 62 migrations at `gate-base` plus 10 newer ones: 2 from the pre-RC3 working tree committed as `1792043` (`law_course_engine`, `law_knowledge_gaps`) and 8 `rc3_*`.
* `PRAGMA integrity_check` = ok; `PRAGMA foreign_key_check` = 0 violations.
* **Every row of every pre-existing table is preserved, column by column** (including `LawCourseModule`, which Prisma rebuilds as a `RedefineTables`: rows and foreign keys survive).
* 18 new tables. No existing migration file was modified (`git diff --name-status gate-base -- server/prisma/migrations` shows only additions).
* A permanent test (`rc3Release.test.js`) keeps RC3 migrations additive: no `DROP COLUMN`/`RENAME COLUMN`; `DROP TABLE` only after the rows were copied into `new_X`; the only `DELETE` is the de-duplication of a table RC3 itself created (`LawLectureSource`).
* Order note: `…104090000_rc3_p5_timetable` sorts before `…104100000_rc3_p4_review_fixes`. They touch different tables, so the order is harmless; migrations are never renamed once written.
* The Phase 7 migration was regenerated (removing the `users` cascade from squad documents) **before it was ever applied anywhere**.

## IndexedDB

Database `lawos`, version 5. Upgrades only add stores (`todos` in v5). Tested: v4 → v5 (`rc3Today.test.js`), v1 → v5 (`rc3Release.test.js`), identical schema in the upload engine (`public/lawos-upload-engine.js`), `wipeAll` empties the new store. The `idb-destructive-upgrade` gate check passes.

## Dependency audit (`yarn audit --groups dependencies`)

RC3 added **no production dependency** (`jsdom` and `fake-indexeddb` are root devDependencies used by tests only).

| Package | Critical | High | Moderate | Low |
| --- | --- | --- | --- | --- |
| `server` | 9 | 166 | 153 | 31 |
| `frontend` | 1 | 11 | 46 | 6 |

All of these are transitive dependencies of the upstream AnythingLLM fork (for example `protobufjs` via `@zilliz/milvus2-sdk-node` and `@xenova/transformers`, `fast-xml-parser` via `@langchain/anthropic`, `expr-eval` via `langchain`, `proxy-addr` via `@modelcontextprotocol/sdk`). They were not introduced by RC3. Upgrading them means touching upstream lockfiles and is outside RC3's mergeability rule; it is listed under follow-ups.

## Greps

* Brand: `رفيق` appears only in `scripts/gate.sh` (the check itself) and `brand.parity.test.js` (asserting it is absent from `index.html`). Product name literals live in `config/brand.js` / `server/utils/law/brand.js` / locales.
* Logical CSS, hard-coded colours, arrow glyphs, fixed UTC offsets, `createMany`: enforced by the gate on every added line; all pass. Hex colours in the avatar folder are confined to `avatarPalette.js` and `avatarConfig.js` (a test checks the art and studio components contain none).

## What RC3 delivered

| Phase | Result |
| --- | --- |
| −1 | Reconnaissance (`RECON.md`), baseline gate |
| 0 | Talib brand from one config, transparent logo mark, `MascotSlot` |
| 1 | Six-hub navigation with legacy redirects, notification popover, device-aware QR handshake, bottom bar |
| 2 | Today dashboard with an offline-first to-do hub (`LawTodo`, IDB `todos`, `/law/todos/sync`) |
| 3 | Semester-aware own modules, module workspace (four views over one tree), professor card, lecture sources, grounded mentor |
| 4 | Exam Center: confirm-before-count exam dates, grounded drills, readiness radar, format matcher |
| 5 | Timetable hub: ICS/CSV/photo/text importers with review, richer sessions, desktop grid, evening and N-minutes reminders |
| 6 | Legal library: names-only catalog (three categories), source-verified ingestion (sha256, https source, as-of date, staged for review) |
| 7 | Friend codes `XXXX-XXXX` with WhatsApp sharing, faculty campus wall with report/hide moderation, squad roles, work-only squad documents, inline change-request review with stale-base detection |
| 8 | Legal avatar studio: five Moroccan legal sets, tabs, light and dark preview, randomize, undo |
| 9 | Positioning rewrite, inflated claims removed, mascot empty states, responsive and bidi guards, complete fr/en locales |

Every phase except 0 and 1 was reviewed by the `critic` agent before being declared done; every review returned findings and all blockers and majors were fixed
(see `DECISIONS.md` 14–33 and the `fix(...)` commits).

## Legal-integrity position

* No statute text, article number or official URL was written from memory. The corpus catalog holds titles only (`pending_source`); a text becomes available only by ingesting a file with its published URL, consolidation date and sha256; it then stays flagged "under review" until a person reviews it.
* Exam dates and timetable rows extracted from images or files are candidates until the student confirms them.
* AI output is labelled, cites the student's own sources, and is refunded/discarded when nothing grounded survives.
* No new tracker, no credential scraping (the FDC adapter is an interface that refuses to run), phone matching is HMAC-only and flag-gated, the camera opens only on an explicit action.

## Known limits and follow-ups

1. **Not run here:** the browser sweep (a11y with axe, real layouts at 360/768/1280/1920 px in RTL and LTR, offline shell e2e under `deploy/e2e`). The guards are static/jsdom. Run them against a built stack before deploying.
2. **Deployment:** nothing was deployed and `master` was not touched. Merging `qanouni` into `master` and deploying to the dv6 are the owner's decisions.
3. **Launcher icons:** the PNG icons still carry the old cream tile; a designer master of the Talib mark is needed (the transparent SVG mark is used in the app).
4. **Upstream body limit:** `server/index.js` accepts JSON bodies up to 3 GB (`FILE_LIMIT`, pre-existing upstream). On a 1.5 GB container this is a denial-of-service risk; lowering it is an upstream-file edit and was not done under the mergeability rule.
5. **Dependency advisories** above (upstream transitive packages).
6. **Test infrastructure flakes** observed (each passed on re-run; none caused by product code except the one fixed below): a regexp-stack `RangeError` on a multi-megabyte base64 payload was a real, intermittent bug and is fixed (linear validation); the rest: `ctb.test.js` has 5-second timing tests that fail under heavy parallel load; the `node:sqlite` worker occasionally dies with SIGSEGV on a full parallel run (the suite passes alone and on re-run); some jsdom suites keep Jest from exiting without `--forceExit`.
7. **Darija (`ary`)** is a partial overlay by design (falls back to the Arabic source); fr and en are complete and enforced by a test.
8. **Squads:** joining by invite code still assigns the legacy `contributor` role, which is an editor. The code is shown to admins only and rotates on demotion/removal.
9. The faculty used to scope the campus wall is the one the student chose in onboarding; there is no verification of enrolment.
10. **Parked deviations** recorded in `DECISIONS.md`: `GET /law/path/semesters/:s/modules` stays official-only because an existing test pins it (own modules use `GET /law/modules`); `LawTimetableSession` is realised by `LawTimetableSlot`; the evening reminder is in-app only because an existing acceptance test pins one push.
