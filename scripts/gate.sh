#!/usr/bin/env bash
# Phase gate. Usage: scripts/gate.sh [--quick]   (--quick skips build + jest)
# Runtime: Node 24 (local default node 26 crashes upstream deps).
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${GATE_BASE:-gate-base}"   # phase-start ref (local tag); new/modified lines are measured against it
fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fail=1; }
N="npx -y node@24"

git rev-parse --verify -q "$BASE^{commit}" >/dev/null || { echo "GATE FAIL: base ref '$BASE' not found (set GATE_BASE or create tag gate-base)"; exit 1; }

changed() { { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u | grep -E "$1" | while read -r f; do [ -f "$f" ] && echo "$f"; done; }
# added lines of a file vs BASE; whole file when untracked or new since BASE
added() {
  if git cat-file -e "$BASE:$1" 2>/dev/null; then git diff -U0 "$BASE" -- "$1" | grep -E '^\+[^+]' | sed 's/^+//'; else cat "$1"; fi
}
export LC_ALL=en_US.UTF-8
scan() { # scan <file-regex> <excluded-path-regex> <content-regex>
  for f in $(changed "$1"); do
    echo "$f" | grep -qE "$2" && continue
    added "$f" | grep -E "$3" | sed "s|^|$f: |"
  done
}

echo "== brand-string (rule 3): no hard-coded product names outside brand.js"
hits=$(scan '^(frontend/src|server/(utils|endpoints|models))/.*\.(jsx?)$' 'config/brand\.js|/brand\.js$|locales/' '(^|[^A-Za-z0-9_؀-ۿ])([Qq]anouni|Rafiq|RAFIQ|LAW-OS|رفيق)($|[^A-Za-z0-9_؀-ۿ])' | grep -vE "locales/qanouni|/lawos/|lawos-")
[ -z "$hits" ] && ok brand-string || { echo "$hits"; bad brand-string; }

echo "== physical-css (rule 4): logical CSS only in added lines"
hits=$(scan '^frontend/src/.*\.(jsx|css)$' '^$' '(^|[^a-zA-Z0-9_.])-?(ml|mr|pl|pr|left|right)-[0-9a-z\[]|(^|[^a-zA-Z0-9_.])-?(text-left|text-right|float-left|float-right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)($|[^a-zA-Z0-9_-])|(margin|padding|border)-(left|right)[ ]*:|(^|[;{ ])(left|right)[ ]*:[ ]*[0-9a-z-]' )
[ -z "$hits" ] && ok physical-css || { echo "$hits"; bad physical-css; }

echo "== fixed-utc-offset: no hard-coded +01:00 / UTC+1 day math in server/utils/law"
hits=$(grep -rnE 'UTC\+0?[0-9]|[+-]0[01]:00|getTimezoneOffset|Etc/GMT|3600 *\* *1000 *\* *[01]\b|60 *\* *60 *\* *1000 *\* *[01]\b' server/utils/law server/endpoints/law --include='*.js' 2>/dev/null | grep -vE '^server/utils/law/time\.js:' | head)
[ -z "$hits" ] && ok fixed-utc-offset || { echo "$hits"; bad fixed-utc-offset; }

echo "== idb-destructive-upgrade: IndexedDB upgrade must never delete stores"
if grep -rqE 'deleteObjectStore' frontend/src frontend/public 2>/dev/null; then bad idb-destructive-upgrade; else ok idb-destructive-upgrade; fi

echo "== device-owner-wipe: sign-in as a different account must wipe the previous account's offline data"
if grep -q 'OWNER_KEY' frontend/src/components/LawOS/lib/session.js && grep -q 'previousId !== String(user.id)' frontend/src/components/LawOS/lib/session.js; then ok device-owner-wipe; else bad device-owner-wipe; fi

echo "== prefs-snapshot-push: preference writes always carry the device snapshot"
if grep -q '\.\.\.snapshot()' frontend/src/components/LawOS/lib/prefsSync.js && ! grep -rq 'Law.updatePreferences' frontend/src/components/LawOS/Settings/DevicePrefs.jsx frontend/src/components/LawOS/Settings/LanguagePicker.jsx; then ok prefs-snapshot-push; else bad prefs-snapshot-push; fi

echo "== onboarding-server-authoritative: the wizard gate trusts the server, never a device-wide flag"
if grep -q 'isOnboarded' frontend/src/components/LawOS/Shell/index.jsx; then bad onboarding-server-authoritative; else ok onboarding-server-authoritative; fi

echo "== no-createmany: Prisma 5.3 + SQLite has no createMany (use a transaction of creates)"
if grep -rqE '\.createMany\(' server/models/law*.js server/utils/law server/endpoints/law 2>/dev/null; then bad no-createmany; else ok no-createmany; fi

echo "== pdf-no-arabic-shaping: LAW-OS code must not use a PDF lib without Arabic shaping (upstream agents may)"
pdfre='(pdf-lib|pdfkit|jspdf|pdfmake|@react-pdf)'
# Single exempt file (exact path): jobs/pdfPages.js only copies pages into smaller PDFs for vision windows. It hands
# out a handle with pageCount/sub() only, and no LAW-OS file may draw text or embed fonts (L-0006).
PDFPAGES=server/utils/law/jobs/pdfPages.js
LAWSRV="server/utils/law server/endpoints/law server/models"
pdfimports=$( { grep -rlE "['\"]${pdfre}[/'\"]" server/utils/law server/endpoints/law server/models/law*.js frontend/src/components/LawOS frontend/src/pages/LawOS 2>/dev/null || true; } | grep -vxF "$PDFPAGES" || true)
pdfdrawing=$(grep -rnE 'drawText|embedFont|embedStandardFont|setFont|StandardFonts|fontkit|embedPng|embedJpg' $LAWSRV --include='*.js' 2>/dev/null | grep -vE '/__tests__/' | grep -E 'server/utils/law|server/endpoints/law|server/models/law' || true)
if [ -n "$pdfimports" ] || [ -n "$pdfdrawing" ] \
   || git diff "$BASE" -- server/package.json frontend/package.json | grep -E '^\+' | grep -qE "\"${pdfre}\""; then
  echo "$pdfimports"; echo "$pdfdrawing"
  bad pdf-no-arabic-shaping
else ok pdf-no-arabic-shaping; fi

echo "== ui-hex: no hard-coded colours in LAW-OS components (tokens only; avatar art, mascot, social-login brand colours, user subject palette and print view are documented exceptions)"
hits=$(grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/components/LawOS frontend/src/pages/LawOS --include='*.jsx' --include='*.js' --include='*.css' 2>/dev/null | grep -vE 'LawOS/avatar/|MascotRafiq\.jsx|Auth/(Google|Facebook)Button\.jsx|SubjectForm\.jsx|PathPrint\.jsx|^[^:]*:[0-9]+:\s*(//|\*|/\*)' | head)
[ -z "$hits" ] && ok ui-hex || { echo "$hits"; bad ui-hex; }

echo "== game-terms: no game vocabulary or emoji in LAW-OS UI strings"
hits=$(grep -rniP '(🔥|👑|🎉|🏆|⭐|🏅)|tr\("[^"]*\b(XP|boss|crowns?|checkpoint|streak|level up)\b|>\s*XP\s*<' frontend/src/components/LawOS frontend/src/pages/LawOS --include='*.jsx' 2>/dev/null | head)
[ -z "$hits" ] && ok game-terms || { echo "$hits"; bad game-terms; }

echo "== arrow-glyph: no typed arrows in LAW-OS strings (use components/LawOS/kit/DirArrow so they mirror in RTL/LTR)"
hits=$(grep -rnE '[←→]' frontend/src/components/LawOS frontend/src/pages/LawOS --include='*.jsx' 2>/dev/null | grep -vE 'DirArrow\.jsx|^[^:]*:[0-9]+:\s*(//|\*|/\*|\{/\*)|Profile → scan' | head)
[ -z "$hits" ] && ok arrow-glyph || { echo "$hits"; bad arrow-glyph; }

echo "== browser a11y/consent e2e (axe matrix + consent flow): runs only when E2E_URL, E2E_PUPPETEER and AXE_PATH are set"
if [ -n "${E2E_URL:-}" ] && [ -n "${E2E_PUPPETEER:-}" ] && [ -n "${AXE_PATH:-}" ]; then
  $N deploy/e2e/rc2-a11y.cjs "$E2E_PUPPETEER" "$E2E_URL" >/tmp/gate-a11y.log 2>&1 && $N deploy/e2e/rc2-consent.cjs "$E2E_PUPPETEER" "$E2E_URL" >>/tmp/gate-a11y.log 2>&1 && ! grep -q '^FAIL' /tmp/gate-a11y.log && ok e2e-a11y || { tail -30 /tmp/gate-a11y.log; bad e2e-a11y; }
else
  echo "  SKIP e2e-a11y (no running server: set E2E_URL, E2E_PUPPETEER, AXE_PATH, CHROME_BIN; rc2-findings.md records the last run)"
fi

echo "== offsite-backup: age + rclone round trip, wrong key, retention, size cap (needs age and rclone; no Docker)"
bash deploy/backup/test-offsite.sh >/tmp/gate-offsite.log 2>&1; rc=$?
if [ $rc = 0 ]; then ok offsite-backup; elif [ $rc = 77 ]; then echo "  SKIP offsite-backup (install age and rclone)"; else tail -10 /tmp/gate-offsite.log; bad offsite-backup; fi

echo "== entrypoint: collector only starts unless LAWOS_COLLECTOR=off (stubbed, no Docker)"
bash docker/test-entrypoint.sh >/tmp/gate-entrypoint.log 2>&1; rc=$?
if [ $rc = 0 ]; then ok entrypoint-collector; elif [ $rc = 77 ]; then echo "  SKIP entrypoint-collector (needs bash >= 4.3)"; else tail -5 /tmp/gate-entrypoint.log; bad entrypoint-collector; fi

echo "== prisma validate"
(cd server && $N ../node_modules/.bin/prisma validate >/dev/null 2>&1 || $N node_modules/.bin/prisma validate >/dev/null 2>&1) && ok prisma-validate || bad prisma-validate

echo "== migrations-applied: the dev DB (server/storage/anythingllm.db) has no pending Prisma migrations"
if [ -f server/storage/anythingllm.db ]; then
  ms=$(cd server && $N node_modules/.bin/prisma migrate status 2>&1)
  echo "$ms" | grep -q "Database schema is up to date" && ok migrations-applied || { echo "$ms" | tail -8; bad migrations-applied; }
else echo "  SKIP migrations-applied (no dev DB)"; fi

echo "== brain-check"
$N scripts/brain-check.mjs && ok brain-check || bad brain-check

if [ "${1:-}" != "--quick" ]; then
  echo "== frontend build"
  VITE_API_BASE=/api $N "$(command -v yarn)" --cwd frontend build >/tmp/gate-build.log 2>&1 && ok build || { tail -20 /tmp/gate-build.log; bad build; }
  echo "== jest (LAW-OS)"
  $N node_modules/.bin/jest server/__tests__/law server/__tests__/utils/law server/__tests__/models >/tmp/gate-jest.log 2>&1 && ok jest || { grep -E '●|Tests:' /tmp/gate-jest.log | head; bad jest; }
fi
[ $fail = 0 ] && echo "GATE PASS" || { echo "GATE FAIL"; exit 1; }
