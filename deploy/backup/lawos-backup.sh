#!/usr/bin/env bash
# LAW-OS nightly backup (runs on tayebhomeserver via lawos-backup.timer).
# 1. Consistent SQLite snapshot through the online backup API, inside the running container.
# 2. Hardlinked incremental copy of storage (originals are immutable, so unchanged files cost no space).
# 3. MANIFEST.json with the DB fingerprint, used by test-restore.sh.
# The MacBook then pulls BACKUP_ROOT over Tailscale (macos/lawos-backup-pull.sh); that is the second location.
set -euo pipefail
# Settings file: systemd loads /etc/default/lawos-backup itself; cron (the dv6 deployment) does not, so read it
# here when the caller has not exported RCLONE_REMOTE. Point LAWOS_BACKUP_ENV at a user-owned 600 file for cron.
ENV_FILE="${LAWOS_BACKUP_ENV:-/etc/default/lawos-backup}"
# shellcheck source=/dev/null
if [[ -z "${RCLONE_REMOTE:-}" && -r "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi

LAWOS_DATA_DIR="${LAWOS_DATA_DIR:-/srv/lawos}"
BACKUP_ROOT="${BACKUP_ROOT:-/srv/lawos-backups}"
CONTAINER="${LAWOS_CONTAINER:-lawos}"
KEEP_DAYS="${KEEP_DAYS:-14}"
LAWOS_UID="${LAWOS_UID:-1000}"
LAWOS_GID="${LAWOS_GID:-1000}"

STAMP="$(date +%F)"
DEST="$BACKUP_ROOT/$STAMP"
STAGING_HOST="$LAWOS_DATA_DIR/storage/law/.backup-staging"
STAGING_CTR="/app/server/storage/law/.backup-staging"

log() { echo "[lawos-backup] $*"; }

mkdir -p "$BACKUP_ROOT" "$STAGING_HOST"
chown "$LAWOS_UID:$LAWOS_GID" "$STAGING_HOST" # the container user writes the snapshot here
TMP="$BACKUP_ROOT/.in-progress-$STAMP"
rm -rf "$TMP"
mkdir -p "$TMP"

# 1. DB snapshot (fails loudly if the container is down: a backup that silently skips the DB is worse than none)
log "snapshotting database"
FINGERPRINT="$(docker exec "$CONTAINER" node /app/server/utils/law/scripts/dbSnapshot.js backup \
  /app/server/storage/anythingllm.db "$STAGING_CTR/anythingllm.db")"
mv "$STAGING_HOST/anythingllm.db" "$TMP/anythingllm.db"

# 2. Storage files. Excludes live DB files (snapshotted above) and rebuildable indexes (spec §4.3).
PREV="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' ! -name "$STAMP" | sort | tail -1 || true)"
LINK_DEST=()
[[ -n "$PREV" ]] && LINK_DEST=(--link-dest="$PREV/storage")
log "copying storage (link-dest: ${PREV:-none})"
rsync -a --delete "${LINK_DEST[@]}" \
  --exclude '/anythingllm.db*' \
  --exclude '/lancedb/' \
  --exclude '/vector-cache/' \
  --exclude '/tmp/' \
  --exclude '/law/fts.db*' \
  --exclude '/law/uploads-tmp/' \
  --exclude '/law/.backup-staging/' \
  "$LAWOS_DATA_DIR/storage/" "$TMP/storage/"

# Secrets needed to decrypt upstream-encrypted values after a restore.
install -m 600 "$LAWOS_DATA_DIR/server.env" "$TMP/server.env"

cat > "$TMP/MANIFEST.json" <<EOF
{"createdAt":"$(date -Is)","host":"$(hostname)","db":$FINGERPRINT,"dbSha256":"$(sha256sum "$TMP/anythingllm.db" | cut -d' ' -f1)"}
EOF

rm -rf "$DEST"
mv "$TMP" "$DEST"
ln -sfn "$STAMP" "$BACKUP_ROOT/latest" # relative, so it stays valid in the MacBook mirror
# Let the SSH user the MacBook pulls as read everything (server.env is 600).
if [[ -n "${BACKUP_OWNER:-}" ]]; then
  chown -R "$BACKUP_OWNER" "$DEST"
  chown -h "$BACKUP_OWNER" "$BACKUP_ROOT/latest"
  chown "$BACKUP_OWNER" "$BACKUP_ROOT"
fi
chmod 700 "$BACKUP_ROOT"
log "done: $DEST ($(du -sh "$DEST" | cut -f1) apparent)"

# Retention: keep the newest KEEP_DAYS dated snapshots.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' | sort | head -n -"$KEEP_DAYS" | while read -r old; do
  log "pruning $old"
  rm -rf "$old"
done

# Offsite copy (encrypted, Cloudflare R2). The local snapshot above is already complete and pruned, so an
# offsite failure never costs a local backup; it does fail this unit so systemd/journal show it.
if [[ -n "${AGE_RECIPIENT:-}" && -n "${RCLONE_REMOTE:-}" ]]; then
  "$(dirname "$0")/lawos-offsite.sh" "$DEST" || { log "OFFSITE FAILED: local backup is fine, offsite copy is missing"; exit 1; }
elif [[ "${OFFSITE_REQUIRED:-0}" == "1" ]]; then
  log "OFFSITE REQUIRED but AGE_RECIPIENT/RCLONE_REMOTE are not set (looked in $ENV_FILE)"; exit 1
else
  log "offsite disabled (set AGE_RECIPIENT and RCLONE_REMOTE in $ENV_FILE)"
fi
