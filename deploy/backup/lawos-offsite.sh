#!/usr/bin/env bash
# Encrypts a finished local snapshot with age and uploads it to an rclone remote (Cloudflare R2).
#   lawos-offsite.sh <dated-snapshot-dir>      e.g. /srv/lawos-backups/2026-10-13
# Objects (names carry only the date, never file names):
#   core-<date>.tar.age     anythingllm.db + server.env + MANIFEST.json   every night
#   storage-<date>.tar.age  uploaded originals                            weekly (Sunday), opt-in, size-capped
# Configuration (from /etc/default/lawos-backup):
#   AGE_RECIPIENT            required. age public key(s) "age1..." (space separated for several). The matching
#                            PRIVATE key never lives on this server: keep it offline (password manager + paper).
#   RCLONE_REMOTE            required. e.g. r2:lawos-backups  (remote defined through RCLONE_CONFIG_R2_* env vars)
#   OFFSITE_KEEP_DAYS        30
#   OFFSITE_STORAGE          0; 1 also uploads the storage bundle on Sundays
#   OFFSITE_STORAGE_ANY_DAY  0; 1 ignores the Sunday rule (tests, manual runs)
#   OFFSITE_STORAGE_MAX_MB   3000. Above this the storage bundle is skipped with a warning (R2 free tier = 10 GB).
set -euo pipefail
export RCLONE_LOG_LEVEL="${RCLONE_LOG_LEVEL:-ERROR}" # no "config file not found" NOTICE noise in the journal
# Settings file: systemd loads /etc/default/lawos-backup itself; cron (the dv6 deployment) does not, so read it
# here when the caller has not exported RCLONE_REMOTE. Point LAWOS_BACKUP_ENV at a user-owned 600 file for cron.
ENV_FILE="${LAWOS_BACKUP_ENV:-/etc/default/lawos-backup}"
# shellcheck source=/dev/null
if [[ -z "${RCLONE_REMOTE:-}" && -r "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi

SNAP="${1:?usage: lawos-offsite.sh <dated-snapshot-dir>}"
SNAP="$(cd "$SNAP" && pwd -P)"
STAMP="$(basename "$SNAP")"
[[ "$STAMP" =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]] || { echo "[lawos-offsite] not a dated snapshot: $SNAP" >&2; exit 1; }

: "${AGE_RECIPIENT:?AGE_RECIPIENT is required (an age public key, age1...)}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is required (e.g. r2:lawos-backups)}"
KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
MAX_MB="${OFFSITE_STORAGE_MAX_MB:-3000}"
log() { echo "[lawos-offsite] $*"; }

AGE_ARGS=()
for r in $AGE_RECIPIENT; do AGE_ARGS+=(-r "$r"); done
command -v age >/dev/null || { echo "[lawos-offsite] age is not installed (apt install age)" >&2; exit 1; }
command -v rclone >/dev/null || { echo "[lawos-offsite] rclone is not installed" >&2; exit 1; }
for f in anythingllm.db server.env MANIFEST.json; do
  [[ -f "$SNAP/$f" ]] || { echo "[lawos-offsite] $SNAP is missing $f" >&2; exit 1; }
done

# upload <object-name> <tar args...>: tar | age | rclone rcat into a hidden .partial object, verify the stored
# size equals what was sent, then rename it. A failed or truncated upload is never visible under its real name.
upload() {
  local name="$1"; shift
  local part=".$name.partial" sizefile remote_size sent
  sizefile="$(mktemp)"
  if ! tar -C "$SNAP" -cf - "$@" | age "${AGE_ARGS[@]}" | tee >(wc -c >"$sizefile") | rclone rcat "$RCLONE_REMOTE/$part"; then
    rclone deletefile "$RCLONE_REMOTE/$part" 2>/dev/null || true
    rm -f "$sizefile"
    echo "[lawos-offsite] upload of $name failed (partial removed)" >&2
    return 1
  fi
  for _ in $(seq 1 50); do [[ -s "$sizefile" ]] && break; sleep 0.1; done
  sent="$(tr -d ' \n' <"$sizefile")"; rm -f "$sizefile"
  remote_size="$(rclone lsf --format s --files-only --include "$part" "$RCLONE_REMOTE" | head -1 | tr -d ' \n')"
  if [[ -z "$sent" || "$sent" -le 0 || "$sent" != "$remote_size" ]]; then
    rclone deletefile "$RCLONE_REMOTE/$part" 2>/dev/null || true
    echo "[lawos-offsite] verify failed for $name (sent=$sent stored=$remote_size)" >&2
    return 1
  fi
  rclone moveto "$RCLONE_REMOTE/$part" "$RCLONE_REMOTE/$name"
  log "uploaded $name ($sent bytes, verified)"
}

upload "core-$STAMP.tar.age" anythingllm.db server.env MANIFEST.json

if [[ "${OFFSITE_STORAGE:-0}" == "1" ]]; then
  if [[ "${OFFSITE_STORAGE_ANY_DAY:-0}" == "1" || "$(date +%u)" == "7" ]]; then
    kb="$(du -sk "$SNAP/storage" | cut -f1)"
    if (( kb > MAX_MB * 1024 )); then
      log "WARNING: skipping storage bundle: $((kb / 1024)) MB > cap ${MAX_MB} MB (raise OFFSITE_STORAGE_MAX_MB or prune)"
    else
      upload "storage-$STAMP.tar.age" storage
    fi
  fi
fi

# Retention: only our own object names, only older than KEEP_DAYS.
# Top level only (--max-depth 1); stale .partial objects from a crashed run go after one day.
rclone delete "$RCLONE_REMOTE" --max-depth 1 --min-age "${KEEP_DAYS}d" --include "core-*.tar.age" --include "storage-*.tar.age"
rclone delete "$RCLONE_REMOTE" --max-depth 1 --min-age 1d --include ".*.partial"
log "done (retention ${KEEP_DAYS} days)"
