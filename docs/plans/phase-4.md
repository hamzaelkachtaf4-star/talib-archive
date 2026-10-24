# Phase 4 — Notes and two lenses (plan)

Spec refs: §3.4–3.5, §5.3, §6.3 (candidate atoms, align_polycopie), §8.4, §9.1 (`/subjects/:id/content`),
§9.3 (`accept-atoms`), §9.4, §11 Phase 4.

## Data (migration `law_phase4_notes`)
**LawNoteAtom** as in §5.3:
- **Provenance and body:** `provenance`, `body`, `headingPath` (JSON).
- **Source references:** `sourceAssetId`, `sourceTimestampSec`, `sourcePage`, `articleVersionId`,
  `decisionId`, `doctrineRefId`.
- **Flags:** `examRelevant`, `profEmphasis`, `profDivergent`, `mentionBridge`, `verificationStatus`.
- **Other:** `tags` (JSON), `fromDerivativeId`, soft delete.

## Server
| Path | Purpose |
|---|---|
| `utils/law/coursePlan.js` | Parses and serializes the professor's outline (indented lines ↔ tree), flattens it to an order index, and sorts atoms by the position of their `headingPath` in the plan. Atoms whose heading isn't in the plan go last, in creation order |
| `models/lawAtom.js` | CRUD with provenance rules: **PROF** needs an asset plus a timestamp or page; **TEXT** an existing article version; **JURIS** a decision; **DOCTRINE** a doctrine ref; **MINE** nothing. Covers the Mention Bridge (at most 2 pins per topic, one verified JURIS + one DOCTRINE), links, and offline Exam atoms |
| `models/lawLenses.js` | `/subjects/:id/content`, described below |
| `jobs/candidateAtoms.js` | When a transcript or OCR derivative is verified, proposes PROF atoms (unverified) with source refs, as a `candidate_atoms` derivative that appears in the Inbox. Accepting turns the selected ones into atoms |
| `jobs/alignPolycopie.js` | Maps the pages of a verified PDF derivative to course-plan headings (`polycopie_map`). Deferred from Phase 2 (D-016) |
| `endpoints/law/notes.js` | `/atoms`, `/atoms/:id/links`, `/subjects/:id/content`, `/derivatives/:id/accept-atoms` |

**`/subjects/:id/content`, by mode:**
- **Exam:** only *accepted* PROF and TEXT atoms, ordered by the course plan. `profDivergent` shows a neutral
  marker and no content.
- **Jurist:** all atoms, grouped by legal issue (the headingPath leaf, or an `issue:` tag), plus conflict links
  (`contradicts`/`divergesFrom`) and the Mention Bridge pins.
- **Default mode:** Exam when the exam is within N days (lockdown), otherwise Jurist. The client remembers
  the user's choice per subject on each device, but lockdown overrides the *default*, never access.

## Frontend
- **SubjectView** (`/law/subjects/:id`):
  - lockdown banner and a mode toggle (remembered per subject in localStorage);
  - course-plan tree with an atom list (provenance chips; PROF atoms jump to the audio timestamp or page);
  - add a MINE note;
  - Mention Bridge pins in Jurist mode;
  - course-plan editor (indented text);
  - sessions list.
- **Offline:** Exam Mode atoms are cached in IndexedDB from the offline pack.
- **Inbox:** a CandidateAtomReview screen to select, edit and accept candidates.

## Tests
- **Unit:** course-plan parse, serialize and order.
- **Integration:**
  - provenance validation;
  - Exam Mode shows only accepted PROF and TEXT atoms, in plan order;
  - lockdown triggers at N days;
  - Mention Bridge cap and type rules;
  - candidate atoms through the fake Gemini server;
  - accept-atoms creates PROF atoms that all resolve to a source (jump target).

## Status (2026-10-11): implemented
- **Tests:** 287 jest tests pass. Phase 4 adds the course-plan unit tests and 5 integration tests.
- **Acceptance, Exam Mode shows only PROF and TEXT:** integration test, plus the browser e2e
  `deploy/e2e/subject-lenses.cjs` (MINE is hidden in Exam and visible in Jurist).
- **Acceptance, lockdown at N days:** integration test with N = 10 and N = 14 from settings; the browser
  shows the lockdown banner and opens in Exam Mode.
- **Acceptance, every PROF atom jumps to its source:** atoms accepted from candidates carry a signed asset
  URL plus a timestamp or page (integration test). The jump button renders at `12:34` in the e2e.
- **Offline:** Exam Mode renders from the offline pack in airplane mode (e2e).

Deviations:
- **Grouping by legal issue:** uses an `issue:` tag, or else the headingPath leaf.
- **align_polycopie:** runs automatically when a PDF text is verified and the subject has a course plan.
