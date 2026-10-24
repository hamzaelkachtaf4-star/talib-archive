#!/usr/bin/env bash
# Restore a LAW-OS backup into a data directory.
#   lawos-restore.sh <backup-dir> <target-data-dir>
# <backup-dir> is a dated snapshot (e.g. /srv/lawos-backups/2026-10-10 or a copy pulled to the MacBook).
# The target must be empty or absent: this script never overwrites live data. To restore production:
#   docker compose -f docker/lawos.compose.yml stop lawos
#   mv /srv/lawos /srv/lawos.broken-$(date +%F)
#   deploy/backup/lawos-restore.sh /srv/lawos-backups/latest /srv/lawos
#   docker compose -f docker/lawos.compose.yml up -d
set -euo pipefail

SRC="${1:?usage: lawos-restore.sh <backup-dir> <target-data-dir>}"
TARGET="${2:?usage: lawos-restore.sh <backup-dir> <target-data-dir>}"
SRC="$(cd "$SRC" && pwd -P)"

for f in MANIFEST.json anythingllm.db server.env storage; do
  [[ -e "$SRC/$f" ]] || { echo "[lawos-restore] missing $f in $SRC" >&2; exit 1; }
done
if [[ -e "$TARGET" ]] && [[ -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  echo "[lawos-restore] refusing: $TARGET is not empty" >&2
  exit 1
fi

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d" " -f1; }

expected="$(grep -o '"dbSha256":"[0-9a-f]*"' "$SRC/MANIFEST.json" | cut -d'"' -f4)"
actual="$(sha256 "$SRC/anythingllm.db")"
[[ "$expected" == "$actual" ]] || { echo "[lawos-restore] DB checksum mismatch" >&2; exit 1; }

mkdir -p "$TARGET/storage" "$TARGET/collector/hotdir" "$TARGET/collector/outputs"
rsync -a "$SRC/storage/" "$TARGET/storage/"
cp "$SRC/anythingllm.db" "$TARGET/storage/anythingllm.db"
install -m 600 "$SRC/server.env" "$TARGET/server.env"
echo "[lawos-restore] restored $SRC -> $TARGET (FTS/vector indexes rebuild on boot or via /api/law/admin/rebuild-index)"
