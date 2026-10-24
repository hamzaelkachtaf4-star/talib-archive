# Delivery map (RC4)

What the run found, and where each phase of `FULL_DELIVERY_PROMPT.md` lives. Branch `qanouni-delivery`.

## Starting state (Phase 0 recon)

An earlier run (RC3) had already shipped most screens. Checked against the running app, the gaps were:

| Area | Found | Fixed in |
|---|---|---|
| Legal corpus | `LawCode` rows existed with **zero articles**; catalog forced `status: "pending_source"`; no importer | `server/scripts/import-corpus.js`, `server/scripts/law/pdf_to_text.py`, `server/data/law/corpus/sources.json` |
| Timetable | seven invented placeholder sessions seeded for every student; no time grid; sessions linked to old *subjects* | `server/models/lawTimetable.js`, `WeekGrid.jsx`, migration `…drop_placeholder_sessions` |
| Desktop QR card | always "could not load" (read a field the API never returns) | `qr/QrShowModal.jsx` |
| Friend requests | no notification, nothing to accept in the bell | `models/lawProgress.js`, `notifications/NotificationList.jsx` |
| Navigation | order differed from the spec; phone bar had five tabs + "More" | `navigation/nav.config.js`, `Shell/index.jsx`, `BottomNav.jsx` |
| Community | a hub of six cards | three tabs: Friends, Faculty community, Work groups (`CommunityTabs.jsx`) |
| Work groups | no module, visibility or publish mode; XP and streak shown | `LawSquad` settings + `Squad.jsx` |
| Module recap | no attendance counter, comprehension or exam-center link | `ModuleRecap.jsx`, `LawModuleProfile` |
| Exam center | answers revealed only at the end; no module filter; no professor-format question | `DrillQcm.jsx`, `ExamCenter.jsx`, `POST /law/exam/drills/:id/check` |
| Copy / stubs | FDC adapter `NOT_IMPLEMENTED`, "coming soon" strings, "المراجعة الذكية" in the manifest | removed |

## Routes (six hubs)

`/law/today` · `/law/path` (`/path/m/:id` module workspace) · `/law/exam` (`/exam/cards`, `/exam/weak-spots`) · `/law/timetable` ·
`/law/library` (`/library/corpus?code=SLUG`, `/corpus/a/:canonicalId`) · `/law/community/{friends,campus,squads}` (`/squad/docs/:id`, `/squad/change-requests/:id`).
Old routes redirect (`navigation/legacyRedirects.js`): `/law/subjects`, `/law/method`, `/law/review`, `/law/schedule`, `/law/squad`, `/law/hub`.

## Data added this run (all migrations applied with `prisma migrate deploy`)

| Migration | Change |
|---|---|
| `20261201090000_rc4_todo_priority` | `LawTodo.priority` |
| `20261201100000_rc4_squad_settings` | `LawSquad.moduleTitle / visibility / publishMode` |
| `20261201110000_rc4_module_progress` | `LawModuleProfile.sessionsAttended / comprehension` |
| `20261201120000_rc4_reminder_time` | `LawReminderPref.eveningTime` |
| `20261201130000_rc4_drop_placeholder_sessions` | deletes untouched invented sessions |
| `20261201140000_rc4_corpus_reader` | `LawArticleBookmark`, `LawModuleArticle` |

## Placeholder grep (Rule 1)

Pattern: `NOT_IMPLEMENTED|pending_source|\bTODO\b|coming soon|قريباً|قريبا|lorem ipsum`, case-insensitive, over `frontend/src` and `server`
(tests excluded). Policy: LawOS namespaces are held to zero hits; the upstream AnythingLLM files that carry developer `TODO` comments
(agents, AgentBuilder, locale placeholders for other languages) are left untouched so the fork stays mergeable. Hits found and removed:
`corpusCatalog.js` (pending_source), `fdcAdapter.js` (deleted), `SetupSheet.jsx` / `Welcome.jsx` ("soon" labels), two unused locale keys.
