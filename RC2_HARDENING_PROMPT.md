# Qanouni — v1.0.0-rc1 → rc2 Remediation & Hardening

You are working in the Qanouni repository, branch `qanouni`, currently at tag `v1.0.0-rc1` (commit `99d57e7`). Your job is to audit and then fix four areas: visual maturity, security, legal reasoning rigor, and RTL/theme UX. Work through the phases below **in order**. Do not skip the audit step in each phase. The file paths and model names below come from the release plan; **if the real code differs, follow the real code and say so in your report** — never invent files to match this prompt.

## Ground rules

1. **Audit before editing.** For each phase, first read the relevant code and write findings to `docs/audit/rc2-findings.md` (one section per phase: file, line, problem, severity `critical/high/medium/low`, fix). Only then make changes.
2. **One commit per phase**, conventional-commit style (`fix(security): …`, `refactor(ui): …`). Each commit must pass `scripts/gate.sh` on its own.
3. **Every security fix ships with a test that fails on the old code.** Write the test first, watch it fail, then fix.
4. **No regressions.** Don't change public API shapes, DB columns, or route paths unless the finding requires it; if it does, add a migration and note it in the findings file.
5. **Don't touch unrelated code** and don't reformat whole files.
6. **Brand name in one place.** The app may be renamed soon. While touching UI strings, route every occurrence of the app name ("Qanouni" / "قانوني") through a single constant (e.g. `frontend/src/config/brand.js` and a server equivalent). Don't rename anything yet.
7. If something in this prompt is wrong for this codebase (e.g. a guard already exists and is correct), record "verified OK" in the findings file and move on.

---

## Phase 0 — Baseline

```bash
git checkout qanouni && git pull
git status            # must be clean
git log -1 --oneline  # confirm 99d57e7
bash scripts/gate.sh  # record the baseline result in the findings file
```

Then map the stack: ORM (Prisma?), DB (Postgres/SQLite?), frontend styling (Tailwind? CSS modules?), i18n library, Markdown renderer, test runners. Write this to the top of the findings file — later phases depend on it.

---

## Phase 1 — Security & data integrity (do this first; it's the only phase that can hurt users)

### 1.1 AI quota (`LawAiUsage`) — atomic, race-proof

**Audit:** find every code path that calls the AI provider. Confirm each one goes through a single quota gate. A read-then-write pattern (`findUnique` → check `count < limit` → call AI → `update`) is a race: N parallel requests all read the same count.

**Fix:** reserve quota *before* the AI call with one atomic conditional write, and refund on failure.

- Postgres (raw SQL or Prisma `$queryRaw`):
  ```sql
  INSERT INTO "LawAiUsage" ("userId", "day", "count")
  VALUES ($1, $2, 1)
  ON CONFLICT ("userId", "day")
  DO UPDATE SET "count" = "LawAiUsage"."count" + 1
  WHERE "LawAiUsage"."count" < $3
  RETURNING "count";
  ```
  No row returned ⇒ over quota ⇒ 429, no AI call.
- Requires a **unique constraint on `(userId, day)`**; add a migration if missing. `day` must be computed in one fixed timezone (`Africa/Casablanca`) on the server, never from the client.
- If the provider call throws or times out, decrement (`count = count - 1 WHERE count > 0`). Streaming responses that the client aborts mid-way still count.
- Add a per-user concurrency cap (e.g. max 2 in-flight AI requests) and a global per-IP rate limit on AI routes.
- Quota checks must key on the authenticated user ID from the session, never a body/query param.

**Test:** fire 50 concurrent requests for a user with limit 10 (mock the provider). Assert exactly 10 succeed, 40 get 429, and the stored count is 10. Add a test that a provider failure refunds the slot.

### 1.2 Private accounts & follow privacy (`LawFollow`)

