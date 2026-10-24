# Deploying LAW-OS on tayebhomeserver

Target: HP dv6 (8 GB RAM, HDD), Debian 13, Docker + Compose, Tailscale. Co-tenants: Jellyfin, Immich,
Navidrome, Hermes. LAW-OS is capped at **1.5 GB RAM / 1.5 CPU** and listens on **127.0.0.1:3005 only**.

> **One origin, always** (spec §2.2): every device uses `https://tayebhomeserver.<TAILNET>.ts.net`, including
> at home. Never bookmark `http://100.109.58.54:3005` or `http://192.168.11.243:3005`. A different origin
> means a separate login, separate offline storage, a broken PWA install, and no camera or service worker
> (those need HTTPS).

## 1. One-time host setup

```bash
# Code
sudo git clone <your fork> /opt/lawos && sudo chown -R "$USER" /opt/lawos
cd /opt/lawos

# Data directory (the container runs as uid/gid 1000)
sudo mkdir -p /srv/lawos/{storage,collector/hotdir,collector/outputs} /srv/lawos-backups
sudo touch /srv/lawos/server.env
sudo chown -R 1000:1000 /srv/lawos

# Environment
cp docker/lawos.env.example docker/lawos.env
chmod 600 docker/lawos.env
# Edit docker/lawos.env:
#  - LAWOS_BASE_URL: put in your tailnet name
#  - AUTH_TOKEN (your app password), JWT_SECRET, SIG_KEY, SIG_SALT: `openssl rand -hex 32` for each
#  - leave the AI keys empty until Phase 2
```

`id -u` on the server must be 1000. If it isn't, export `UID`/`GID` before running `docker compose` and
chown `/srv/lawos` to match.

## 2. Build and start

```bash
cd /opt/lawos
docker compose -f docker/lawos.compose.yml --env-file docker/lawos.env up -d --build
docker compose -f docker/lawos.compose.yml ps          # wait for "healthy"
curl -s http://127.0.0.1:3005/api/law/health           # {"status":"ok",...}
docker stats --no-stream lawos                         # MEM LIMIT should read 1.5GiB
```

The first build on the dv6 is slow (it compiles the frontend and installs native deps). Later builds reuse
cached layers.

On first open, AnythingLLM's onboarding runs once. Pick **single user** and set a password (or rely on
`AUTH_TOKEN`). Skip the LLM provider for now; LAW-OS AI is configured with env vars in Phase 2.

## 3. HTTPS through Tailscale Serve (never Funnel)

1. In the Tailscale admin console, go to **DNS** and enable **MagicDNS** and **HTTPS Certificates**.
2. On the server:
   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:3005
   tailscale serve status        # shows https://tayebhomeserver.<TAILNET>.ts.net -> 127.0.0.1:3005
   ```
3. Check: `tailscale funnel status` must show nothing. Funnel would expose LAW-OS to the internet.

Serve settings survive reboots. To remove them: `sudo tailscale serve --https=443 off`.

## 4. Install on the Galaxy S23

1. Open Tailscale on the phone and make sure it's connected.
2. In Chrome, open `https://tayebhomeserver.<TAILNET>.ts.net`, log in, and wait for the **اليوم** screen.
3. Open the Chrome menu and choose **Add to Home screen**, then **Install**.
4. Open LAW-OS from the home-screen icon. It should open standalone, with no URL bar.
5. Offline check: switch on airplane mode, close LAW-OS completely, then reopen it. The shell and all five
   tabs should load, with a **بدون اتصال** badge in the header.

## 5. Backups

### On the server: nightly local snapshot
```bash
sudo install -m 644 deploy/backup/lawos-backup.service deploy/backup/lawos-backup.timer /etc/systemd/system/
echo "BACKUP_OWNER=$USER" | sudo tee /etc/default/lawos-backup   # the SSH user the MacBook pulls as
sudo systemctl daemon-reload
sudo systemctl enable --now lawos-backup.timer
sudo systemctl start lawos-backup.service && journalctl -u lawos-backup -n 20   # first run now
```

Each night at 03:30 the backup:
- takes a consistent SQLite snapshot through the online backup API, inside the container;
- makes a hardlinked incremental copy of `storage/`;
- writes `MANIFEST.json`.

