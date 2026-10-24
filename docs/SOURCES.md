# Legal sources (spec §6.5)

What we found on the live official sites. The scraper configuration is
`server/utils/law/radar/sources.json`: edit it there when a site changes, not in code.

| Origin | Site | Checked | Finding | Config |
|---|---|---|---|---|
| `adala` | adala.justice.gov.ma | 2026-10-11 | Next.js site. The `/new_releases` listing (also reached from the home page's "المستجدات" section) links each item to a PDF under `/api/uploads/YYYY/MM/DD/<Arabic name>.pdf#toolbar=0…`, and items repeat in the listing. No public JSON API for listings, and no terms of use or robots notice in the page content | `adala-new-releases`, enabled |
| `sgg_bo` | sgg.gov.ma/BulletinOfficiel.aspx | 2026-10-11 | DNN/ASP.NET page. The issue table ("Numéro du BO / Date / Télécharger") is empty in the served HTML and filled by postbacks, so a plain GET gets no issue links. There are six editions (the general one in Arabic, a French official translation, international conventions, etc.) | `sgg-bo`, **disabled**. Import BO PDFs manually through Corpus → Import |
| `juriscassation` | juriscassation.cspj.ma | not scraped | Decisions are entered and verified by hand (Phase 3). The student opens the official record before marking a decision verified | n/a |

**Scraper rules, as implemented:**
- **What is fetched:** listing pages only, once a day (when `SCRAPER_ENABLED=true`), or on a manual "scan
  now".
- **Politeness:** at least `SCRAPER_MIN_INTERVAL_SECONDS` between any two requests (never below 10 s). The
  user agent is `LAW-OS/1.0 (personal study tool …)`. Requests use ETag/Last-Modified, and a page whose
  hash hasn't changed is not parsed again.
- **New items:** each one becomes a `LawSourceDocument` with status `new`, shown in the Inbox. Nothing
  enters the corpus without a review session.
- **Documents:** downloaded only when the student imports one, with a hash check so the same document
  isn't stored twice.
- **Errors:** a source stops after 3 consecutive errors and is reported in the Inbox; it is re-enabled from
  the Radar tab.
- **Ignored items:** titles matching the ignore patterns (Egyptian family-law draft material, spec §3.7).