**Audit:** list every endpoint returning another user's data — profile, stats, streaks, XP, notes, decks, activity feed, squad membership, search results, leaderboard, follower/following lists, Hub authorship. For each, check what happens when the viewer's follow status is `PENDING`, `REJECTED`, absent, or the viewer is blocked.

**Fix:**
- Centralize into one server helper, e.g. `server/…/privacy.js` → `canViewProfile(viewerId, ownerId)` returning `FULL | PUBLIC_CARD | NONE`. Only `ACCEPTED` (or owner, or public account) gets `FULL`. Every endpoint above must call it; remove ad-hoc checks.
- `PUBLIC_CARD` = display name, avatar, university/year only. No counts, no activity, no "last active".
- Responses must be filtered with an explicit allowlist serializer (pick fields), never by deleting fields from a full object.
- Leaderboards and search must exclude or anonymize private accounts.
- Don't leak existence via different error codes: return the same response for "private" and "doesn't exist" where feasible.

**Test:** table-driven test over {endpoint × follow status} asserting no private fields appear in the JSON.

### 1.3 Contact discovery hashing (`LawPhoneHash`)

Important correction to the original brief: **do not use a per-record random salt** — it makes contact matching impossible. Use **HMAC-SHA256 with a single server-side secret key (pepper)**:

- Normalize first: E.164 (`+2126…`), strip spaces/dashes, map `06…`/`07…` to `+2126…`/`+2127…`.
- `hash = HMAC_SHA256(PHONE_HASH_KEY, e164)`. Key comes from env, ≥32 random bytes, never committed, never sent to the client. Fail fast at boot if missing.
- Hashing happens **server-side only**. Moroccan mobile numbers are a small space — a client-side or unkeyed hash can be brute-forced in minutes, so key secrecy is the whole defense.
- Never store or log raw phone numbers. Grep logs, error handlers, and analytics for phone fields.
- Rate-limit the discovery endpoint (e.g. max N lookups/day/user, max batch size) to stop enumeration.
- Document key rotation (re-hash on rotation) in `docs/security.md`.

**Test:** same number in different formats → same hash; raw number never appears in DB or API responses; missing key → server refuses to start.

### 1.4 XSS & injection: Hub Markdown, chat attachments, merge editor

- **Markdown rendering:** confirm raw HTML is disabled (e.g. `react-markdown` *without* `rehype-raw`), or output is passed through DOMPurify. Links: allow only `http:`, `https:`, `mailto:`; block `javascript:`, `data:`, `vbscript:`. Add `rel="noopener noreferrer nofollow"` and `target="_blank"` to external links. No `dangerouslySetInnerHTML` anywhere without DOMPurify — grep for it.
- **Chat reference attachments:** validate type and size server-side; render filenames as text; never interpolate attachment content into HTML.
- **3-way merge editor / any JSON merging (forks, notes, decks):** guard against prototype pollution — reject keys `__proto__`, `constructor`, `prototype` at every depth; merge into `Object.create(null)` or use a vetted library. Validate merged output against the schema (zod or existing validator) before saving.
- **Prompt injection:** user notes, attachments, Hub content and retrieved corpus text sent to the model must be wrapped as clearly delimited data in the prompt, with the system instruction stating that content inside is never instructions. The AI must have no tool that can write to other users' data.
- Add a CSP header (at minimum `script-src 'self'`, no `unsafe-inline` scripts) if the deployment allows it.

**Test:** render fixtures containing `<img src=x onerror=alert(1)>`, `[x](javascript:alert(1))`, and a merge payload with `{"__proto__":{"polluted":true}}`; assert no script executes / `({}).polluted === undefined`.

### 1.5 SSRF in SGG fetcher & timetable parsers

