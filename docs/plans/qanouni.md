# Qanouni (قانوني): rebrand, multiple users, privacy, Android (plan)

Branch: `qanouni`. This replaces the single-user assumption of the master spec (§1.9). Every user now has
their own private LAW-OS. The rules that stay: namespacing, the 1.5 GB limit, no local inference, the AI is
never a legal source, and Tailscale Serve only (never Funnel).

## 1. Rebrand
- **Name:** "قانوني | Qanouni".
  - Used in `frontend/index.html` (title and meta), `manifest.json`, the shell wordmark and the push titles.
- **New insignia** (`public/lawos/icons/icon.svg`): balance scales, Moroccan green with a gold accent. The
  PNG icons are rendered from it with headless Chromium.
- **The AI is shown as "مساعد قانوني ذكي".** Provider names never appear to students.

## 2. Accounts
- **`LawUserProfile`:** `userId` (unique, cascades with upstream `users`), `email` (unique, lowercased),
  `fullName`, `university` (default "FSJES Aïn Chock"), `section` (default "S3 Droit privé G01"),
  `googleSub` (unique, nullable).
  - Upstream `users` keeps the bcrypt hash (10 rounds, done by upstream `User.create/update`), the role and
    the suspended flag.
  - The username is derived from the email.
- **The owner:** the migration creates one admin user, with a password that can never match, if no admin
  exists yet. All existing LAW-OS rows are assigned to that user.
  - `/law/setup` (only while multi-user mode is off) gives the owner a name, email and password, then turns
    multi-user mode on.
  - Until then the app behaves exactly as before, as that owner. Tests and e2e rely on this.
- **Routes:** `/api/law/auth/{config,setup,register,login,google,me}`. They are rate-limited per IP and
  email.
  - Input is validated with joi.
  - The token is upstream's JWT (`makeJWT({id, username})`), sent as a Bearer header. Upstream's
    `validatedRequest` already accepts it in multi-user mode.
  - Responses never include `password`.
- **Google:** `google-auth-library` `verifyIdToken`. The audience comes from env `GOOGLE_OAUTH_CLIENT_IDS`
  (comma-separated). The email must be verified.
  - An existing email logs in and links the `sub`. A different `sub` on an already-linked email is refused.
  - A new email creates a `default` (student) account.
  - Google is only offered when the server has a client id and multi-user mode is on. Admins can close
    registration (`registrationOpen`).
- **Web sign-in:** the Google Identity Services button.
- **APK sign-in:** Google blocks OAuth in embedded WebViews (`disallowed_useragent`), so the APK uses native
  Credential Manager and passes the ID token to the page through a JS bridge.

## 3. Isolation, which fails closed
- **Request context:** `utils/law/tenant.js` holds it in an AsyncLocalStorage: `{userId, role}` or
  `{system: true}`.
- **Scoped client:** `dbClient.db()` returns a Prisma client extension that, for every **owned** model:
  - adds `userId = ctx.userId` to every read, update and delete filter, and sets it on every create or
    upsert;
  - turns `findUnique` into `findFirst`;
  - checks that foreign ids in written data (`subjectId`, `cardId`, `batchId`, `assetId`, `exerciseId`,
    `sessionId`, `slotId`, `noteAtomId`, and the polymorphic ids of `LawLink`) belong to the same user;
  - throws `LawTenantError` when there is no context. Tests get an explicit test-only fallback user.
- **Owned models:** Device, AiCall (attribution), Subject, TimetableSlot, ClassSession, Flashcard,
  ReviewLog, StudyDay, Streak, Asset, CaptureBatch, Upload, Job (nullable for system jobs), Derivative,
  Decision, DoctrineRef, Link, NoteAtom, CaseExercise, CaseAttempt, Dissertation, WeeklyRecap,
  PushSubscription.
- **Global, readable by everyone, written by the admin only:**
  - the statute corpus: Code, Article, ArticleVersion, CorpusImport, SourceDocument;
  - reform events.
- **Settings:** student preferences are stored per user (`u:<id>:<key>`). AI budgets and routing are global
  and admin-only.
- **Uniques that become per-user:**
  - asset `sha256` and `clientCaptureId`;
  - batch `clientBatchId`;
  - upload `clientCaptureId`;
  - study day `date`;
  - the streak singleton;
  - recap `weekStart`;
  - the decision key;
  - the link tuple.
- **Request flow:** `auth` resolves the user, then runs the request inside `runAs(user)`. `adminOnly` guards
  the AI settings and usage, corpus writes, radar sources and reform edits.
