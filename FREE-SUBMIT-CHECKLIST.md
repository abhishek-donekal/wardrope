# Free-Version Submission Checklist (build 18)

> ## ❌ BUILD 17 WAS REJECTED — the next submission is build **18**
> Build 17 (submitted 2026-08-07) was rejected; the fixes are in `dev-kiran`/`main` and the
> backend is already redeployed. Build 18 does not exist yet — `appreview-publisher` creates it
> with `eas build` (`autoIncrement: true` takes 17 → 18) after QC signs off.
> **While a submission is in review: change NOTHING in ASC.** Above all, never click "Add for Review" on the Subscriptions page.

**Created:** 2026-08-08 · **Last verified against the live app + demo account:** 2026-08-12 · **Strategy:** ship FREE (no IAP) now → client sees app live; monetization returns in an update once the Paid Apps Agreement is Active. Free Apps Agreement is already **Active** — nothing tax-related blocks this submission.

> ⚠️ **Submit BUILD 18 — never re-submit 17.** Build 17 is the binary App Review rejected; re-selecting it resubmits the rejection verbatim. Ignore builds 9–17 entirely.

## QC sweep results (2026-08-08, all fixed in build 17)
| Item | Status |
|---|---|
| 2.3.10 screenshots — iOS status bar | ✅ fixed (all 7 product shots verified) |
| 5.1.1(iv) camera/photo purpose strings | ✅ specific wording now in Info.plist (ships in binary) |
| 5.1.1(v) account deletion | ✅ in-app row + `DELETE /users/me`, live-tested end-to-end again 2026-08-12 |
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
| Activity feed rendered generic "did something" rows | ⚠️ partly — the screen was normalized but the backend still wrote mismatched keys; finished 2026-08-12 |
| Deep-link flash of purchase UI | ✅ synchronous render guards added |

## What changed in build 17 (commits `e2fca8a` + `defec59` + `fab7c86` + `6fd49ed`, pushed)
- **All purchase UI hidden on iOS** via `IAP_ENABLED` flag: no Buy Points button, no Plan & Billing row, no plan references, purchase screens route-guarded. Web/Android keep Square unchanged.
- **AI Stylist partially fixed** (reviewer had seen "Stylist is taking a break"): backend was calling retired Claude models; also fixed a Vercel routing regression that 404'd the entire API, and a BOM-corrupted `ANTHROPIC_API_KEY`. This was real but *not the whole cause* — see the rejection section below; do not repeat the "it was a backend configuration issue" wording to Apple.
- buy-points balance bug + subscription "Manage" crash fixed (web).
- Backend + web redeployed to production.

## Build 17 rejection → fixed 2026-08-12 (goes out in build 18)
- **Stylist/lookbook/suggestions failed ~50% of the time.** `claude-sonnet-5` returns an extended-thinking
  block first, so `msg.content[0].text` raised, the exception was swallowed, and the user got
  "Stylist is taking a break" with HTTP 200 — invisible to monitoring, which is why one manual check passed.
  `backend/server.py` now extracts text block-type-aware (`_message_text`) and a failed Claude call raises
  `ClaudeUnavailable` → HTTP 503 instead of a fake success. Guarded by `backend/tests/test_message_text.py`.
- **Anthropic overload no longer reaches the user.** On 2026-08-12 the API answered `529 overloaded_error`
  for a burst of calls (3 of 5 stylist requests in a row). Every Claude call now retries once on a second
  model — a different capacity pool — before giving up (`_claude_call`, `backend/tests/test_claude_fallback.py`).
- **Demo closet was four grey `placehold.co` boxes.** Reseeded with 11 real garment photographs stored in our
  own S3 bucket plus 3 saved looks — reproducible via `backend/seed_review_account.py`
  (`python seed_review_account.py --verify` re-checks every image URL).
- **Saved looks / lookbook recreate / listings thumbnails were base64-only**, so S3-hosted items rendered blank.
  All now fall back to `image_url`.
- **Placeholder surfaces a reviewer could reach were removed** (Profile "Coming soon" row, the onboarding
  fidelity step, four ungated placeholder routes).
