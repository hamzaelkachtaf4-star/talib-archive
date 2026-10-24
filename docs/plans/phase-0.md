# Phase 0 — Foundation (plan)

Spec refs: MASTER_SPEC §1, §2, §4, §5.7–5.8, §10.1, §11 (Phase 0), §12.
Host facts: dv6, 8 GB RAM, **HDD**. Tailnet name: `<TAILNET>` placeholder until deploy.

## Scope
1. Namespaced `law` module skeleton (server + frontend).
2. Prisma additions for Phase 0 system tables only + raw FTS5 migration scaffold.
3. Settings (env + `LawSetting`), single-user auth, health endpoint.
4. Docker Compose for `lawos`: 1.5 GB limit, 127.0.0.1:3005, healthcheck, restart policy.
5. PWA: manifest (Arabic), service worker precaching the shell, RTL shell with 5 placeholder tabs.
6. Nightly backup + **tested** restore.
7. Docs: DEPLOY, DECISIONS, UPSTREAM_TOUCHPOINTS, SOURCES (stub), PROMPTS (stub).

Out of scope: subjects, cards, capture, corpus, AI. The archived prototype is on the
`prototype/law-os-v0` branch, kept for reference only.

## Server (new files)
| Path | Purpose |
|---|---|
| `server/endpoints/law/index.js` | Registers `/law/*` sub-routers (mounted under `/api` → `/api/law`) |
| `server/endpoints/law/system.js` | `GET /law/health` (DB ping, WAL check, free disk), `GET/PATCH /law/settings` |
| `server/models/lawSetting.js` | get/set JSON settings with env fallbacks |
| `server/utils/law/config.js` | Reads every `LAWOS_*`, `GEMINI_*`, `DEEPSEEK_*`, budget, `TZ` env var; `aiEnabled` flags; no hardcoded model names |
| `server/utils/law/db.js` | On boot: `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout` |
| `server/utils/law/fts.js` | `rebuildFts()` stub + `ensureFts()` (idempotent `CREATE VIRTUAL TABLE IF NOT EXISTS`) |
| `server/utils/law/storage.js` | Resolves `STORAGE_DIR/{assets,derivatives,corpus/sources,uploads-tmp}`; creates dirs |
| `server/__tests__/utils/law/config.test.js` | Config parsing; app boots with AI disabled when keys are missing |
| `server/__tests__/utils/law/fts.test.js` | FTS tables exist after `ensureFts()` on a temp DB |

## Prisma
- Additive migration `YYYYMMDDhhmmss_law_phase0`: `LawSetting`, `LawDevice`, `LawAiCall`.
  Each later phase adds its own models in its own migration. (Spec §12: never edit an applied migration.)
- FTS5 tables (`law_fts_article_versions`, `law_fts_note_atoms`, `law_fts_decisions`) live in a raw SQL
  migration, created now as empty tables so later phases only add sync code.
- Use `prisma migrate dev` / `migrate deploy` (the upstream entrypoint already runs `migrate deploy`),
  **not** `db push`. CLAUDE.md should be updated to match.

## Frontend (new files)
| Path | Purpose |
|---|---|
| `frontend/src/pages/LawOS/Shell.jsx` | `dir="rtl"` layout: bottom tab bar on mobile, sidebar from 1024px up |
| `frontend/src/pages/LawOS/{Today,Subjects,Capture,Method,Review}.jsx` | Placeholders with Arabic empty states |
| `frontend/src/components/LawOS/Bdi.jsx` | `<bdi>` wrapper + digit-normalized article number display |
| `frontend/src/models/law.js` | API client for `/api/law` |
| `frontend/public/lawos-sw.js` | Precaches the shell (hashed Vite assets from a build-time manifest) and serves cache-first offline |
| `frontend/public/lawos.webmanifest` + maskable icons | Arabic name, `dir: rtl`, `lang: ar`, standalone, theme colours |
| Arabic UI font | Self-hosted (e.g. Noto Naskh/IBM Plex Sans Arabic woff2) in `public/fonts`; no third-party CDN (§12 privacy) |

The precache list comes from a small Vite plugin, or a post-build script in `frontend/scripts/`,
that writes the hashed asset list into the service worker. No new heavy dependency is needed.
Workbox is the fallback if the hand-rolled version gets fragile.

## Upstream touchpoints (to log in `docs/UPSTREAM_TOUCHPOINTS.md`)
| File | Change |
|---|---|
| `server/index.js` | `require` + register `lawEndpoints(apiRouter)`; call `law/db.js` WAL init |
| `server/prisma/schema.prisma` | Append `Law*` models (no edits to upstream models) |
| `frontend/src/main.jsx` | Add `/law/*` routes under `PrivateRoute`; make `/` redirect to `/law/today` when `LAWOS_MODE` is on |
| `frontend/index.html` | Manifest link → `lawos.webmanifest`, `lang="ar" dir="rtl"`, theme-color |
| `docker/docker-compose.yml` | **Not edited.** A new `docker/lawos.compose.yml` is used instead |
| Upstream feature hiding | Via env (`LAWOS_HIDE_UPSTREAM=true`), read in one frontend guard. Nothing deleted |

