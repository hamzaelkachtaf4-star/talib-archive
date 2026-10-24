#!/usr/bin/env bash
# Offsite pipeline test with no Docker and no network: age keys are generated here and rclone's local backend
# stands in for R2. Proves: encrypted at rest (no plaintext, no readable names), round trip is byte-identical,
# a wrong key cannot decrypt, a missing recipient fails loudly, retention only removes old backups, and the
# fetched tree is accepted by lawos-restore.sh. Exit 0 = PASS; exit 77 = SKIP (age/rclone not installed).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v age >/dev/null && command -v rclone >/dev/null || { echo "[test-offsite] SKIP: age and rclone required"; exit 77; }

W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
fail() { echo "[test-offsite] FAIL: $*" >&2; exit 1; }

age-keygen -o "$W/id.txt" 2>/dev/null
age-keygen -o "$W/other.txt" 2>/dev/null
REC="$(age-keygen -y "$W/id.txt")"

# A snapshot shaped like lawos-backup.sh's output.
SNAP="$W/backups/2026-10-13"
mkdir -p "$SNAP/storage/law/assets"
head -c 200000 /dev/urandom >"$SNAP/anythingllm.db"
echo "SECRET_KEY_PLAINTEXT_MARKER" >"$SNAP/server.env"
echo "lecture-audio-bytes" >"$SNAP/storage/law/assets/a.webm"
DBSHA="$(shasum -a 256 "$SNAP/anythingllm.db" | cut -d' ' -f1)"
echo "{\"createdAt\":\"x\",\"db\":{\"counts\":{\"t\":1}},\"dbSha256\":\"$DBSHA\"}" >"$SNAP/MANIFEST.json"

export RCLONE_REMOTE=":local:$W/remote"
export RCLONE_CONFIG="$W/rclone.conf" RCLONE_LOG_LEVEL=ERROR
export AGE_RECIPIENT="$REC"
mkdir -p "$W/remote"

# 1. Missing recipient fails loudly and uploads nothing.
if AGE_RECIPIENT="" "$HERE/lawos-offsite.sh" "$SNAP" >/dev/null 2>&1; then fail "ran without AGE_RECIPIENT"; fi
[[ -z "$(ls -A "$W/remote")" ]] || fail "uploaded without a recipient"

# 2. Upload (core bundle always; storage bundle when asked).
OFFSITE_STORAGE=1 OFFSITE_STORAGE_ANY_DAY=1 "$HERE/lawos-offsite.sh" "$SNAP"
[[ -f "$W/remote/core-2026-10-13.tar.age" ]] || fail "core bundle missing"
[[ -f "$W/remote/storage-2026-10-13.tar.age" ]] || fail "storage bundle missing"
grep -rl "SECRET_KEY_PLAINTEXT_MARKER" "$W/remote" && fail "plaintext found offsite"
grep -rl "lecture-audio-bytes" "$W/remote" && fail "storage plaintext found offsite"
grep -rl "server.env" "$W/remote" && fail "file names leak"

# 3. Round trip through the fetch script, then through the real restore script.
AGE_IDENTITY="$W/id.txt" "$HERE/lawos-offsite-fetch.sh" "$W/fetched" >/dev/null
F="$W/fetched/2026-10-13"
cmp "$SNAP/anythingllm.db" "$F/anythingllm.db" || fail "db differs after round trip"
cmp "$SNAP/server.env" "$F/server.env" || fail "server.env differs"
cmp "$SNAP/storage/law/assets/a.webm" "$F/storage/law/assets/a.webm" || fail "storage differs"
"$HERE/lawos-restore.sh" "$F" "$W/restored" >/dev/null || fail "lawos-restore.sh rejected the fetched snapshot"
cmp "$SNAP/anythingllm.db" "$W/restored/storage/anythingllm.db" || fail "restored db differs"

# 4. The wrong key cannot read it.
if AGE_IDENTITY="$W/other.txt" "$HERE/lawos-offsite-fetch.sh" "$W/bad" >/dev/null 2>&1; then fail "decrypted with the wrong key"; fi

