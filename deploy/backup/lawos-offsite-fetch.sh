#!/usr/bin/env bash
# Downloads and decrypts an offsite snapshot into a tree that lawos-restore.sh accepts.
#   AGE_IDENTITY=/path/to/age-key.txt lawos-offsite-fetch.sh <dest-dir> [YYYY-MM-DD]
# Without a date, the newest core bundle is used, plus the newest storage bundle that is not newer than it.
# The age PRIVATE key is needed only here (restore day / restore drill); keep it off the server otherwise.
# Prints the snapshot directory on the last line.
set -euo pipefail
export RCLONE_LOG_LEVEL="${RCLONE_LOG_LEVEL:-ERROR}" # no "config file not found" NOTICE noise in the journal
umask 077 # decrypted database and server.env must not be world-readable
# Settings file: systemd loads /etc/default/lawos-backup itself; cron (the dv6 deployment) does not, so read it
# here when the caller has not exported RCLONE_REMOTE. Point LAWOS_BACKUP_ENV at a user-owned 600 file for cron.
ENV_FILE="${LAWOS_BACKUP_ENV:-/etc/default/lawos-backup}"
# shellcheck source=/dev/null
if [[ -z "${RCLONE_REMOTE:-}" && -r "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi

DEST="${1:?usage: lawos-offsite-fetch.sh <dest-dir> [YYYY-MM-DD]}"
WANT="${2:-}"
: "${AGE_IDENTITY:?AGE_IDENTITY must point at the age private key file}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is required}"
[[ -r "$AGE_IDENTITY" ]] || { echo "[offsite-fetch] cannot read $AGE_IDENTITY" >&2; exit 1; }
log() { echo "[offsite-fetch] $*" >&2; }

names() { rclone lsf --files-only --include "$1" "$RCLONE_REMOTE" | sort; }

if [[ -n "$WANT" ]]; then
  [[ "$WANT" =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]] || { echo "[offsite-fetch] bad date $WANT" >&2; exit 1; }
  CORE="core-$WANT.tar.age"
else
  CORE="$(names 'core-*.tar.age' | tail -1)"
fi
[[ "$CORE" =~ ^core-20[0-9]{2}-[0-9]{2}-[0-9]{2}\.tar\.age$ ]] || { echo "[offsite-fetch] no valid core bundle on $RCLONE_REMOTE (got '${CORE}')" >&2; exit 1; }
[[ -n "$CORE" ]] || { echo "[offsite-fetch] no core bundle on $RCLONE_REMOTE" >&2; exit 1; }
STAMP="${CORE#core-}"; STAMP="${STAMP%.tar.age}"
OUT="$DEST/$STAMP"
[[ ! -e "$OUT" ]] || { echo "[offsite-fetch] refusing: $OUT exists" >&2; exit 1; }
mkdir -p "$OUT"
cleanup() { local rc=$?; [[ $rc -eq 0 ]] || rm -rf "$OUT"; exit "$rc"; }
trap cleanup EXIT

# Only the named members are extracted, so one bundle can never overwrite another bundle's files, and nothing
# keeps the archive's owner (this runs as root under sudo).
fetch_into() { local obj="$1"; shift; rclone cat "$RCLONE_REMOTE/$obj" | age -d -i "$AGE_IDENTITY" | tar -xf - --no-same-owner -C "$OUT" "$@"; }

log "core bundle $CORE"
fetch_into "$CORE" anythingllm.db server.env MANIFEST.json

STORAGE=""
while read -r s; do
  d="${s#storage-}"; d="${d%.tar.age}"
  [[ "$d" > "$STAMP" ]] || STORAGE="$s"
done < <(names 'storage-*.tar.age')
if [[ -n "$STORAGE" ]]; then
  log "storage bundle $STORAGE"
  fetch_into "$STORAGE" storage
else
  log "WARNING: no storage bundle: uploaded originals are NOT restored (database only)"
fi
mkdir -p "$OUT/storage"
echo "$OUT"
