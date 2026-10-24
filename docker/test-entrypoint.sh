#!/usr/bin/env bash
# Verifies docker-entrypoint.sh starts the collector (puppeteer/chromium stack) only when LAWOS_COLLECTOR is not
# "off". Runs the real entrypoint against stub `node`/`npx` binaries in a sandbox; no Docker needed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
fail() { echo "[test-entrypoint] FAIL: $*" >&2; exit 1; }

# The entrypoint uses `wait -n` (bash >= 4.3; the image has it, macOS /bin/bash 3.2 does not).
BASH5=""
for b in bash /opt/homebrew/bin/bash /usr/local/bin/bash; do
  command -v "$b" >/dev/null 2>&1 || continue
  "$b" -c '[[ ${BASH_VERSINFO[0]} -gt 4 || ( ${BASH_VERSINFO[0]} -eq 4 && ${BASH_VERSINFO[1]} -ge 3 ) ]]' && { BASH5="$(command -v "$b")"; break; }
done
[[ -n "$BASH5" ]] || { echo "[test-entrypoint] SKIP: bash >= 4.3 required"; exit 77; }

mkdir -p "$W/app/server" "$W/app/collector" "$W/bin" "$W/storage"
# The entrypoint hard-codes /app; point it at the sandbox.
sed "s#/app/#$W/app/#g" "$HERE/docker-entrypoint.sh" >"$W/entrypoint.sh"
cat >"$W/bin/node" <<STUB
#!/usr/bin/env bash
echo "node \$*" >>"$W/calls.log"
STUB
cat >"$W/bin/npx" <<STUB
#!/usr/bin/env bash
echo "npx \$*" >>"$W/calls.log"
STUB
chmod +x "$W/bin/node" "$W/bin/npx"

run() { : >"$W/calls.log"; env -i PATH="$W/bin:/usr/bin:/bin" STORAGE_DIR="$W/storage" "$@" "$BASH5" "$W/entrypoint.sh" >/dev/null 2>&1 || true; sleep 0.3; }

run LAWOS_COLLECTOR=off
grep -q "app/server/index.js" "$W/calls.log" || fail "server did not start with the collector off"
grep -q "collector" "$W/calls.log" && fail "collector started although LAWOS_COLLECTOR=off"

run
grep -q "app/collector/index.js" "$W/calls.log" || fail "collector must still start by default (upstream behaviour)"

run LAWOS_COLLECTOR=on
grep -q "app/collector/index.js" "$W/calls.log" || fail "collector did not start with LAWOS_COLLECTOR=on"

run LAWOS_COLLECTOR=OFF
grep -q "collector" "$W/calls.log" && fail "LAWOS_COLLECTOR=OFF (uppercase) must also disable it"

echo "[test-entrypoint] PASS"
