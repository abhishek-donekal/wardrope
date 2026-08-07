# Free-Version Submission Checklist (build 14)
**Created:** 2026-08-08 · **Strategy:** ship FREE (no IAP) now → client sees app live; monetization returns in an update once the Paid Apps Agreement is Active. Free Apps Agreement is already **Active** — nothing tax-related blocks this submission.

## What changed in build 14 (all committed `e2fca8a`, pushed)
- **All purchase UI hidden on iOS** via `IAP_ENABLED` flag: no Buy Points button, no Plan & Billing row, no plan references, purchase screens route-guarded. Web/Android keep Square unchanged.
- **AI Stylist FIXED** (reviewer had seen "Stylist is taking a break"): backend was calling retired Claude models; also fixed a Vercel routing regression that 404'd the entire API, and a BOM-corrupted `ANTHROPIC_API_KEY`. Verified live: stylist returns real outfits; AI tagging model also updated.
- buy-points balance bug + subscription "Manage" crash fixed (web).
- Backend + web redeployed to production.

## YOUR STEPS in App Store Connect (in order)

### 1. Version page cleanup (critical — this caused rejection #3)
- Apps → Wardrope → iOS App 1.0 → **In-App Purchases section: REMOVE all attached IAPs** (all 9 if attached). A free submission must have ZERO IAPs attached.
- Leave the 9 products themselves alone in the IAP/Subscriptions sections (don't delete — they're for later).

### 2. Swap the build
- Version page → Build section → remove build 10 → **select build 14** (wait ~10 min after upload email for processing). NOT 10/11/12/13 — only 14 has the free-version flag.

### 3. Screenshots
- iPhone set (5, status-bar-fixed) should already be uploaded; add the 2 iPad screenshots `screenshots/ipad-1-closet.png` + `ipad-2-stylist.png` (2048×2732) if not present.
- ⚠️ Screenshots must NOT show Buy Points / Plan & Billing UI. Current 5 iPhone shots: 1-closet, 2-stylist, 3-looks, 4-add-item, 5-profile — check 5-profile.png: if it shows the Buy Points button or Plan row, drop or re-crop it (safest: submit without it; 4 shots is fine).

### 4. App Review Information
- Sign-in: `applereview@wardrobe-demo.com` / `Review2026!Wardrobe` (LOGIN, not sign-up; account now has 4 seeded closet items so AI features demo instantly).
- Notes: paste the reply below (also goes in the Resolution Center thread).

### 5. Reply in the rejection thread + Resubmit
- iOS Submission page → reply with the message below → **Resubmit to App Review**.

## Paste-ready App Review reply
```
Hello,

Thank you for the detailed review notes. We have made the following changes
in build 14:

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

Suggested test flow: log in → Closet tab (4 items) → Stylist tab → request
an outfit ("a smart casual dinner outfit") → outfits are generated from the
closet items. Adding a new item via Profile → "Catalog a new item"
demonstrates AI tagging.

Thank you for your time and guidance.
```

## After approval (future update — do NOT do now)
1. Resolve Paid Apps Agreement (W-8BEN path on this account, or the RKD org account — see ORG-MIGRATION-RUNBOOK.md).
2. Flip `IAP_ENABLED` (remove the iOS gate in `frontend/src/lib/featureFlags.ts`), new build.
3. Attach the 9 IAPs to that version, submit together (per RESUBMIT-CHECKLIST.md).
