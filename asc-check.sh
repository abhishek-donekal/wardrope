#!/usr/bin/env bash
# Wardrobe — App Store Connect status check.
# Usage: bash asc-check.sh [--full]
set -u
export ASC_TELEMETRY_DISABLED=1
ASC="/c/Users/vamsh/AppData/Local/Microsoft/WinGet/Packages/Rorkai.ASC_Microsoft.Winget.Source_8wekyb3d8bbwe/asc.exe"
APP=6779038156
VERSION_ID="25658f5f-e84b-4540-a853-2328d1674302"

echo "=== REVIEW STATUS $(date '+%Y-%m-%d %H:%M') ==="
"$ASC" review status --app "$APP" 2>&1 | python -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: print(sys.stdin.read()[:400]); sys.exit()
v=d.get('version') or {}
s=d.get('latestSubmission') or {}
print('version      :', v.get('version'), v.get('state'))
print('reviewState  :', d.get('reviewState'))
print('submission   :', s.get('id'), s.get('state'))
print('submitted    :', s.get('submittedDate'))
print('nextAction   :', d.get('nextAction'))
"

if [ "${1:-}" = "--full" ]; then
  echo
  echo "=== BLOCKERS (subscription noise filtered) ==="
  "$ASC" validate --app "$APP" --version-id "$VERSION_ID" 2>&1 | python -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: print(sys.stdin.read()[:400]); sys.exit()
for x in (d.get('blockingChecks') or []) + (d.get('warningChecks') or []):
    res = x.get('resource') or ''
    if 'subscription:' in str(res): continue
    print(' [%-7s] %-40s %s' % (x.get('severity'), x.get('id'), x.get('message')))
"
fi
