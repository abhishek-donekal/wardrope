# Free-Version Submission Checklist (build 17)

> ## ✅ SUBMITTED 2026-08-07 3:53 PM — status "Waiting for Review"
> Build **1.0.0 (17)** · Items Submitted = **1** (App Version only, zero IAPs) · Resolution Center reply posted.
> **While in review: change NOTHING in ASC.** Above all, never click "Add for Review" on the Subscriptions page.
> Everything below is the record of what was done.

**Created:** 2026-08-08 (updated after QC sweep) · **Strategy:** ship FREE (no IAP) now → client sees app live; monetization returns in an update once the Paid Apps Agreement is Active. Free Apps Agreement is already **Active** — nothing tax-related blocks this submission.

> ⚠️ **Submit BUILD 17, nothing earlier.** Build 14 was superseded by QC fixes (terms of use plan/Square reference, Info.plist permission strings, Services placeholder screens, sync route guards). Ignore builds 9–16 entirely (15 canceled, 16 canceled; 14 lacks QC fixes).

## QC sweep results (2026-08-08, all fixed in build 17)
| Item | Status |
|---|---|
| 2.3.10 screenshots — iOS status bar | ✅ fixed (all 7 product shots verified) |
| 5.1.1(iv) camera/photo purpose strings | ✅ specific wording now in Info.plist (ships in binary) |
| 5.1.1(v) account deletion | ✅ in-app row + DELETE endpoint, live-tested end-to-end today |
| AI Stylist error reviewer saw | ⚠️ build 17's fix was incomplete — see "Build 17 rejection" below |
| AI tagging (silently broken) | ✅ fixed (same retired-model root cause) |
| Terms of Use mentioned paid plans + Square | ✅ gated off iOS (was a 2.1(b)/3.1.1 reference risk) |
| Services screens = empty shells + dev-facing "configure API key" text | ✅ hidden until Places key exists; banner reworded |
| 5-profile screenshot showed "Plan: Pro" + personal email | ✅ replaced (persona row + sample data), PNG regenerated |
| Purchase-reference sweep of all iOS screens | ✅ clean (Shop tab = external physical-goods links — allowed) |
| Signup flow dead-end check | ✅ email verify has "Skip for now"; backend doesn't gate on verification |
| Vlog screen = static "Coming soon" teaser + fake "Notify me" | ✅ hidden behind VLOG_ENABLED=false |
| Friend profile screen always showed "Profile not found" | ✅ response mapping fixed |
| Barcode add showed "Added!" even when nothing saved | ✅ now checks the actual result |
| Activity feed rendered generic "did something" rows | ✅ field mapping normalized |
| Deep-link flash of purchase UI | ✅ synchronous render guards added |

## What changed in build 17 (commits `e2fca8a` + `defec59` + `fab7c86` + `6fd49ed`, pushed)
- **All purchase UI hidden on iOS** via `IAP_ENABLED` flag: no Buy Points button, no Plan & Billing row, no plan references, purchase screens route-guarded. Web/Android keep Square unchanged.
- **AI Stylist FIXED** (reviewer had seen "Stylist is taking a break"): backend was calling retired Claude models; also fixed a Vercel routing regression that 404'd the entire API, and a BOM-corrupted `ANTHROPIC_API_KEY`. Verified live: stylist returns real outfits; AI tagging model also updated.
- buy-points balance bug + subscription "Manage" crash fixed (web).
- Backend + web redeployed to production.

## Build 17 rejection → fixed 2026-08-12 (next build)
- **Stylist/lookbook/suggestions failed ~50% of the time.** `claude-sonnet-5` returns an extended-thinking
  block first, so `msg.content[0].text` raised, the exception was swallowed, and the user got
  "Stylist is taking a break" with HTTP 200 — invisible to monitoring, which is why one manual check passed.
  `backend/server.py` now extracts text block-type-aware (`_message_text`) and a failed Claude call raises
  `ClaudeUnavailable` → HTTP 503 instead of a fake success. Verified 30/30 stylist runs (n=4 and n=6) and
  10/10 lookbook recreates with zero failures.
- **Demo closet was four grey `placehold.co` boxes.** Reseeded with 11 real garment photographs stored in our
  own S3 bucket plus 3 saved looks — reproducible via `backend/seed_review_account.py`
  (`python seed_review_account.py --verify` re-checks every image URL).
- **Saved looks / lookbook recreate / listings thumbnails were base64-only**, so S3-hosted items rendered blank.
  All now fall back to `image_url`.

## YOUR STEPS in App Store Connect (in order)

### 1. Version page cleanup (critical — this caused rejection #3)
- Apps → Wardrope → iOS App 1.0 → **In-App Purchases section: REMOVE all attached IAPs** (all 9 if attached). A free submission must have ZERO IAPs attached.
- Leave the 9 products themselves alone in the IAP/Subscriptions sections (don't delete — they're for later).

### 2. Swap the build
- Version page → Build section → remove build 10 → **select build 17** (wait ~10 min after upload email for processing). NOT 9–16 — only 17 has the free-version flag.

### 3. Screenshots
- **Re-upload `screenshots/5-profile.png`** — it was regenerated today (old version showed "Plan: Pro" + a personal email; new one shows "Stylist persona: The Editor" + sample data). Replace whatever profile shot is currently in ASC.
- Other 4 iPhone shots (1-closet, 2-stylist, 3-looks, 4-add-item) are unchanged — leave if already uploaded.
- Add the 2 iPad screenshots `ipad-1-closet.png` + `ipad-2-stylist.png` (2048×2732) if not present.

### 4. App Review Information
- Sign-in: `applereview@wardrobe-demo.com` / `Review2026!Wardrobe` (LOGIN, not sign-up; account now has 11 photographed closet items and 3 saved looks so AI features demo instantly).
- Notes: paste the reply below (also goes in the Resolution Center thread).

### 5. Reply in the rejection thread + Resubmit
- iOS Submission page → reply with the message below → **Resubmit to App Review**.

## Paste-ready App Review reply
```
Hello,

Thank you for the detailed review notes. We have made the following changes
in build 17:

1. In-app purchases removed. This version of the app is entirely free —
   all references to points packs and subscription plans have been removed
   from the iOS app, no In-App Purchase products are attached to this
   submission, and no purchase functionality is present. Every feature in
   the app is available without payment. (We plan to introduce In-App
   Purchases in a future update, at which point the IAP products will be
   submitted for review together with that binary.)

2. The AI Stylist error has been fixed. The error message your reviewers
   encountered ("Stylist is taking a break") was caused by a backend
   configuration issue, which has been resolved and verified. The demo
   account below has a pre-populated closet so the stylist can be tested
   immediately.

Demo account (please LOG IN rather than creating an account):
  Email: applereview@wardrobe-demo.com
  Password: Review2026!Wardrobe

Suggested test flow: log in → Closet tab (11 items) → Stylist tab → request
an outfit ("a smart casual dinner outfit") → outfits are generated from the
closet items. Looks tab → Saved shows three looks already saved to the
account. Adding a new item via Profile → "Catalog a new item" demonstrates
AI tagging.

Thank you for your time and guidance.
```

## After approval (future update — do NOT do now)
1. Resolve Paid Apps Agreement (W-8BEN path on this account, or the RKD org account — see ORG-MIGRATION-RUNBOOK.md).
2. Flip `IAP_ENABLED` (remove the iOS gate in `frontend/src/lib/featureFlags.ts`), new build.
3. Attach the 9 IAPs to that version, submit together (per RESUBMIT-CHECKLIST.md).