- Hostname **allowlist** (e.g. `www.sgg.gov.ma`, `sgg.gov.ma`, plus any faculty domains actually used) — exact match, not substring.
- Resolve DNS and reject private/loopback/link-local/metadata ranges (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `0.0.0.0`). Connect to the resolved IP you validated (avoid DNS rebinding).
- Disable automatic redirects, or re-validate each hop.
- Only `https:` (allow `http:` only for an allowlisted host that genuinely lacks TLS, and note it). Timeouts (≤10 s), max response size (e.g. 10 MB), and content-type checks.
- If users can submit timetable URLs, they go through the same guard. If users upload files instead, parse in a size-limited, timeout-limited worker.

**Test:** `http://127.0.0.1`, `http://169.254.169.254/`, `http://sgg.gov.ma.evil.com`, a redirect to localhost, and a decimal-IP URL (`http://2130706433`) are all rejected.

### 1.6 Quick sweep

`npm audit` (frontend + server), secrets in repo history (`git log -p | grep -iE "api[_-]?key|secret"`), auth on every route (list routes, mark which have auth middleware), CORS origin allowlist, cookie flags (`HttpOnly`, `Secure`, `SameSite`). Record findings; fix critical/high.

**Commit:** `fix(security): atomic AI quota, privacy gate, keyed phone hashing, XSS/SSRF guards`

---

## Phase 2 — Legal reasoning rigor

### 2.1 Citation grounding

**Audit:** trace the legal chat pipeline from question → retrieval → prompt → answer. Is retrieval from the local SGG corpus actually used? Can the model cite articles that aren't in the DB?

**Fix:**
- Post-generation **citation validator**: extract every citation (`الفصل 230 من ق.ل.ع`, `Art. 3 CP`, `المادة 2 من مدونة التجارة`, etc.), normalize code aliases (ق.ل.ع/DOC, ق.ج/CP, م.ت/Code de Commerce, مدونة الأسرة/Moudawana, ق.م.م, ق.م.ج), and check each against the corpus table.
- Unverified citations are **not shown as citations**: either strip them and add a visible note ("لم يتم التحقق من هذا المرجع"), or re-prompt once with the failure. Never silently pass them through.
- Verified citations link to the corpus entry.
- The system prompt must forbid citing French law as if it were Moroccan law. French doctrine/jurisprudence may be mentioned only labeled as comparative (`القانون المقارن`).
- If the corpus has no relevant text, the model says so instead of guessing.

### 2.2 Branch-specific reasoning rules

Put these in versioned prompt modules (e.g. `server/…/legal/branches/*.js`), selected by detected subject:

- **Commercial law:** source hierarchy comes from **Article 2 of the Code de Commerce (Loi 15-95)**, not the DOC — commercial law, then commercial usages and customs, then the DOC insofar as it doesn't conflict with the fundamental principles of commercial law. (The original brief wrote "DOC (Article 2)"; that's the wrong code.)
- **Criminal law:** principle of legality (Art. 3 Code Pénal; Constitution 2011), strict interpretation, no analogy against the accused, non-retroactivity except the more lenient law. Distinguish الدعوى العمومية from الدعوى المدنية التابعة.
- **Administrative law:** largely jurisprudence-built and uncodified; reason from general principles of law, administrative court case law (Loi 41-90, Loi 80-03), and administrative organization (centralization/deconcentration/decentralization). Don't pretend there's an article for everything.
- **Family law:** Moudawana (2004), with its Art. 400 reference to Maliki fiqh for gaps.

### 2.3 Learner memory (`LawBrain` / `LawTutorBrain`)

- Store a misconception only when the student made a concrete legal error that was **corrected in the conversation** (e.g. confusing البطلان/nullité with الإبطال/rescision, الدعوى العمومية with الدعوى المدنية, التقادم with السقوط). Not for typos, not for one-off questions, not for things the student asked about without erring.
- Each entry: concept key, short description, branch, `firstSeen`, `lastSeen`, `count`, `resolvedAt`. Dedupe by concept key — increment, don't append duplicates.
- Mark resolved after the student answers correctly N times (e.g. 2 spaced correct answers); hide resolved entries from the profile view.
- Cap active entries per student (e.g. 30) with LRU eviction of resolved ones.
- Student can view and delete entries.

