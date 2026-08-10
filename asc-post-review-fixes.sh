#!/usr/bin/env bash
# Wardrobe — fixes to run the MOMENT the current review finishes (approved or rejected).
# These CANNOT be run now: the app's only appInfo is in WAITING_FOR_REVIEW, so any
# edit would mutate the record Apple is actively reviewing.
#
# Usage: bash asc-post-review-fixes.sh          (dry run — prints what would change)
#        bash asc-post-review-fixes.sh --apply  (actually applies)
set -u
export ASC_TELEMETRY_DISABLED=1
ASC="/c/Users/vamsh/AppData/Local/Microsoft/WinGet/Packages/Rorkai.ASC_Microsoft.Winget.Source_8wekyb3d8bbwe/asc.exe"
APP=6779038156
APPLY="${1:-}"

echo "=== guard: refuse to run while in review ==="
STATE=$("$ASC" review status --app "$APP" 2>/dev/null | python -c "import sys,json;print((json.load(sys.stdin).get('version') or {}).get('state',''))" 2>/dev/null)
echo "version state: $STATE"
if [ "$STATE" = "WAITING_FOR_REVIEW" ] || [ "$STATE" = "IN_REVIEW" ]; then
  echo "STILL IN REVIEW — aborting. Re-run after Apple responds."
  exit 1
fi

# ---------------------------------------------------------------------------
# FIX 1 — age rating: the two new social-media fields (Apple requires them for
# new apps; deadline 2026-09-07). Values reflect the app as shipped in build 17:
#   friends + activity feed + shared closets exist  -> socialMedia = true
#   no age gate on those features                   -> socialMediaAgeRestricted = false
# Every other declaration value is left untouched (already accepted at 4+).
# NOTE: setting socialMedia=true may raise the App Store age rating above 4+.
#       Confirm with the client before applying if the 4+ rating matters.
# ---------------------------------------------------------------------------
echo
echo "=== FIX 1: age rating social-media fields ==="
if [ "$APPLY" = "--apply" ]; then
  "$ASC" age-rating edit --app "$APP" --social-media true --social-media-age-restricted false
else
  echo "DRY RUN: asc age-rating edit --app $APP --social-media true --social-media-age-restricted false"
fi

echo
echo "=== verify ==="
"$ASC" validate --app "$APP" --version-id "25658f5f-e84b-4540-a853-2328d1674302" 2>&1 | python -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: print(sys.stdin.read()[:300]); sys.exit()
print('summary:', json.dumps(d.get('summary')))
for x in (d.get('blockingChecks') or []):
    print(' [error]', x.get('id'), x.get('message'))
"

# ---------------------------------------------------------------------------
# LATER — only when the paid/IAP version is submitted, NOT for the free build:
#   * Append a Terms of Use link to the description (required for subscription review):
#       Terms of Use: https://whatsinmywardrobe.com/terms
#   * Upload a promotional image per subscription (optional; only needed for
#     App Store promotion, offer codes, or win-back offers).
#   * Subscriptions must be attached via the ASC *web* version page the first
#     time — the API cannot do the first submission.
# ---------------------------------------------------------------------------
