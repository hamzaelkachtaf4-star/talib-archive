# Phase 1 — Review core (plan)

Spec refs: §3.6, §5.1, §5.5, §6.2 (review queue), §8.1, §8.5, §9.1, §9.6, §11 Phase 1.
The user asked to proceed without the S23 field test between phases. The acceptance criteria are verified
by automated tests instead.

## Data (migration `law_phase1_review`)
- **LawSubject:** fields as in §5.1. `dissertationRules` and `coursePlan` are JSON strings;
  `anythingllmWorkspaceId` is nullable.
- **LawTimetableSlot:** adds `placeholder` (bool). The seed has 7 placeholder slots (Mon ×3, Wed ×2,
  Thu ×2) with no subject; the user completes them in Settings.
- **LawClassSession:** `date` is a local `YYYY-MM-DD` string.
- **LawFlashcard:** adds `type` (basic / cloze / qualification), `canonicalIds` (JSON) and soft delete
  (`deletedAt`). FSRS state uses the ts-fsrs field set.
- **LawReviewLog:** `clientReviewId` is unique.
- **LawStudyDay**, and a single-row **LawStreak** (`id = 1`).

## Server
| Path | Purpose |
|---|---|
| `utils/law/time.js` | Local date in Africa/Casablanca (`localDate(date)`, `weekdayOf(dateStr)`, `addDays`) |
| `utils/law/fsrs.js` | Scheduler factory (fuzz **off** for determinism, retention from settings), `replayCard(createdAt, logs)`, `previewIntervals` |
| `utils/law/streak.js` | Pure `computeStreak(days, today)`: goal days, freezes earned every 7 goal days (max 2), auto-consumed on missed days |
| `models/lawSubject.js`, `lawTimetable.js`, `lawSession.js` | CRUD, timetable replace, placeholder seed |
| `models/lawFlashcard.js` | CRUD, due queue (interleaved, new-card cap), offline pack |
| `models/lawReview.js` | `submitBatch(logs)`: idempotent insert → full replay of affected cards → recompute affected study days → recompute streak |
| `endpoints/law/{subjects,timetable,cards,reviews,today}.js` | §9.1 and §9.6 routes, plus `POST /devices` |

**Replay rule:** the card state is always `fold(next, emptyCard(createdAt), logs ordered by (reviewedAt, clientReviewId))`.
- Arrival order, duplicates and multiple devices therefore can't produce diverging states.
- The client's locally computed state is only a preview.

**Retrieval minutes:** the sum of review `durationMs`, each review capped at 60 s so an idle screen
doesn't inflate the total.

## Frontend
- **IndexedDB** (`components/LawOS/lib/idb.js`, no dependency): stores `cards` (the offline pack),
  `reviewQueue` and `meta`.
- **`lib/reviewSync.js`:** syncs the queue on open, on `online` and on `visibilitychange`. It deletes queued
  logs only when the server acknowledges them, then replaces local cards with the server's state.
- **Review tab:** a ReviewSession with tap to reveal and four large bottom-third buttons, each showing its
  interval. Also a subject filter, a browse/create/edit/suspend view, and simple stats.
- **Today tab:** today's slots, a due-cards button, a goal ring, the streak badge, exam countdowns, and an
  Inbox count (0 until Phase 2).
- **Subjects tab:** list, create and edit (professor, exam date and format, colour).
- **Settings:** timetable editor and goal settings.

## Tests
- Unit tests: FSRS replay, covering order independence, duplicates, and two devices on the same day.
- Unit tests: streak (freeze earning, the cap of 2, auto-consume, today not counting yet).
- Unit tests: local-date edge cases around midnight in Casablanca.
- Integration test on a temporary SQLite DB built from the schema: the review batch is idempotent; 50
  offline reviews replayed twice give no duplicates; phone and laptop on the same card give a consistent
  state whatever the arrival order.

## Status (2026-10-10): implemented
Verified locally on Node 24:
- **Tests:** 220 jest tests pass. That includes 37 new LAW-OS ones: the time, FSRS and streak unit tests
  and 9 integration tests on a temporary SQLite DB.
- **Acceptance, 50 offline reviews:** `deploy/e2e/review-offline.cjs` passes in headless Chromium. It does 50
  ratings with the network off, the queue drains when the network returns, the server shows exactly 50 reps,
  and replaying the same 50 logs gives 50 duplicates with no state change.
- **Acceptance, phone + laptop on the same card the same day:** consistent in any arrival order
  (integration test).
- **Acceptance, streak freezes:** a freeze is earned after 7 goal days, is auto-consumed on a missed day,
  the cap is 2, and history arriving late is recomputed (unit and integration tests).
- **Regression:** the offline-shell e2e still passes.

Deviations:
- **Placeholder timetable:** the seeded slots are flagged `placeholder`, and the Today screen links to
  Settings to complete them.
- **New cards offline:** they're created online only for now. The review itself is fully offline.
- **Field test:** the user waived the S23 test between phases.