## Docker (`docker/lawos.compose.yml`)
- Service `lawos`, built from the existing `docker/Dockerfile`; `ports: ["127.0.0.1:3005:3001"]`.
- `mem_limit: 1536m`, `memswap_limit: 1536m`, `NODE_OPTIONS=--max-old-space-size=1024`.
- `restart: unless-stopped`; healthcheck → `/api/law/health`.
- `TZ=Africa/Casablanca`; `STORAGE_DIR=/app/server/storage` on named volume/bind `./lawos-storage`.
- The collector process still runs (it is needed for polycopié chunking later). Its RSS will be measured;
  if the total is above about 1.2 GB idle, that will be reported with options rather than silently changed.
- Drop `cap_add: SYS_ADMIN` unless the collector's Puppeteer needs it (to be verified).

## Backup (`deploy/backup/`)
- `lawos-backup.sh`: `sqlite3 .backup` (consistent with WAL) → `backups/YYYY-MM-DD/anythingllm.db`,
  then `rsync --link-dest` of `assets/` (immutable, so hardlinked incrementals are cheap on the HDD).
  Keeps 14 daily copies.
- `lawos-backup.service` + `.timer` (systemd, 03:30 local, `Nice=10`, `IOSchedulingClass=idle` for the HDD).
- `lawos-restore.sh`: stop container → restore DB + assets into a fresh volume → start → hit `/api/law/health`.
- **Restore test:** `deploy/backup/test-restore.sh` brings up a throwaway container on port 3099 from the
  latest backup, checks health and that a sentinel `LawSetting` row is present, then tears it down.
  This is required by the Phase 0 acceptance criteria.
- Second location: the target dir is a variable (`BACKUP_DEST`). User to choose (second disk, USB, or the MacBook via rsync over Tailscale).

## Tailscale Serve (`docs/DEPLOY.md`)
`tailscale serve --bg --https=443 http://127.0.0.1:3005`. Never Funnel. Enable HTTPS certificates in the admin console.
Single-origin rule (§2.2) documented.

## Tests / verification
- `yarn --cwd server test` (new law tests), `yarn --cwd frontend build`.
- Local: `docker compose -f docker/lawos.compose.yml up`, `docker stats` to confirm the limit.
- Lighthouse PWA installability check; DevTools offline reload shows the shell.

## Acceptance (§11 Phase 0), verified on the server by the user
- [ ] Installs on the S23 from `https://tayebhomeserver.<TAILNET>.ts.net`, opens standalone.
- [ ] Shell loads in airplane mode.
- [ ] Backup restores onto a clean container (`test-restore.sh` passes).

## Risks / open items
- An uncommitted `buffer.SlowBuffer` shim existed in the prototype, which points to a Node version newer
  than upstream supports. Pin the Node version in the Dockerfile and `.nvmrc` instead of shimming.
- The spec names `storage/lawos.db`, but upstream uses `anythingllm.db`. See DECISIONS D-001.
- Upstream service worker `push-notifications.js` exists. The LAW-OS SW must not unregister it; merge push
  handling into `lawos-sw.js` in Phase 6.

## Status (2026-10-10): implemented. Deviations from the plan above
- **FTS:** moved out of Prisma migrations into `storage/law/fts.db` via `node:sqlite`. The Docker image
  moved to Node 24 LTS for this (D-004).
- **Storage:** lives under `storage/law/` (D-005).
- **Manifest:** served at `/manifest.json` by a route override, not a separate `.webmanifest` link. No edit
  to `index.html`/`MetaGenerator` was needed; `dir`/`lang` are set at runtime.
- **Node heap:** 640 MB per process, not 1024 MB, because the server and collector share the 1.5 GB limit.
- **Hiding upstream:** for now this is limited to `/` redirecting to `/law/today` and the PWA starting on
  `/law/today`. Upstream pages are still reachable by URL. A broader guard comes when it's needed.
- **Backups:** the second location is the MacBook, pulling over Tailscale (D-008).
- **Telemetry:** forced off (D-007).

Verified locally (Mac, Node 24):
- 13 unit tests pass.
- `vite build` passes.
- In a production-mode server, `/api/law/health` reports ok (WAL, FTS, disk), and settings GET/PATCH work,
  including validation.
- The offline-shell e2e passes in headless Chromium: offline reload, all 5 tabs, a cold deep link, and
  Settings degrading gracefully.
- The restore script was tested on a fake backup: happy path, refusal of a non-empty target, and checksum
  mismatch.

Not yet verified (needs the server):
- the Docker image build on Node 24;
- the memory ceiling under `docker stats`;
- `lawos-backup.sh` against the running container, and `test-restore.sh`;
- Tailscale Serve, and the PWA install on the S23.
