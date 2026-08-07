# Wardrobe iOS — App Store Resubmission Checklist

**App:** Wardrobe (`com.wardrope.app`) · ASC App ID **6779038156** · Apple Team **XDMQSSZT7C** (Individual)
**Rejection:** Submission `d47e4ec0-fa61-4cd8-b84c-abdaef660e25`, June 23 2026, v1.0 (build 9), reviewed on iPad Air 11" M4 / iPadOS 26.5
**Two guidelines cited:** 2.1(b) and 2.3.10

**STATUS: REJECTED AGAIN (July 2026, build 10) — root cause found: product ID mismatch. Fix in progress: build 11 with short IDs.**

Legend: `[x]` done · `[~]` partial · `[ ]` not started

---

## Guideline 2.1(b) — IAP error during purchase

- [x] Apple IAP (StoreKit / `expo-iap`) code in app — subs + points (HEAD commit `2988971`)
- [x] Product IDs: ASC uses short IDs (`sub_single_monthly`, `points_starter`, …) — code updated to match (was `com.wardrope.app.*`; mismatch caused the 2.1b "error message" — fetchProducts returned 0 products)
- [x] Deploy backend (server.py maps now use short IDs) — deployed July 5, verified live
- [x] **Build 12** on EAS with corrected IDs (build 11 was stale — same code as build 10) — uploaded to ASC July 5, submission `50505d4e-ec76-4a54-8992-43c3624260db`
- [x] 6 subscriptions metadata → "Ready to Submit" (verified in ASC July 2026)
- [x] 3 consumables metadata filled → "Ready to Submit" (verified in ASC July 2026)
- [x] IAP review screenshots attached to each product
- [~] **Paid Apps Agreement Active** — tax form DONE; **banking + contact still needed** (all 3 required for Active)
- [ ] Attach all 9 IAP products to version 1.0 ("In-App Purchases and Subscriptions" section on version page)
- [ ] Sandbox purchase test on device (after build 11 shows "Ready" in TestFlight)

## Guideline 2.3.10 — non-iOS status bar in screenshots

- [x] Screenshots regenerated with iOS status bar (9:41 + signal/wifi/battery) via `screenshots/fix-status-bars.mjs`
- [x] Junk/old screenshots deleted; dims ASC-accepted (iPhone 1242×2688, iPad 2048×2732)
- [~] Upload product-page screenshots to ASC — 5 iPhone uploaded; **iPad (2048×2732) still to upload** — use "View All Sizes in Media Manager"
- [ ] App Review reply sent (draft below)

---

## Final resubmit gate (all must be true)
1. Build 11 in TestFlight = Ready
2. Paid Apps Agreement = Active (tax + banking + contact)
3. 9 IAP products = Ready to Submit, IDs match short form (`sub_*`, `points_*`)
4. All 9 IAP products attached to version 1.0
5. Sandbox purchase verified (sub + points, no error)
6. iPad screenshots uploaded
7. App version set to build 11
8. App Review reply sent → Resubmit

---

## Paste-ready: SUBSCRIPTIONS (6)
Subscription Group display name: `Wardrobe Plans`

| Product ID | Duration | US Price | Display Name | Description |
|---|---|---|---|---|
| sub_single_monthly | 1 Month | 1.99 | Single Closet | Unlimited items, AI tagging & outfit builder |
| sub_single_annual | 1 Year | 17.99 upfront | Single Closet Annual | 1 person, billed yearly — 3 months free |
| sub_couples_monthly | 1 Month | 2.99 | Couples Closet | 2 accounts, shared outfits & AI tagging |
| sub_couples_annual | 1 Year | 26.99 upfront | Couples Closet Annual | For two, billed yearly — 3 months free |
| sub_family_monthly | 1 Month | 4.99 | Family Closet | Up to 5 users with family style profiles |
| sub_family_annual | 1 Year | 44.99 upfront | Family Closet Annual | For 5, billed yearly — 3 months free |

Review screenshot (all 6): `D:\websites\wardrope\screenshots\iap-subscription.png`

Review Notes (all 6):
```
To reach this purchase: open the app and sign in (or create a free account) -> tap Profile (bottom tab) -> tap "Plan & Billing" -> choose Monthly or Annual -> select this plan -> tap "Continue to payment". The native StoreKit sheet appears and completes the auto-renewable subscription. The purchased plan unlocks wardrobe limits and features (AI tagging, outfit builder, shared/family accounts). Subscriptions are managed/cancelled via the App Store account settings. Any sandbox account works.
```

Annual subs: set **Upfront** price; the monthly installment field below = leave/Next (unsupported US, harmless).

## Paste-ready: CONSUMABLES (3) — already exist, just fill metadata

| Product ID | Price | Display Name | Description |
|---|---|---|---|
| points_starter | 0.99 | Starter — 500 Points | 500 points for swaps & premium features |
| points_popular | 1.99 | Popular — 1,200 Points | 1,200 points for swaps & premium features |
| points_best | 3.99 | Best Value — 2,800 Points | 2,800 points for swaps & premium features |

Review screenshot (all 3): `D:\websites\wardrope\screenshots\iap-buy-points.png`

Review Notes (all 3):
```
To reach this purchase: open the app and sign in (or create a free account) -> tap Profile (bottom tab) -> tap "Buy Points" (or the points balance) -> tap a points pack. The native StoreKit sheet appears and completes the consumable purchase, after which the points balance is credited immediately. Points are spent to claim items in the Swap Box and unlock premium features. Any sandbox account works.
```

## Paste-ready: App Review reply (ASC Resolution Center)
```
Hello, and thank you for the review.

Guideline 2.1(b): We identified and fixed the root cause of the purchase error: the app was requesting In-App Purchase product identifiers that did not match the identifiers configured in App Store Connect. The new build requests the correct identifiers. All six auto-renewable subscriptions and three consumable point packs have complete metadata, pricing, localized display names/descriptions, and review screenshots, and are now submitted with this app version. The Account Holder has accepted the Paid Apps Agreement and it is in effect. We re-tested every purchase in the sandbox on device and confirmed subscriptions and point purchases complete without errors.

Guideline 2.3.10: We have replaced all app screenshots. The screenshots show the genuine iOS interface with a standard iOS status bar and no third-party/non-iOS imagery.

Please re-review at your convenience. Happy to provide any additional information.
```

---

## Key links
- TestFlight: https://appstoreconnect.apple.com/apps/6779038156/testflight/ios
- Agreements/Tax/Banking: https://appstoreconnect.apple.com/business/
- Build 10 (EAS): https://expo.dev/accounts/duryo/projects/wardrope/builds/29b6f802-517e-4320-b35a-2ff701a49102
- Build 10 submission: https://expo.dev/accounts/duryo/projects/wardrope/submissions/a8dda4ab-918c-4e85-bd42-31e108da0a7f

## Build & upload build 11
```
cd D:\websites\wardrope\frontend
npx eas build --platform ios --profile production   # autoIncrement bumps buildNumber
npx eas submit -p ios --id <BUILD_ID>               # ASC API key already stored on EAS
```