**Tests:** citation validator unit tests (valid, invalid article number, nonexistent code, French article presented as Moroccan); a golden set of ~20 questions per branch run against a mocked model checking the validator catches fabricated citations; brain dedupe/resolve tests.

**Commit:** `feat(legal): citation validation, branch reasoning modules, precise learner memory`

---

## Phase 3 — Visual maturity overhaul (anti-juvenile)

Target feel: Linear / Brilliant / a well-made law review. Calm, typographic, confident. Gamification stays — it just stops looking like a toy.

### 3.1 Design tokens

Create or replace one token source (`frontend/src/styles/tokens.css` + Tailwind theme extension if Tailwind). All components consume tokens; **no hardcoded hex values in components** afterward (grep to verify).

Suggested palette (adjust if contrast checks fail):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F6F2` (paper) | `#0B1220` (midnight) | page |
| `--surface` | `#FFFFFF` | `#111A2E` | cards |
| `--surface-2` | `#EFEDE6` | `#17223A` | inputs, nested |
| `--border` | `#DAD6CB` | `#26324D` | hairlines |
| `--text` | `#141A26` | `#E8E6DF` | body |
| `--text-muted` | `#5B6273` | `#9AA3B5` | secondary (must hit 4.5:1) |
| `--primary` | `#14213D` (navy) | `#C9D3EA` | primary actions |
| `--accent` | `#0F5E4A` (judicial green) | `#3FA585` | progress, success |
| `--gold` | `#9C7A3C` (matte bronze) | `#C7A363` | mastery, seals — use sparingly |
| `--danger` | `#9B2C2C` | `#E07A7A` | errors |

- Radii: 6–10 px max. No pill bubbles except tags.
- Shadows: subtle or none; prefer 1px borders.
- No gradients on interactive elements, no bounce/wobble animations, no confetti. Motion: 150–200 ms ease-out fades/translates only; respect `prefers-reduced-motion`.
- Typography: Arabic — a serious text face (e.g. *IBM Plex Sans Arabic* or *Noto Naskh Arabic* for long reading; *Amiri* only for headings/seals if used). Latin/French — *Inter* or *IBM Plex Sans*. Tabular numerals for stats. Body line-height ≥1.7 for Arabic.
- Emoji removed from UI chrome (keep only in user content).
- Mascot (tarboosh book): restrict to onboarding and empty states; remove from progress, results and exam screens.

### 3.2 Roadmap & nodes

- Replace bubble nodes with either (a) **seal nodes**: thin circular/octagonal outline, small engraved-style index number, gold fill only when mastered; or (b) **milestone cards** in a vertical rail. Pick one, apply consistently.
- Structure must be **data-driven, not hardcoded to three levels**. Moroccan course plans commonly use القسم/الباب ➔ الفصل ➔ المبحث ➔ المطلب ➔ الفقرة (and sometimes المحور). Render whatever depth the course data has, with indentation and a thin connector line, and a progress fraction per level (e.g. `3/5 مطالب`).
- Progress: thin linear bars or ring segments, not chunky fills.

### 3.3 Terminology

Move all game strings into i18n keys and replace (Arabic / French / Darija variants where the app supports them):

| Old | New (ar) | New (fr) |
|---|---|---|
| BOSS | النازلة الكبرى الشاملة · or · محاكاة الامتحان النهائي (pick per context: case study vs exam sim) | Cas pratique de synthèse / Simulation d'examen |
| Crowns | مستوى التمكن الأكاديمي | Niveau de maîtrise |
| Checkpoint | محطة تقييمية | Étape d'évaluation |
| XP | نقاط التحصيل | Points d'acquis |
| Streak | المواظبة | Assiduité |
| Level up | ارتقاء في مستوى التمكن | Progression |

Grep the whole frontend and server (including notifications and push copy) for leftover game words (`boss`, `crown`, `checkpoint`, `streak`, `level up`, `🔥`, `👑`, `🎉`) in user-facing strings.

