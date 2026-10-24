# Decisions

## D-000 — Archive pre-spec prototype (2026-10-10)
The uncommitted prototype (unprefixed `flashcards`/`legal_articles`/`radar_updates` models, SM-2, unversioned
articles, Phase 5–6 features before Phase 0) was committed to branch `prototype/law-os-v0` and removed from
`master`. LAW-OS is rebuilt phase by phase per MASTER_SPEC. UI ideas may be ported from the branch in their phase.

## D-001 — One SQLite file, not `storage/lawos.db` (2026-10-10)
Upstream AnythingLLM already uses `storage/anythingllm.db` through a single Prisma client. A second DB would
need a second Prisma schema/client and would break "one database" in spirit. LAW-OS tables live in the same
file, prefixed `Law*`, and WAL mode is enabled at boot. The spec's path is indicative (§4.3).

## D-002 — Prisma migrations, not `db push` (2026-10-10)
Spec §12 requires additive migrations, and the Docker entrypoint runs `prisma migrate deploy`. Each phase ships
its own migration. (FTS5 tables were first planned as a raw-SQL migration; superseded by D-004.)

## D-003 — Hardware profile (2026-10-10)
dv6: 8 GB RAM, HDD. Container limit 1536 MB (spec default). Node heap capped at 640 MB per process, since server and collector share the limit. Backups use hardlinked
incrementals and idle I/O priority to spare the HDD.

## D-004: Node 24 LTS, and the FTS index in its own file (2026-10-10)
FTS5 virtual tables inside `anythingllm.db` show up as 18 drift tables on every `prisma migrate dev`
(verified with `prisma migrate diff --from-migrations`). Any future migration would therefore try to drop
them. The index now lives in `storage/law/fts.db`, which is rebuildable and excluded from backups, and is
accessed through Node's built-in `node:sqlite`.
- **Runtime:** this needs Node ≥ 22.13, so the Docker image moved from Node 18 (EOL April 2025) to Node 24
  LTS. The user chose this over adding `better-sqlite3` to Node 18, or keeping FTS in the main DB and never
  running `migrate dev`.
- **Side benefit:** on Node 24 the upstream `jsonwebtoken`/`SlowBuffer` crash seen on Node 26 doesn't happen,
  so the prototype's shim isn't needed.
- **Local dev:** the Mac's default `node` is 26. Use Node 24 with `npx -y node@24 …`, or install it through
  a version manager.

## D-005: LAW-OS storage namespaced under `storage/law/` (2026-10-10)
Upstream already uses `storage/assets/` for logos and profile pictures. LAW-OS uses
`storage/law/{assets,derivatives,corpus/sources,uploads-tmp}` and `storage/law/fts.db`. This refines the
indicative layout in spec §4.3.

## D-006: Offline shell strategy (2026-10-10)
- **Fixed file names:** upstream's Vite config emits `/index.js`, `/index.css` and lazy-chunk CSS such as
  `/index2.css` with fixed, unhashed names. The service worker uses network-first (3 s timeout) for those
  and for navigations, and cache-first only for content-hashed `/assets/*` and `/lawos/*`.
- **Caching every tab:** once the service worker controls the page, the shell imports every tab and sends
  the service worker the URLs of all loaded assets, so every tab works offline after one online visit.
- **Auth guard:** `LawRoute` replaces upstream's `PrivateRoute` for `/law/*`. Upstream's guard treats
  "server unreachable" as "onboarding incomplete" and redirects. Offline, `LawRoute` trusts the last
  session the server confirmed (`lawos_last_auth_ok`).
- **Verified:** with headless Chromium (`deploy/e2e/offline-shell.cjs`).

## D-007: Telemetry forced off (2026-10-10)
Upstream sends anonymous telemetry by default. Spec §12 forbids analytics, so `DISABLE_TELEMETRY=true` is
set in the compose `environment:` block, where `lawos.env` can't override it.

## D-008: Backups are pulled by the MacBook (2026-10-10)
The second backup location is the MacBook. It pulls over Tailscale SSH with a launchd job every 4 hours
while awake. The server never pushes, because a sleeping laptop would fail a 03:30 push, and pulling means
the server holds no credentials to the Mac.

## D-009: FSRS state is derived from replaying the review log (2026-10-10)
The server never trusts a card state sent by a client. Each card's FSRS fields are
`fold(next, emptyCard(createdAt), logs sorted by (reviewedAt, clientReviewId))`, using ts-fsrs 5.4.2 with
**fuzz off**. Fuzz is off so that the client preview (which keeps review working offline) and the server's
replay agree exactly.
- **Idempotency:** this is what makes offline replay, duplicate batches and phone + laptop on the same day
  converge. It's tested in `server/__tests__/law/reviewSync.integration.test.js` and
  `deploy/e2e/review-offline.cjs`.
- **Derived "state before":** each log's `stateBefore` is set by the replay, not by the client. That way two
  devices reviewing the same new card offline count as one new card learned.
- **Clock skew:** a device clock behind the previous review never moves time backwards; it's clamped to the
  previous review.
- **Retrieval minutes:** each review counts for at most 60 s, so an idle screen doesn't inflate the total.

## D-010: Study day = calendar day in Africa/Casablanca, computed through Intl (2026-10-10)
Node 24's tzdata 2026c puts Africa/Casablanca on GMT+0 in October 2026, while 2026a had GMT+1: Morocco's
rules changed in 2026. Offsets are therefore never hardcoded.
- **Server:** it uses `Intl` with the zone name. Tests use fixed-offset zones for the boundary logic.
- **Docker:** it gets current tzdata from Node 24's bundled ICU. Rebuilding the image picks up future rule
  changes.