- **Background work:**
  - The worker claims jobs as `system`, then runs each handler as the job's owner.
  - The scheduler sends the close-out and the recap per user.
  - Pushes go only to that user's subscriptions.
  - The AI budget gate sums spend across all users, because the keys are the admin's.
- **Responses to students** have `provider`, `model`, `tokensIn/Out`, `estimatedCostUsd`, `promptHash`,
  `latencyMs` and `lockedBy` removed.
- **On the device:** a different account signing in wipes the LAW-OS IndexedDB (the device remembers whose data it holds
  across sign-out), and signing out with "remove offline data" ticked wipes it at once, so the offline cards and queued
  captures of one user are never shown to the next.

## 4. Interface privacy
- **Students:** Settings shows study preferences, the timetable, notifications and their profile only.
  - No provider names, models, token counts, costs or budgets.
  - The AI wording is "مساعد قانوني ذكي".
- **Admin:**
  - AI usage and budgets;
  - user management (list, suspend, role);
  - corpus imports and radar sources;
  - a link to upstream's `/settings`, which upstream already limits to admins.

## 5. Android (`/Users/tayeb/Documents/law-os-android`)
- **Black screen, the evidence:**
  - The app inherits a DayNight theme, so cold start shows a near-black window.
  - The loading overlay is hidden at 90% progress, whatever the page then does.
  - A renderer crash, or a page that never mounts, leaves a dark WebView with no message.
  - The cache is cleared on every launch.
- **Fixes:**
  - the SplashScreen API with the brand;
  - a light branded window background;
  - `onRenderProcessGone` recovery;
  - a boot watchdog: if the page has not mounted within 12 s, show the error screen with the reason;
  - offline and Tailscale error states with a retry;
  - console messages forwarded to logcat.
- **Security, a deliberate deviation from the brief:**
  - **SSL:** tailnet HTTPS certificates are publicly trusted Let's Encrypt certificates, so SSL errors are
    never accepted; the app shows an error instead of calling `handler.proceed()`.
  - **Mixed content:** never allowed.
  - **File access:** off.
  - **Cleartext and user CAs:** off.
  - Each of these would let a network attacker read sessions for no benefit.
- **Native Google sign-in** through Credential Manager, behind a JS bridge exposed only to the app's own
  origin.

## Tests
- All existing tests pass unchanged in behaviour.
- **New integration tests:**
  - two users cannot read, update or delete each other's subjects, cards, reviews, captures, attempts,
    dissertations, recaps or push subscriptions, either through the models or through HTTP routes;
  - foreign-id injection is refused;
  - no context means an error;
  - auth covers register, login, duplicate emails, wrong passwords, rate limits, no password in responses,
    Google with a mocked verifier (new account, existing account, unverified email, mismatched sub), setup
    only once, and suspended users;
  - admin-only routes return 403 for students, and provider fields are removed for students.

## Added during the work
- **Four interface languages** (user request): Arabic (default), Darija, French, English.
  - `lib/i18n.js` and `tr()` with the Arabic as the key; dictionaries in `frontend/src/locales/qanouni/`.
  - French and English are LTR. The language picker is in Settings and on the sign-in screens.
  - Legal content and stored data values are never translated.
  - `server/__tests__/utils/law/i18n.test.js` fails when a string lacks fr/en.
- **Two bugs found by running the APK in an Android 15 emulator:**
  - **Offline lazy pages failed in the WebView.** The server sends `Vary: Origin`, module scripts carry
    `Origin`, and the service worker's Vary-aware lookups missed every cached chunk. Fixed with
    `ignoreVary` (SW `lawos-q1`) plus a regression test.
  - **A hung connection left a blank WebView forever.** The app now shows a branded loading screen, and an
    error screen after 25 s.
- **Upstream's AuthContext logged users out when offline** (multi-user mode). Fixed; see
  UPSTREAM_TOUCHPOINTS.

## Status (2026-10-10)
- **Tests:**
  - 319 jest tests pass: the 305 original ones, plus 11 for tenancy and auth, 2 for i18n and 1 for the
    service worker.
  - 8 browser e2e scripts pass, including the new `accounts.cjs`.
- **APK** (`~/Desktop/Qanouni.apk`, release-signed): verified in the emulator.
  - **Online:** loads the live server through the tailnet with the real certificate (no SSL bypass).
  - **Against a local Qanouni build:** sign-in, Today, then airplane mode with a force-stopped app: the
    offline cold start opens Today and Review.
- **Not verified:**
  - a physical S23;
  - real Google sign-in (needs the OAuth clients below);
  - push through FCM in the APK.
