# Phase 3 — Legal corpus (plan)

Spec refs: §1.4, §1.7, §3.2–3.3, §5.4, §5.8, §6.4–6.5, §9.5, §11 Phase 3.

**No statute text is written by the agent.** Article text enters only through a user-run import of
official PDFs or text, followed by the user's review. The seed is the code *registry* only: titles, law
numbers, family and in-force window. Tests use clearly synthetic fixture text.

## Data (migration `law_phase3_corpus`)
- **LawSourceDocument:** as in §5.4, plus `assetId` when the source was uploaded.
- **LawCode:** as in §5.4, plus:
  - `family` (e.g. `CPC`, shared by `CPC-1974` and `CPC-58.25`);
  - `inForceFrom` / `inForceTo`, the window of the work itself;
  - `numberingLabel` (`الفصل` or `المادة`).
- **LawArticle**, **LawArticleVersion** (`validFrom`/`validTo`, checksum, `verifiedByUser`).
- **LawCorpusImport:** the review session. Holds the source, code, the `validFrom` it was enacted with, the
  amending law and BO reference, status (parsing / review / committed / failed), parsed articles (JSON) and
  warnings.
- **LawDecision** (unique on court + number + date), **LawDoctrineRef**, **LawLink**.
- `LawReformEvent` is left for Phase 6, which seeds it.

## Server
| Path | Purpose |
|---|---|
| `utils/law/arabic.js` | `normalize()` and `lightStem()` exactly as in §6.4. Also `normalizeCanonicalId()` (digits, case, `bis`) |
| `utils/law/corpusParser.js` | Splits raw text into articles on `الفصل`/`المادة`/`Article` markers in Western or Arabic-Indic digits, supporting `88-1` and `مكرر`. Tracks the heading path (`الكتاب`/`القسم`/`الباب`/`الفرع`). Warns on gaps, duplicates and empty bodies |
| `models/lawCorpus.js` | Code registry seed, import → review → commit (versioning: an unchanged checksum is a no-op, otherwise the previous version is closed), article at a date, history, resolve |
| `utils/law/corpusSearch.js` | Ranked search, in order: article-number lookup, exact phrase on the original text, normalized phrase, light-stemmed terms. Then a filter by date and code family. FTS indexers for article versions and decisions |
| `models/lawDecision.js`, `lawDoctrine.js`, `lawLink.js` | Ledger CRUD. `verified` is set only by an explicit user action, after the official URL has been opened. Doctrine short quotes are capped at 300 characters (copyright, §12). Link types and relations are validated against §5.4 |
| `jobs/parseCorpusImport.js` | PDF text layer, then Gemini vision for scanned pages when configured, then parse into a review session |
| `endpoints/law/corpus.js` | The §9.5 routes |

**Date semantics:**
- An article version is valid on day *d* when `validFrom ≤ d < validTo`.
- A family search, e.g. `code=CPC`, picks the work whose in-force window covers *d*.
- Asking for an explicit slug such as `CPC-1974` ignores the code window, so the transitional rule for
  pending files still works. The reader then shows a "repealed" banner.

## Frontend
- **Corpus area** at `/law/corpus`, linked from the Subjects tab and later embedded per subject, with four
  tabs:
  - **Search:** an "at date" picker and results with their tier.
  - **Decisions:** the ledger.
  - **Doctrine.**
  - **Imports:** upload a PDF or paste text, then review.
- **ArticleReader** at `/law/corpus/a/:canonicalId`: text at a date, version timeline,
  verified/unverified badge, repeal banner, links.
- **ImportReview:** per-article number, heading and text editing, delete and merge-with-next. Each article
  has a confirm checkbox, unchecked by default. A "confirm all" button is an explicit user action. Commit
  sets `verifiedByUser` only on confirmed articles.

## Tests
- **Unit:** normalization (diacritics, alef forms, ى/ة, digits, French accents), light stemming (prefix
  combinations; فسخ ≠ انفساخ), parser (markers, Arabic-Indic numbers, bis, headings, warnings).
- **Integration:**
  - "الفصل 77" with or without diacritics, written with ٧٧ or 77, returns DOC:77;
  - CPC at 2026-08-23 gives the 1974 text, and at 2026-08-24 gives Law 58.25;
  - re-importing changed text creates version 2 and closes version 1;
  - an unchanged re-import is a no-op;
  - nothing is verified without confirmation;
  - resolve, decision uniqueness, link validation.

## Status (2026-10-10): implemented
- Tests: all jest suites pass (21 corpus integration tests + 13 normalization/parser unit tests added).
- Acceptance verified by tests: "الفصل 77" with/without diacritics, ٧٧/77 → DOC:77; CPC at 2026-08-23 → CPC-1974, at 2026-08-24 → CPC-58.25; nothing verified without explicit confirmation.
- Browser e2e `deploy/e2e/corpus-review.cjs`: paste → review → confirm one → commit → search → reader badges; it deletes its synthetic data afterwards.
- Not done: no real statute text imported (needs the user's official PDFs); semantic (embedding) search tier not enabled; corpus is a global area linked from Subjects (per-subject CorpusTab comes with Phase 4's SubjectView).
