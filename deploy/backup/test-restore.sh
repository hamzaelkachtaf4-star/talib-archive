#!/usr/bin/env bash
# Phase 0 acceptance: "a backup restores onto a clean container".
# Restores the latest backup into a throwaway dir, boots a second container from the same image on
# 127.0.0.1:3099 with its own volume, waits for /api/law/health, and compares the DB fingerprint
# against MANIFEST.json. Tears everything down afterwards. Production is never touched.
#   test-restore.sh [backup-dir]     local snapshot (default: latest)
#   test-restore.sh --offsite        fetch + decrypt the newest snapshot from R2 first (the real disaster path);
#                                    needs RCLONE_REMOTE and AGE_IDENTITY=/path/to/age-private-key
set -euo pipefail

MODE_OFFSITE=0
if [[ "${1:-}" == "--offsite" ]]; then MODE_OFFSITE=1; shift; fi
BACKUP="${1:-${BACKUP_ROOT:-/srv/lawos-backups}/latest}"
IMAGE="${LAWOS_IMAGE:-lawos:latest}"
PORT="${TEST_PORT:-3099}"
NAME="lawos-restore-test"
LAWOS_UID="${LAWOS_UID:-1000}"
LAWOS_GID="${LAWOS_GID:-1000}"
WORK="$(mktemp -d /tmp/lawos-restore-XXXX)"
HERE="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if [[ "$MODE_OFFSITE" == 1 ]]; then
  echo "[test-restore] fetching newest offsite snapshot from ${RCLONE_REMOTE:?RCLONE_REMOTE is required for --offsite}"
  BACKUP="$("$HERE/lawos-offsite-fetch.sh" "$WORK/offsite" | tail -1)"
fi

echo "[test-restore] restoring $BACKUP"
"$HERE/lawos-restore.sh" "$BACKUP" "$WORK/data"
chown -R "$LAWOS_UID:$LAWOS_GID" "$WORK/data"

echo "[test-restore] starting $NAME on 127.0.0.1:$PORT"
docker run -d --name "$NAME" \
  --user "$LAWOS_UID:$LAWOS_GID" \
  -p "127.0.0.1:$PORT:3001" \
  -m 1536m \
  -e STORAGE_DIR=/app/server/storage \
  -e TZ=Africa/Casablanca \
  -v "$WORK/data/server.env:/app/server/.env" \
  -v "$WORK/data/storage:/app/server/storage" \
  -v "$WORK/data/collector/hotdir:/app/collector/hotdir" \
  -v "$WORK/data/collector/outputs:/app/collector/outputs" \
  "$IMAGE" >/dev/null

status=""
for _ in $(seq 1 60); do
  status="$(curl -fsS "http://127.0.0.1:$PORT/api/law/health" 2>/dev/null | grep -o '"status":"[a-z]*"' | cut -d'"' -f4 || true)"
  [[ "$status" == "ok" ]] && break
  sleep 3
done
if [[ "$status" != "ok" ]]; then
  echo "[test-restore] FAIL: health=$status"
  docker logs --tail 50 "$NAME"
  exit 1
fi

expected="$(grep -o '"counts":{[^}]*}' "$BACKUP/MANIFEST.json")"
actual="$(docker exec "$NAME" node /app/server/utils/law/scripts/dbSnapshot.js stats /app/server/storage/anythingllm.db | grep -o '"counts":{[^}]*}')"
if [[ "$expected" != "$actual" ]]; then
  echo "[test-restore] FAIL: fingerprint mismatch"
  echo "  expected $expected"
  echo "  actual   $actual"
  exit 1
fi

echo "[test-restore] PASS: health ok, fingerprint $actual"