**Before/after:** take screenshots of roadmap, lesson, results, profile, Hub, in light and dark, before and after; save to `docs/audit/screens/`.

**Commit:** `refactor(ui): academic design system, seal-based roadmap, mature terminology`

---

## Phase 4 — RTL/LTR, themes, modal ergonomics

### 4.1 Direction

- Replace physical properties with logical ones across the frontend: `ml/mr/pl/pr/left/right/text-left/text-right/border-l/border-r/rounded-l/rounded-r` → `ms/me/ps/pe/start/end/text-start/text-end/border-s/border-e/rounded-s/rounded-e` (Tailwind ≥3.3) or `margin-inline-start`, `inset-inline-start`, etc. Grep and fix every hit; leave a comment where a physical value is intentional.
- Directional icons (chevrons, back arrows, "next", list markers, progress arrows) get `rtl:-scale-x-100` or a direction-aware icon component. Non-directional icons (search, settings, check, clock, play/media where convention differs) must **not** be flipped — check each.
- `dir` set on `<html>` from the active locale; mixed content (French article numbers inside Arabic text) wrapped with `<bdi>` or `unicode-bidi: isolate`.
- Numbers: decide Western (0-9) vs Eastern Arabic digits once and apply consistently.

### 4.2 Themes

- Every screen checked in light and dark. All text pairs must hit WCAG AA (4.5:1 body, 3:1 large text and UI borders/icons). Add an automated check: `@axe-core/playwright` (or existing e2e tool) run on key routes in both themes and both directions.
- Inputs, disabled states, placeholders, and focus rings explicitly styled per theme. Visible focus ring everywhere (`:focus-visible`).

### 4.3 `LegalConsentModal.jsx`

- Compact: single card, max ~420 px wide, three checkboxes with one-line labels each and a "read more" link per condition (opens the full text in a sheet/page, not inline).
- Shown once per user per terms version. Store `{ termsVersion, acceptedAt }` **server-side** on the user record (localStorage alone is not proof of consent); cache locally to avoid flicker.
- After acceptance it never reappears until the terms version changes. Escape/backdrop dismiss **only before** it's required (if consent is mandatory to use the app, it's not dismissible — but it should then be a dedicated first-run screen, not a modal over the workspace).
- Focus trap, `aria-modal`, labeled checkboxes, works in RTL.

### 4.4 Mobile

Check 360 px width (Android APK webview) and iOS PWA safe areas (`env(safe-area-inset-*)`). No horizontal scroll; tap targets ≥44 px.

**Tests:** Playwright e2e matrix {ar-RTL, fr-LTR} × {light, dark} × {360px, 1280px} on: roadmap, lesson, legal chat, Hub post, profile, consent flow. Snapshot + axe.

**Commit:** `fix(ux): logical properties, icon mirroring, AA contrast, compact consent flow`

---

## Phase 5 — Gate, report, release

```bash
bash scripts/gate.sh                      # must pass: lint, typecheck, unit, e2e, build
npm audit --omit=dev --prefix frontend
npm audit --omit=dev --prefix server
git status                                # clean except intended changes
```

If `scripts/gate.sh` doesn't run the new security and e2e suites, add them to it.

Finish `docs/audit/rc2-findings.md` with a summary table: finding → severity → status (fixed / verified OK / deferred + reason). Then:

```bash
git add -A
git commit -m "chore(release): v1.0.0-rc2 audit report"   # only if anything remains uncommitted
git tag -a v1.0.0-rc2 -m "Security hardening, legal citation validation, academic UI overhaul, RTL/theme fixes"
git push origin qanouni
git push origin v1.0.0-rc2
```

Do **not** move or force-push `v1.0.0-rc1`.

Final message to me: the summary table, anything deferred and why, any migration that must be run in production, and new required env vars (`PHONE_HASH_KEY`, etc.).
