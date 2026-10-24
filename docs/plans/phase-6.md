# Phase 6 — Legislative radar and rhythm (plan)

Spec refs: §3.7, §5.4 (LawReformEvent), §5.7 (LawWeeklyRecap, LawPushSubscription), §6.5 (scrapers),
§8.5 (close-out reminder, Sunday recap), §9.5–9.8, §11 Phase 6.

## Live-site check (recorded in docs/SOURCES.md)
- **Adala (adala.justice.gov.ma):** a Next.js site whose `/new_releases` listing links to PDFs under
  `/api/uploads/YYYY/MM/DD/…`. Scrapable by its listing page.
- **SGG (sgg.gov.ma/BulletinOfficiel.aspx):** the issue table is filled by ASP.NET postbacks, so a plain
  fetch has no rows. It is **disabled** in the config; BO PDFs are imported manually.
- **juriscassation:** not scraped. Decisions stay manual and verified by the student (Phase 3).

## Data (migration `law_phase6_radar`)
- **LawReformEvent:** as in §5.4, with jurisdiction always `MA` and `summaryVerified`.
- **LawWeeklyRecap:** as in §5.7.
- **LawPushSubscription:** as in §5.7.
- `LawSourceDocument.parseStatus` gains `new` and `dismissed` for scraped items.

## Server
| Path | Purpose |
|---|---|
| `utils/law/radar/sources.json` | Config-driven targets: URL, link selector, link pattern, ignore patterns (Egyptian family-law drafts), enabled flag |
| `utils/law/radar/politeFetch.js` | Clear user agent; at least `SCRAPER_MIN_INTERVAL_SECONDS` (≥10 s) between *any* two requests; conditional GET (ETag/Last-Modified); timeout |
| `utils/law/radar/scraper.js` | Scans listing pages only. Unchanged pages (304 or the same hash) are skipped. New links become `LawSourceDocument` rows (`new`) shown in the Inbox, and **never enter the corpus**. Errors abort the source; 3 consecutive failures disable it with an Inbox notice. Documents are downloaded only when the student imports one, with a hash check so the same document isn't stored twice |
| `models/lawRadar.js` | Reform events (seeded from §3.7: Moudawana as a `watch` event with no content), source review (import into a corpus review, or dismiss) |
| `models/lawRecap.js` | Weekly recap built deterministically from the logs. An optional Gemini-fast summary is non-fatal if it fails |
| `utils/law/push.js` | `web-push`, VAPID keys from env or upstream's generated keys; dead subscriptions (404/410) are pruned |
| `utils/law/scheduler.js` | Pure `due(now, state)`, described below. The worker ticks it every minute |
| `jobs/scrapeSource.js`, `jobs/weeklyRecap.js` | Job handlers |
| `endpoints/law/radar.js` | `/reforms`, `/sources`, `/sources/scan`, `/sources/:id/import\|dismiss`, `/recaps/*`, `/push/*` |

**What the scheduler triggers:**
- a daily scan when `SCRAPER_ENABLED` is on;
- a close-out push at 21:00 on timetable days (once per day);
- a Sunday 20:00 recap followed by a push.

## Frontend
- **Radar tab in the corpus area:** reform events by status, plus scraped sources.
- **Inbox:** new-source items, each with "Import for review" (pick the code and validFrom) or "Dismiss".
- **Today:** a WeeklyRecapCard on Sundays and Mondays, with a recap screen.
- **Settings:** a push notifications toggle.
- **Service worker:** `push` and `notificationclick` handlers, merged from upstream's push service worker.

## Tests
- **Scraper, against a local fake site:**
  - a new BO item appears in the Inbox without entering the corpus;
  - the minimum interval is respected (request timestamps);
  - the source stops after repeated errors;
  - deduplication, ignore patterns, and unchanged-page skipping;
  - import → corpus review.
- **Reform seed:** Moudawana has no content, and non-Moroccan jurisdictions are rejected.
- **Recap:** content, and the scheduler at Sunday 20:00 produces a recap plus a push (mock sender). This is
  the acceptance criterion.
- **Close-out:** the push fires only on timetable days, once per day.

## Status (2026-10-11): implemented
- **Tests:** 305 jest tests pass. That includes 10 Phase 6 integration tests run against a local fake
  official site and a mock push sender.
- **Acceptance, a new BO item reaches the Inbox without entering the corpus:**
  - In the integration test, scanning creates `new` source documents; LawArticle and LawCorpusImport stay at
    0; only the listing page is fetched.
  - Importing creates a review session only.
  - The browser e2e `deploy/e2e/radar-push.cjs` shows the item in the Inbox and dismisses it.
- **Acceptance, the scraper respects the interval and stops on errors:**
  - measured gaps between requests are at least the configured interval;
  - 3 consecutive HTTP 500s disable the source, no further requests are made, and the Inbox shows a notice.
- **Acceptance, the Sunday recap arrives as a push:**
  - The scheduler at a simulated Sunday 20:30 local enqueues `weekly_recap`. The job stores the recap
    (including next week's sessions) and sends "ملخص الأسبوع" to the subscriptions.
  - In the browser, a push delivered over CDP to the real LAW-OS service worker is displayed as a
    notification.
- **Also covered:**
  - the §3.7 seed: Moudawana is a `watch` item with no content, and other jurisdictions are rejected;
  - the close-out push only on timetable days when the Inbox has items, and pruning of dead subscriptions.
- **Regressions:** the offline-shell and offline-review e2e tests still pass with the new service worker.

Not verified:
- scraping the live Adala page: only its structure was checked; no automated fetch runs during development;
- push delivery through FCM to the S23;
- the AI recap summary with a real provider.
