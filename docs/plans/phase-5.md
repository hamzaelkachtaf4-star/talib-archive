# Phase 5 — Grounded AI methodology (plan)

Spec refs: §1.4–1.5, §5.6, §7.2–7.3, §8.2–8.3, §9.7, §11 Phase 5.

## Data (migration `law_phase5_method`)
- **LawCaseExercise:** as in §5.6. `targetQualifications` stays hidden until an attempt has been
  submitted.
- **LawCaseAttempt:** as in §5.6, plus `startedAt`, `modelAnswer` (only on explicit request after
  submission) and `suggestedCards` (with accepted flags).
- **LawDissertation:** as in §5.6, plus `citationCheck`.

## Server
| Path | Purpose |
|---|---|
| `utils/law/grounding.js` | The grounding contract (§7.2), described below |
| `utils/law/dissertationChecks.js` | Deterministic checks (§8.3) that run with no AI, described below |
| `models/lawMethod.js` | Exercises, attempts (timed: 3 h faculty or 4 h judicial-attaché preset; autosave only while a draft), submit, model answer only after critique, suggested cards → flashcards; dissertations CRUD/check/critique; drills |
| `jobs/critique.js` | `critique_case` and `critique_dissertation` run in the job queue, so they go through the budget gate and the worker runs one at a time |
| `prompts/*.v1.md` | `case_critique`, `dissertation_critique`, `qualification_drill`, `model_answer` |
| `endpoints/law/method.js` | The §9.7 routes, plus `/drills/next` and `/drills/:cardId/answer` |

**The grounding contract (§7.2):**
1. **Retrieve:** the articles the student cited through the picker, the exercise's target qualifications,
   and the top FTS matches of key terms in the student's text, at the relevant date.
2. **Prompt with the evidence,** labelled by canonicalId.
3. **Structured output** with citation fields.
4. **Validate:**
   - every cited id, both in citation fields and inline `[ID]`, must resolve in the corpus, otherwise it is
     removed and listed as unverifiable;
   - bare mentions like "الفصل 999" must match a resolved citation, otherwise they are stripped;
   - quotes must match the stored text after normalization, otherwise they are relabelled as paraphrase;
   - any unverifiable citation sets `banner: true`.
5. **Log:** the validation result is saved on the `LawAiCall` row (the router now returns its id).

**Write first:**
- A critique only exists after submission.
- `/attempts/:id/model-answer` returns 409 before the critique.
- A dissertation critique requires a draft: at least 3 intro steps and plan titles.

**Dissertation checks (§8.3), deterministic:**
- missing intro steps from the professor's rules;
- missing or non-interrogative problématique;
- non-bipartite plan;
- asymmetry;
- possible verb-headed titles, flagged for the student to confirm and never rewritten.

## Frontend (Method tab)
- **CaseList → CaseStepper:** 5 phases, ArticlePicker (structural citations), timer, autosave, two-tap
  submit. Then **CritiqueView:** rubric, per-phase feedback, a red "unverifiable" panel and banner,
  suggested cards, and a model answer on explicit request.
- **DissertationEditor:** IntroStepper (6 steps), 2×2 PlanTreeEditor, draft, RuleChecklist, critique.
- **QualificationDrill:** facts from qualification cards, typed answer, grounded verdict.

## Tests
- **Unit:** the validator (invented article stripped and listed, banner, quote mismatch → paraphrase, bare
  "الفصل N" stripped) and the dissertation checks.
- **Integration (fake provider):**
  - submit → critique job → critique with the invented id removed and the banner set;
  - no model answer before submission;
  - target qualifications hidden before submission;
  - suggested cards keep only resolved ids;
  - dissertation critique requires a draft;
  - drill verdict.
- **Static:** the prompts exist as versioned files.

## Status (2026-10-11): implemented
- **Tests:** 295 jest tests pass. That includes 8 Phase 5 integration tests covering the validator,
  retrieval, the case flow, autosave locking, dissertation checks and critique, drills and the prompt files.
- **Acceptance, invented article shown as unverifiable and removed from the text:**
  - The integration test covers inline `[ID]`, citation fields and bare "الفصل N".
  - The browser e2e `deploy/e2e/case-critique.cjs` runs against a local fake DeepSeek: the red panel lists
    `DOC:98765` and "الفصل 98765", the banner shows, and the critique prose no longer contains the
    number.
- **Acceptance, no model answer before submission:**
  - The API returns 409 before the critique (integration test).
  - The UI only shows the stepper until submission (e2e).
  - The model answer appears only on an explicit request afterwards, and it is grounded and validated too.
- **Acceptance, prompts are versioned files:** `case_critique`, `dissertation_critique`,
  `qualification_drill` and `model_answer` `.v1.md`. A test also checks that the routes contain no inlined
  prompt text.

Not verified:
- critique quality with the real DeepSeek or Gemini (no keys yet);
- the 3 h / 4 h timer is computed by the server and shown, but nothing locks the attempt at expiry. An
  overtime submission is accepted and flagged `overtime`.