## D-011: New-card cap and interleaving (2026-10-10)
- **Cap:** the daily cap counts new cards *learned today*, from that day's study row, which is derived from
  replayed logs. Offline, the client keeps a local allowance that resets when the date changes.
- **Interleaving:** new cards are picked oldest-first within each subject, interleaved across subjects, and
  then capped. Without the interleave, the subject created first would take every slot.

## D-012: One upload engine for the service worker and the page (2026-10-10)
`frontend/public/lawos-upload-engine.js` is a plain (non-module) script:
- the service worker loads it with `importScripts`, and runs it on page request and on Background Sync
  (`lawos-upload`);
- the page loads it directly when no service worker is in control (dev).

So there's a single implementation of chunking, resume and "delete only after a matching-hash
acknowledgement". The page passes the auth token; it's kept in IndexedDB `meta` so a background sync can
authenticate. The engine and `lib/idb.js` share IndexedDB version 2 and must keep the same `upgrade()`.

## D-013: Audio is split into 10-minute parts before transcription (2026-10-10)
A 90-minute transcript can exceed a model's output limit. Imported audio longer than 12 minutes is cut with
`ffmpeg -c copy -f segment`, which is stream copy with no re-encoding, so the CPU cost on the dv6 is
negligible.
- **Transcription:** each part is transcribed separately, and its segments are put back on one timeline
  using measured part durations.
- **Checkpointing:** parts already transcribed are saved in the job payload, so a retry never pays twice.
- **Tiny tails:** tails under 1.5 s are skipped.
- **Recorder segments:** files from the in-app recorder are already 5 minutes and aren't split.
- **Inline vs upload:** media up to 15 MB goes inline; anything larger goes through the Files API.

## D-014: Budget semantics (2026-10-10)
- **Where budgets live:** in settings (`aiBudgetGeminiUsd`, `aiBudgetDeepseekUsd`). The defaults come from
  `AI_MONTHLY_BUDGET_USD_*`.
- **A budget of 0 means no spend:** AI jobs pause visibly (`paused_budget`) instead of silently spending
  money that was never authorised.
- **When the gate trips:** it checks month-to-date estimated spend before every call, and a budget pause is
  never routed to the fallback provider. Raising a budget in Settings re-queues the paused jobs.
- **Costs:** they're estimates from a configurable price table (`AI_PRICE_*`, USD per 1M tokens), with audio
  input priced separately using Gemini's per-modality token counts.

## D-015: Originals are served through short-lived signed URLs (2026-10-10)
`<img>` and `<audio>` can't send the `Authorization` header used in single-user password mode. Asset files
are therefore also reachable with `?exp&sig`: an HMAC over the asset id and expiry, valid for 1 hour, keyed
by `SIG_KEY`/`JWT_SECRET`. These URLs support HTTP Range requests (audio seeking). Without a valid signature
the normal auth check applies.

## D-016: `align_polycopie` deferred to Phase 4 (2026-10-10)
Aligning polycopié pages to the course plan needs the plan data and the Exam Mode ordering, which arrive in
Phase 4. Phase 2 extracts PDFs page by page: the text layer first, then Gemini vision only for scanned
pages.

## D-017: Phases 4–6 delivered without a field test (2026-10-11)
At the user's request, Phases 4–6 were built back to back. The acceptance criteria are covered by
integration tests and by browser e2e tests in headless Chromium against local fake AI and site servers,
not by the S23 field test after each phase that spec §11 asks for.

## D-018: Grounding validator scope (2026-10-11)
These are treated as citations and must resolve in the local corpus:
- canonicalIds in citation fields;
- inline `[CODE:N]`;
- bare "الفصل N" / "المادة N".

A bare mention is kept only when a resolved citation in the same output has that article number; otherwise
it is stripped and listed. Quotes are compared with the stored text after §6.4 normalization.

## D-019: Scheduler and push (2026-10-11)
- **Scheduler:** the in-process worker ticks a pure `due()` once a minute, for the daily scan, the 21:00
  close-out on timetable days and the Sunday 20:00 recap. Each action runs once per day or week, tracked in
  `LawSetting` meta.
- **Close-out push:** sent only when the Inbox has items, to avoid noise.
- **VAPID keys:** taken from env, otherwise from upstream's generated `push-notifications/vapid-keys.json`.
  Upstream's push service worker isn't used: LAW-OS push is handled in `lawos-sw.js`.

## D-020: SGG Bulletin Officiel scraping disabled (2026-10-11)
The issue list is filled by ASP.NET postbacks, so a polite GET of the listing has no items. Driving
postbacks or a headless browser would be heavier and less polite. BO PDFs are imported manually; Adala's
`/new_releases` is the automated source.

## D-021: Home-directory deployment without sudo (2026-10-10)
The server user has no passwordless sudo, so LAW-OS was deployed with `~/lawos`, `~/lawos-data` and
`~/lawos-backups`, and a user crontab runs the backup. The scripts take every path from env
(`LAWOS_DATA_DIR`, `BACKUP_ROOT`, `REMOTE_ROOT`), so the documented `/srv` layout stays possible later.
`install-macos.sh` now writes the host, user and remote path into the launchd job.