# 5. Retention removes only backups older than OFFSITE_KEEP_DAYS and leaves unrelated files.
touch -t 202001010000 "$W/remote/core-2020-01-01.tar.age"
echo keep >"$W/remote/notes.txt"; touch -t 202001010000 "$W/remote/notes.txt"
OFFSITE_KEEP_DAYS=30 "$HERE/lawos-offsite.sh" "$SNAP"
[[ ! -e "$W/remote/core-2020-01-01.tar.age" ]] || fail "old backup not pruned"
[[ -e "$W/remote/core-2026-10-13.tar.age" ]] || fail "current backup pruned"
[[ -e "$W/remote/notes.txt" ]] || fail "retention removed an unrelated file"

# 5b. Retention is not recursive: same-named files in subfolders are not ours to delete.
mkdir -p "$W/remote/sub"; echo x >"$W/remote/sub/core-2020-01-01.tar.age"; touch -t 202001010000 "$W/remote/sub/core-2020-01-01.tar.age"
OFFSITE_KEEP_DAYS=30 "$HERE/lawos-offsite.sh" "$SNAP"
[[ -e "$W/remote/sub/core-2020-01-01.tar.age" ]] || fail "retention recursed into a subfolder"

# 5c. Settings come from the env file when not exported (cron path: no systemd EnvironmentFile).
printf 'AGE_RECIPIENT=%s\nRCLONE_REMOTE=%s\n' "$REC" ":local:$W/remote2" >"$W/backup.env"
mkdir -p "$W/remote2"
( unset AGE_RECIPIENT RCLONE_REMOTE; LAWOS_BACKUP_ENV="$W/backup.env" "$HERE/lawos-offsite.sh" "$SNAP" ) >/dev/null
[[ -f "$W/remote2/core-2026-10-13.tar.age" ]] || fail "env file not honoured"

# 5d. A failed upload (tar cannot read a file) leaves neither a final object nor a leftover partial.
SNAP2="$W/backups/2026-10-14"; cp -R "$SNAP" "$SNAP2"; chmod 000 "$SNAP2/server.env"
if "$HERE/lawos-offsite.sh" "$SNAP2" >/dev/null 2>&1; then chmod 600 "$SNAP2/server.env"; fail "upload succeeded despite tar failure"; fi
chmod 600 "$SNAP2/server.env"
[[ ! -e "$W/remote/core-2026-10-14.tar.age" ]] || fail "truncated object published under its final name"
[[ -z "$(find "$W/remote" -maxdepth 1 -name '*partial*')" ]] || fail "partial object left behind"
AGE_IDENTITY="$W/id.txt" "$HERE/lawos-offsite-fetch.sh" "$W/after-fail" >/dev/null
[[ -d "$W/after-fail/2026-10-13" ]] || fail "fetch did not pick the newest complete backup"

# 5e. A storage bundle can never overwrite the database or server.env, and fetched files are private.
EVIL="$W/evil"; mkdir -p "$EVIL/storage"; echo EVIL >"$EVIL/anythingllm.db"; echo EVIL >"$EVIL/server.env"; echo ok >"$EVIL/storage/f"
tar -C "$EVIL" -cf - anythingllm.db server.env storage | age -r "$REC" | rclone rcat "$RCLONE_REMOTE/storage-2026-10-13.tar.age"
AGE_IDENTITY="$W/id.txt" "$HERE/lawos-offsite-fetch.sh" "$W/evilfetch" >/dev/null
cmp "$SNAP/anythingllm.db" "$W/evilfetch/2026-10-13/anythingllm.db" || fail "storage bundle overwrote the database"
cmp "$SNAP/server.env" "$W/evilfetch/2026-10-13/server.env" || fail "storage bundle overwrote server.env"
[[ "$(ls -ld "$W/evilfetch/2026-10-13" | cut -c5-10)" == "------" ]] || fail "fetched snapshot is group/world accessible"

# 6. Storage over the size cap is skipped with a warning, not uploaded.
rm -f "$W/remote/storage-2026-10-13.tar.age"
out="$(OFFSITE_STORAGE=1 OFFSITE_STORAGE_ANY_DAY=1 OFFSITE_STORAGE_MAX_MB=0 "$HERE/lawos-offsite.sh" "$SNAP" 2>&1)"
grep -qi "skipping storage" <<<"$out" || fail "no skip warning: $out"
[[ ! -e "$W/remote/storage-2026-10-13.tar.age" ]] || fail "uploaded storage above the cap"

echo "[test-offsite] PASS"