It keeps 14 days in `/srv/lawos-backups/YYYY-MM-DD`, with `latest` pointing to the newest. These are left
out because they can be rebuilt: LanceDB, the FTS index and upload staging.

### On the MacBook: second location, pulled over Tailscale
Requirements:
- SSH from the Mac to the server works without a password: `ssh tayebhomeserver true`. Use `tailscale up --ssh`
  on the server, or a normal SSH key.
- Tailscale is running on the Mac.

```bash
cd ~/Documents/law\ app
deploy/backup/macos/install-macos.sh
launchctl kickstart -k gui/$(id -u)/com.lawos.backup-pull   # run now
tail ~/Library/Logs/lawos-backup-pull.log
```

The pull runs every 4 hours while the Mac is awake, and catches up after sleep. Copies land in
`~/LAW-OS-Backups`; `.last-success` holds the time of the last successful pull. The SSH user needs to be set
if it differs from your Mac username: edit `LAWOS_SSH_USER` in
`~/Library/Application Support/lawos/lawos-backup-pull.sh`.

`server.env` is included in backups because it holds the keys that decrypt upstream-encrypted settings. That
makes `~/LAW-OS-Backups` sensitive: keep FileVault on.

### Offsite copy: encrypted, to Cloudflare R2 (free tier: 10 GB, no egress fees)
Each night, after the local snapshot, `lawos-offsite.sh` encrypts with `age` and uploads with `rclone`:
`core-<date>.tar.age` (database + `server.env` + manifest, every night) and, if enabled, `storage-<date>.tar.age`
(uploaded originals, Sundays only, skipped with a warning above `OFFSITE_STORAGE_MAX_MB`). Object names carry
only the date. Anything older than `OFFSITE_KEEP_DAYS` (30) is deleted; other files in the bucket are left alone.

One-time setup:
1. Cloudflare dashboard, R2: create bucket `lawos-backups`; create an API token limited to that bucket
   (Object Read and Write). Note the account id, access key id and secret.
2. On the dv6: `sudo apt install age rclone`.
3. On a trusted machine (not the server): `age-keygen -o lawos-age-key.txt`. It prints the public key `age1...`.
   **Store the private key file offline (password manager and a paper copy). Without it the backups cannot be
   decrypted, and a copy on the server would defeat the encryption.**
4. Put the settings in ONE env file. systemd reads `/etc/default/lawos-backup` itself (root, mode 600); **cron does not**,
   so on the home-directory deployment (user crontab, no sudo) use a user-owned file and point the cron line at it:
   `install -m 600 /dev/null ~/.config/lawos-backup.env`, and in the crontab prefix the job with
   `LAWOS_BACKUP_ENV=$HOME/.config/lawos-backup.env`. The scripts read that file whenever `RCLONE_REMOTE` is not already exported.
```
AGE_RECIPIENT=age1...                    # public key only
RCLONE_REMOTE=r2:lawos-backups
RCLONE_CONFIG_R2_TYPE=s3
RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_R2_ACCESS_KEY_ID=...
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=...
RCLONE_CONFIG_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
OFFSITE_STORAGE=1                        # optional: also upload originals on Sundays
OFFSITE_REQUIRED=1                       # recommended: a missing/unreadable setting fails the run instead of skipping offsite silently
```
5. Run the backup once: `LAWOS_BACKUP_ENV=$HOME/.config/lawos-backup.env deploy/backup/lawos-backup.sh` (cron deployment) or
   `sudo systemctl start lawos-backup.service && journalctl -u lawos-backup -n 20` (systemd). Both must show
   `uploaded core-... verified`. An offsite failure leaves the local backup intact but exits non-zero (cron log / `systemctl --failed`).
   Uploads go to a hidden `.partial` object and are renamed only after the size check, so a crashed run never leaves a
   truncated backup under its real name.

