#!/usr/bin/env bash
# Second backup location (spec §11 Phase 0): the MacBook pulls the server's dated snapshots over Tailscale SSH.
# Runs from launchd every 4 h while the Mac is awake (missed runs fire on wake). Pull, not push, so the
# server needs no credentials to the Mac and a sleeping laptop never fails a server job.
set -euo pipefail

LAWOS_HOST="${LAWOS_HOST:-tayebhomeserver}"          # Tailscale MagicDNS name
LAWOS_SSH_USER="${LAWOS_SSH_USER:-$USER}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/lawos-backups}"
LOCAL_ROOT="${LOCAL_ROOT:-$HOME/LAW-OS-Backups}"

mkdir -p "$LOCAL_ROOT"
chmod 700 "$LOCAL_ROOT"
echo "[lawos-pull] $(date -u +%FT%TZ) pulling $LAWOS_SSH_USER@$LAWOS_HOST:$REMOTE_ROOT"

# -H keeps the hardlinks between dated snapshots, so 14 days of originals cost ~1x on disk.
# --delete mirrors the server's 14-day retention. Partial transfers resume on the next run.
rsync -aH --delete --partial --timeout=120 \
  --exclude '.in-progress-*' \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=15" \
  "$LAWOS_SSH_USER@$LAWOS_HOST:$REMOTE_ROOT/" "$LOCAL_ROOT/"

latest="$(readlink "$LOCAL_ROOT/latest" 2>/dev/null || true)"
echo "[lawos-pull] ok, latest -> ${latest:-?}"
date -u +%FT%TZ > "$LOCAL_ROOT/.last-success"