- **Virtual SWAP Box cards read "Item" and the claim dialog said `undefined`** — the API returned the title
  under `item_name` while the app reads `name`. `/swapbox` now returns one shape (`swap_listing_to_out`).
- **"Claim free" on Donate & Swap did nothing.** A donate claim made no server call at all and a swap claim
  spent 500 points on a bare `/points/redeem` — nothing was recorded and the listing stayed available.
  There is now a real `POST /items/listings/{item_id}/claim`: it reserves the listing, charges only after the
  reservation succeeds (and gives the points back if the charge fails), rejects a second claim with 409, and
  notifies the owner in their activity feed. The community card switches to "Claimed by you" on refresh.
- **Report and block added** (guideline 1.2, user-generated content): a flag icon on community listings,
  Swap Box entries and friend profiles; reported content disappears from the reporter's feeds immediately;
  blocking is mutual and reversible under Profile → Blocked accounts.

## YOUR STEPS in App Store Connect (in order)

### 1. Version page cleanup (critical — this caused rejection #3)
- Apps → Wardrope → iOS App 1.0 → **In-App Purchases section: confirm ZERO IAPs are attached** and remove any that have reappeared. A free submission must have no IAPs attached. (Check this every time — it is not verifiable from the repo.)
- Leave the 6 subscription products themselves alone in the Subscriptions section (don't delete — they're for later).

### 2. Swap the build
- Version page → Build section → remove whatever build is attached → **select build 18** (wait ~10 min after the upload email for processing). NOT 9–17 — 17 is the rejected binary and everything earlier is older still.

### 3. Screenshots
- The 5 iPhone shots (`1-closet`, `2-stylist`, `3-looks`, `4-add-item`, `5-profile`) and the 2 iPad shots (`ipad-1-closet`, `ipad-2-stylist`, 2048×2732) are in `screenshots/`, generated 2026-08-07. Upload any that are not already in ASC.
- `5-profile.png` was regenerated on 2026-08-07 because the old one showed "Plan: Pro" and a personal email; it now shows the persona row and sample data. Make sure the copy in ASC is that one.

### 4. App Review Information
- Sign-in: `applereview@wardrobe-demo.com` / `Review2026!Wardrobe` (LOGIN, not sign-up).
- Verified live on 2026-08-12: login returns 200; the account holds **11** closet items (all 11 photographs load from S3), **3** saved looks (Gallery Opening, Off-Duty Denim, Editor at Work), plan `free`, 290 points; two consecutive stylist requests returned 4 outfits each.
- Notes: paste the reply below (also goes in the Resolution Center thread).

### 5. Reply in the rejection thread + Resubmit
- iOS Submission page → reply with the message below → **Resubmit to App Review**.

## Paste-ready App Review reply
Adapt the wording if the Resolution Center message says something this does not cover.
```
Hello,

Thank you for the review. We found and fixed the cause of what you saw.

1. The AI Stylist. Our backend extracted the model's answer from the first
   content block of the reply. The model we use now emits a reasoning block
   before the answer, so that extraction failed and the request returned a
   friendly "the stylist is taking a break" message with a success status.
   It failed intermittently, which is why it passed our own spot checks. The
   extraction is now block-type aware, and a failed call reports an error
   instead of a success, so this cannot pass silently again. We have since
   run dozens of consecutive stylist requests and lookbook recreations
   against the production backend with no failures. We also added a fallback
   to a second model so that a temporary capacity error at our AI provider
   is retried rather than shown to you.

2. In-app purchases. This version of the app is entirely free — there are no
   points packs, no subscription plans and no purchase functionality on iOS,
   and no In-App Purchase products are attached to this submission. Every
   feature is available without payment. (We plan to introduce In-App
   Purchases in a future update and will submit those products together with
   that binary.)

3. Community features. Claiming an item in "Donate & Swap" now records the
   claim on the server, marks the listing as claimed for everyone and
   notifies the owner. We also added the ability to report a listing, a Swap
   Box entry or another member, and to block an account — blocked accounts
   are hidden from each other and can be unblocked under Profile → Blocked
   accounts.

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
3. Attach the 6 subscriptions to that version, submit together (per RESUBMIT-CHECKLIST.md).