Restore drill (do this once now, then monthly): `AGE_IDENTITY=/path/to/lawos-age-key.txt LAWOS_BACKUP_ENV=$HOME/.config/lawos-backup.env deploy/backup/test-restore.sh --offsite` (prefix `sudo -E` where Docker needs it; the env file supplies the R2 credentials)
must print `PASS`. For a real disaster, `lawos-offsite-fetch.sh <dest>` produces a folder that `lawos-restore.sh` accepts.
`deploy/backup/test-offsite.sh` checks the pipeline locally without Docker or network (also run by `scripts/gate.sh`).
Notes: age encrypts to the public key, so anyone holding the bucket write token could upload a bundle you would
decrypt (the fetch script extracts only the expected files, as the invoking user, mode 700); keep the token on the server only and restore from a known-good date.
The server's token can also delete (`rclone delete` does the pruning): for stronger protection set R2 lifecycle expiry instead and use a token without delete, or enable bucket versioning.
Free-tier sizing: a 3000 MB storage bundle kept 30 days is about 4 bundles; lower `OFFSITE_STORAGE_MAX_MB` (or `OFFSITE_KEEP_DAYS`) to stay under 10 GB, and note that months without a storage upload eventually leave none.

### Restore test (Phase 0 acceptance)
```bash
sudo deploy/backup/test-restore.sh            # uses /srv/lawos-backups/latest
```
This restores into a temporary directory and boots a second container from the same image on
127.0.0.1:3099. It waits for `/api/law/health` to report `ok`, compares table row counts with the
backup's `MANIFEST.json`, then removes everything. **It must print `PASS`.** Production is never touched.

### Real restore
```bash
docker compose -f docker/lawos.compose.yml stop lawos
sudo mv /srv/lawos /srv/lawos.broken-$(date +%F)
sudo deploy/backup/lawos-restore.sh /srv/lawos-backups/latest /srv/lawos   # or a copy from the MacBook
sudo chown -R 1000:1000 /srv/lawos
docker compose -f docker/lawos.compose.yml --env-file docker/lawos.env up -d
```
To restore from the MacBook, first copy the dated folder back:
`rsync -aH ~/LAW-OS-Backups/2026-10-10 tayebhomeserver:/tmp/`.

## 6. Updating

```bash
cd /opt/lawos && git pull
docker compose -f docker/lawos.compose.yml --env-file docker/lawos.env up -d --build
```
Migrations run automatically on boot (`prisma migrate deploy`). The service worker picks up the new
`index.js` on the next online open, because the shell uses network-first.

## 7. Resource notes (dv6)

- **Memory limit:** the 1.5 GB cap is shared by two Node processes, the server and upstream's document
  collector. Each has a 640 MB heap limit. If `docker stats` shows LAW-OS idling above ~1.2 GB, report it
  rather than raising the limit (spec §2.1).
- **Disk I/O:** backups run with idle I/O priority so Jellyfin streams aren't disturbed.
- **Chromium:** `cap_add: SYS_ADMIN` from upstream's compose file is intentionally dropped. Upstream's
  website-scraping connector (Chromium) may not work in this container, and LAW-OS doesn't use it.
- **Telemetry:** forced off (`DISABLE_TELEMETRY=true`, spec §12).

## Actual deployment on tayebhomeserver (2026-10-10)
The `tayeb` user has no passwordless sudo, so the deployment uses the home directory instead of
`/opt`/`/srv`, and user cron instead of a systemd timer. Everything else is as described above.

| Item | Value |
|---|---|
| URL | `https://tayebhomeserver.tail94b594.ts.net` (tailnet `tail94b594`) |
| Code | `~/lawos` (copied with rsync from the MacBook; no git remote) |
| Data (`LAWOS_DATA_DIR`) | `~/lawos-data` (`storage/`, `server.env`, `collector/`) |
| Env | `~/lawos/docker/lawos.env` (600). `JWT_SECRET`/`SIG_KEY`/`SIG_SALT` were generated on the server. `AUTH_TOKEN` is empty: set the app password in the first-run onboarding |
| Container | `lawos`, image `lawos:latest` (Node 24.21), `127.0.0.1:3005`, 1.5 GiB limit. About 414 MiB at idle after boot |
| Backups | `~/lawos-backups`; user crontab `30 3 * * *` runs `deploy/backup/lawos-backup.sh` with `LAWOS_DATA_DIR`/`BACKUP_ROOT`, using `nice` and `ionice -c3`. Log: `~/lawos-backups/backup.log` |
| Restore test | `BACKUP_ROOT=$HOME/lawos-backups bash deploy/backup/test-restore.sh`: **PASS** on 2026-10-10 |
| MacBook pull | Installed with `LAWOS_HOST=100.109.58.54 LAWOS_SSH_USER=tayeb REMOTE_ROOT=/home/tayeb/lawos-backups deploy/backup/macos/install-macos.sh`. It uses the IP because the Mac's `known_hosts` only has the IP. First pull OK; the DB hash matched |

