# RC3 progress

- [x] Phase −1 recon — baseline gate PASS
- [x] Phase 0 brand — gate PASS (69 suites); logo: mascot.svg is the transparent mark, icon.svg (cream tile) kept for launchers/maskable; PNG icons still show the old tile (designer master needed). Themes are prefers-color-scheme only (no data-theme attr)
- [x] Phase 1 shell/nav — gate PASS (71 suites). Notes: ctb.test.js "two worker THREADS" is a 5s-timing test that flakes under load (unrelated; passes on rerun). jest process may not exit when a single mountJsx suite runs alone (harmless in the gate). `/law/method` redirect keeps `?view=method` until Phase 3 folds methodology into modules.
- [x] Phase 2 today — gate PASS (73 suites). Deviations: the goal-minutes numeric setting stays in Settings (data model intact), only the Today ring/streak card was removed (header already shows the streak). Gap radar card uses the Brain memories (course gap radar is per course); unread-discussions card reads squad notifications, which Phase 7 starts emitting. `since` cursor dropped from /todos/sync: updatedAt holds the client edit time, so the server always returns the full list.
- [x] Phase 3 path/module — gate PASS (78 suites). Deviations: see DECISIONS 13-16.
- [x] Phase 4 exam — gate PASS (81 suites). See DECISIONS 17-19.
- [x] Phase 5 timetable — gate PASS (84 suites). See DECISIONS 20-22.
- [x] Phase 6 library — gate PASS (87 suites). See DECISIONS 23-25.
- [x] Phase 7 community, friends and squads — see DECISIONS 27-29.
- [x] Phase 8 avatar studio — see DECISIONS 30.
- [x] Phase 9 copy and polish — see DECISIONS 32.
- [x] Phase 10 audit — see RELEASE_REPORT.md.

## Blocked
(none)
