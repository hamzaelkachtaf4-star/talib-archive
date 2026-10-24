#!/usr/bin/env bash
# Installs the LAW-OS backup pull job on the MacBook. Re-run after editing the script.
# Copies the script out of ~/Documents because launchd jobs cannot read there without Full Disk Access.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/Library/Application Support/lawos"
PLIST="$HOME/Library/LaunchAgents/com.lawos.backup-pull.plist"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
install -m 755 "$HERE/lawos-backup-pull.sh" "$APP_DIR/lawos-backup-pull.sh"
# Where to pull from. Override when running, e.g.:
#   LAWOS_HOST=100.109.58.54 LAWOS_SSH_USER=tayeb REMOTE_ROOT=/home/tayeb/lawos-backups ./install-macos.sh
LAWOS_HOST="${LAWOS_HOST:-tayebhomeserver}"
LAWOS_SSH_USER="${LAWOS_SSH_USER:-$USER}"
REMOTE_ROOT="${REMOTE_ROOT:-/srv/lawos-backups}"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$LAWOS_SSH_USER@$LAWOS_HOST" true \
  || { echo "Cannot SSH to $LAWOS_SSH_USER@$LAWOS_HOST without a password; fix that first." >&2; exit 1; }
sed -e "s|__HOME__|$HOME|g" -e "s|__LAWOS_HOST__|$LAWOS_HOST|g" -e "s|__LAWOS_SSH_USER__|$LAWOS_SSH_USER|g" -e "s|__REMOTE_ROOT__|$REMOTE_ROOT|g" \
  "$HERE/com.lawos.backup-pull.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Logs: ~/Library/Logs/lawos-backup-pull.log  Backups: ~/LAW-OS-Backups"
echo "Run now: launchctl kickstart -k gui/$(id -u)/com.lawos.backup-pull"