**Updating the code from the MacBook:**
```bash
rsync -az --delete --exclude '.git/' --exclude 'node_modules/' --exclude 'server/storage/' --exclude 'frontend/dist/' \
  --exclude 'collector/hotdir/' --exclude 'collector/outputs/' --exclude 'server/public' --exclude 'docker/lawos.env' \
  --exclude 'server/.env' --exclude 'server/.env.development' --exclude 'frontend/.env' --exclude 'collector/.env' \
  ./ 100.109.58.54:lawos/
ssh 100.109.58.54 'cd ~/lawos && docker compose -f docker/lawos.compose.yml --env-file docker/lawos.env up -d --build'
```
Keep `docker/.env.example` in the sync: the Dockerfile copies it into the image. The first rsync excluded
`.env.*` and the build failed because of it.

**Tailscale Serve (2026-10-10):** the user ran `sudo tailscale set --operator=tayeb` once, so Serve can now be
managed without sudo. `tailscale serve status` shows `https://tayebhomeserver.tail94b594.ts.net (tailnet only)`
proxying to `http://127.0.0.1:3005`, and Funnel is off.

Checked from the MacBook:
- HTTP/2 200 with a valid certificate;
- `/api/law/health` ok;
- the LAW-OS manifest and service worker are served;
- port 3005 is not reachable on the Tailscale IP.

## Qanouni: accounts, Google sign-in, APK (2026-10-10)
**First run after the Qanouni deploy:**
1. Open `https://tayebhomeserver.tail94b594.ts.net/law/setup`.
2. Enter your name, email and password. This becomes the admin account and keeps all existing data.
3. Multi-user mode then turns on. Students register at `/law/register`.

Reaching the app still requires the tailnet: invite students to the tailnet, or share the node with them.
Never use Funnel.

**Google sign-in:**
1. In Google Cloud Console → APIs & Services → Credentials, create an OAuth client of type **Web**.
   - Authorized JavaScript origin: `https://tayebhomeserver.tail94b594.ts.net`.
2. Create an OAuth client of type **Android**:
   - package `com.tayeb.lawos`;
   - SHA-1 `0D:59:A2:22:44:62:C9:A8:16:79:22:8D:87:38:76:81:BC:B0:98:1C` (the release key).
3. Put the **web** client id in `~/lawos/docker/lawos.env`: `GOOGLE_OAUTH_CLIENT_IDS=<web client id>`.
4. Restart the container. The APK asks for tokens with the web client id as audience, so one id is enough.

**APK signing key:** `law-os-android/keystore/qanouni-release.jks`, with its password in
`law-os-android/keystore.properties`. Both are git-ignored.
- Back both up somewhere safe: without them, future APKs cannot update the installed app.
- The old LAW-OS APK was signed with a different (debug) key, so uninstall it once before installing
  `Qanouni.apk`.

---

# Rafiq / Qanouni v1 deployment runbook (phases 1-12) — written 2026-10-12, NOT executed against production

Pre-flight on the dv6 (all commands from the repo root unless noted):

1. **Back up the database** (never skip): `cp server/storage/anythingllm.db server/storage/anythingllm.db.$(date +%Y%m%d-%H%M%S).bak` (stop the container first, or use `sqlite3 ... ".backup"`). Also copy `server/storage/law/` (chat attachments, corpus sources).
2. **Check the migration table before deploying**: `sqlite3 server/storage/anythingllm.db "select migration_name, finished_at is not null from _prisma_migrations order by started_at desc limit 5"`.
   - On the 2026-10-12 audit copy of the dev DB, `20261017090000_law_social_facebook` failed with *duplicate column name: facebookId* because the column already existed (schema drift from an earlier manual change). If the same happens: `yarn --cwd server prisma migrate resolve --applied 20261017090000_law_social_facebook`, then deploy again.
3. `git pull` (branch `qanouni`), `yarn --cwd server install --frozen-lockfile`, `yarn --cwd frontend install --frozen-lockfile`.
4. `yarn --cwd server prisma generate && yarn --cwd server prisma migrate deploy` (the Docker entrypoint does this on boot). Verified on a copy of the dev DB: **81 pre-existing tables kept every row**, `PRAGMA foreign_key_check` and `integrity_check` clean; existing students are backfilled as onboarded; existing codes get their `domain`.
5. Data migration (idempotent, dry-run first): `node server/utils/law/scripts/migrateFriendships.js --dry-run` then without the flag.
6. New environment (all optional; see `server/.env.example`): `AI_DAILY_LIMIT_DEFAULT` (25), `AI_QUOTA_ADMIN_EXEMPT`, `FDC_BASE_URL`, `FDC_AUTOFETCH` (weekly timetable refresh; default off), `FEATURE_CONTACT_MATCH` (**keep false**: no phone ownership verification exists yet, and the CNDP/Loi 09-08 review is pending) and `PHONE_HASH_PEPPER`.
7. `VITE_API_BASE=/api yarn --cwd frontend build`, rebuild/restart the container (`docker compose up -d --build`). The service worker is `lawos-q5`: clients pick it up on the next visit.
8. **Consent version is now 1.1.0**: every student sees the notice again (it discloses "ذاكرتي"). Learner memory collects nothing until they accept.
9. Admin tasks after boot (Settings → admin cards):
   - *Official timetables*: "Fetch faculty timetables (autumn)" → review each staged source (diff + parse log) → publish (replace, or merge for a supplement CSV). Students never see unreviewed parses.
   - *Corpus*: import the official texts (the SGG site returned 503 on 2026-10-12, so no URLs are hard-coded): paste/upload → parse → review → commit. New code shells (Constitution, organic laws, CPP, administrative courts) stay "قيد المراجعة" until imported.
   - *Concepts*: link each concept to corpus articles and approve contrast tables (Brain taxonomy); author reviewed drill items (the item bank ships empty on purpose).
   - *Quota / moderation / corrections*: set `aiDailyLimit`, `aiBrainDailyBudget`; review `/law/admin/moderation` and `/law/admin/corrections`.
10. Smoke test over the Tailscale URL on a phone and a desktop: sign in → welcome wizard (new account) → Today → Path → Library chat (one question) → Community.
11. Android: build `./gradlew assembleRelease` in the Android repo (keystore stays untracked; one keystore forever), copy to `frontend/public/downloads/rafiq.apk`, write `rafiq.apk.sha256` next to it (`shasum -a 256 rafiq.apk > rafiq.apk.sha256`). The download card shows the hash.
12. **Rollback**: stop the container; restore the `.bak` DB copy; `git checkout <previous tag>`; rebuild. (Migrations are additive; restoring the backup is the supported way back.)
13. Optional before a release: `LAWOS_EVAL=1 yarn --cwd server eval:ai` (spends provider credits) to replay every admin-verified AI correction.

## v1.0.0-rc2 upgrade notes
- **No database migration** in rc2 (verified: `git diff v1.0.0-rc1 -- server/prisma` is empty).
- **New / changed environment** (see `docs/security.md`):
  - `PHONE_HASH_KEY` (>= 32 random chars; `openssl rand -hex 32`). Required only when `FEATURE_CONTACT_MATCH=true`; with the feature on and no (or a short) key the server **refuses to start**. The legacy `PHONE_HASH_PEPPER` is still read, but a 16–31 char pepper is now rejected: lengthen it or set the new key (this invalidates stored hashes: students re-enter their number).
  - `RADAR_ALLOWED_HOSTS`, `FDC_ALLOWED_HOSTS` (comma lists) only if you add hosts beyond `adala.justice.gov.ma`, `www.sgg.gov.ma`, `www.fdc.ma`. All server-side fetches of those hosts now go through the SSRF guard.
  - `AI_MAX_IN_FLIGHT` (default 2) and `AI_IP_PER_MINUTE` (default 60) tune the AI-route abuse guard. Behind Tailscale Serve the per-IP limit uses the forwarded client address (`trust proxy` is already configured).
- **CSP**: the served index page now sends `Content-Security-Policy` (scripts from this origin, Google/Facebook sign-in SDKs, and the one inline theme bootstrap by hash). If you add another third-party script, add its origin in `server/utils/law/indexPage.js`.
- Service worker/PWA: rebuild the frontend; clients pick up the new bundle on the next visit.
