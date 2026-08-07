# Wardrobe — Project Status Review (Deep Dive)

**Prepared for:** Raj's project status review — Wardrobe deep-dive
**As of:** 2026-07-21
**Repo:** `D:\websites\wardrope`
**Live web:** https://whatsinmywardrobe.com (HTTP 200, up)
**Backend API:** https://backend-gamma-gules-79.vercel.app
**Standing review session:** `local_f534b229-6ffd-4de8-b392-6154f4d5008a`

> Ground-truth precedence: where sources disagree, VERIFIED git/live state (checked 2026-07-21) and the newest memory snapshot (portfolio, 2026-07-21) win over older memory and the older on-repo notes. Conflicts are flagged inline as **[CONFLICT]** or **[STALE]**.

---

## 1. Executive Summary

Wardrobe ("What's In My Wardrobe") is an AI digital-wardrobe mobile app for iOS, built with Expo/React Native, whose same codebase is exported to the web (`expo export -p web`) and served as the product/marketing site at **whatsinmywardrobe.com**. Users photograph clothing; the app tags items and builds outfits/stylist suggestions. It is monetized via Apple StoreKit in-app purchases — 6 auto-renewable subscriptions (Single / Couples / Family, monthly + annual) plus 3 consumable "points" packs — with a parallel Square Web SDK path used on the web build. The backend is a FastAPI service on Vercel backed by MongoDB Atlas and S3 (us-east-2) for images.

**Where it stands:** The web app is live and working. The iOS app is **NOT live** — it has been **rejected three times** by App Review (all guideline **2.1(b)**), the decisive cause being an in-app-purchase **product-ID mismatch**. That root cause is **FIXED in code** (build 12). The app is no longer blocked on engineering — it is blocked on **the single biggest blocker: the Apple Paid Apps Agreement is not Active** ("Pending User Info" — needs bank + the correct tax form), compounded by an unresolved account-ownership decision (ship on the stuck individual account via W-8BEN now, vs. recreate under the RKD Tech Group LLC organization account, whose Apple ID creation is itself stuck behind Apple's anti-fraud wall). Until the Paid Apps Agreement goes Active, a paid app with IAP cannot pass review no matter how good the build is — because IAP products return zero even in sandbox until the agreement is active.

---

## 2. What the Product Is

**Concept:** An AI digital wardrobe / closet manager. Flow: photograph a clothing item → AI tagging → outfit / stylist suggestions. Plans are tiered for individuals, couples, and families, implying shared/multi-user wardrobes at higher tiers.

**Platforms (one codebase, two surfaces):**
- **iOS native app** — Expo / React Native, bundle id `com.wardrope.app`, App Store (ASC App ID `6779038156`). **Not yet live.**
- **Web app** — the *same* Expo app exported to web (`expo export -p web`) and deployed to Vercel at **whatsinmywardrobe.com**. Not a separate site; it is the iOS app's web export. **Live.**

**Monetization:**
- **Subscriptions (Apple StoreKit / expo-iap / StoreKit 2, 6 products, group "Wardrobe Plans"):** Single / Couples / Family, each Monthly + Annual. Price span **$1.99–$44.99**; annual prices matched to Apple tiers **17.99 / 26.99 / 44.99** (commit `2988971`).
- **Consumable "points" packs (Apple StoreKit IAP, 3 products):** Starter **$0.99** / Popular **$1.99** / Best **$3.99**.
- **Square Web SDK (web build only):** inline Square payment modal in `buy-points.tsx`, verified end-to-end in **sandbox** (5+ COMPLETED sandbox payments with receipt URLs). Production Square not yet switched on.

**Images:** Photos upload via a **presigned-URL pattern** — the app asks the backend (`/upload/presign`) for a presigned URL and uploads directly to S3. Apps hold **no AWS credentials**; only the backend does.

---

## 3. Architecture & Infrastructure

### Frontend (Expo / React Native)
- Location: `D:\websites\wardrope\frontend`; web produced with `expo export -p web`.
- Backend URL is **hardcoded** as `https://backend-gamma-gules-79.vercel.app` in both the web bundle and mobile default (`src/lib/api.ts`), also injected at build via `EXPO_PUBLIC_BACKEND_URL` (`eas.json`).
- IAP product IDs (SHORT, no bundle prefix):
  - `frontend/app/subscription.tsx` → `APPLE_SUB_IDS`: `sub_single_monthly`, `sub_single_annual`, `sub_couples_monthly`, `sub_couples_annual`, `sub_family_monthly`, `sub_family_annual`
  - `frontend/app/buy-points.tsx` → `APPLE_PRODUCT_IDS`: `points_starter`, `points_popular`, `points_best`
  - Both carry the explicit comment "exactly as created in App Store Connect (no bundle-id prefix)." Grep confirms **no** `com.wardrope`-prefixed IDs anywhere in `frontend/app`.

### Backend (FastAPI on Vercel)
- Location: `D:\websites\wardrope\backend`, entry `server.py` (Python). URL `https://backend-gamma-gules-79.vercel.app` (root `/` → 404, normal; endpoints under paths).
- StoreKit JWS verify endpoints: `/billing/apple-verify-purchase`, `/billing/apple-verify-subscription`; account deletion `DELETE /api/users/me`.
- Deploy: Git auto-deploy is **disconnected** → **always deploy via CLI** (web: `cd frontend && npx vercel --prod`; backend via its own Vercel project).
- `_clean_env()` strips a UTF-8 BOM that Windows `vercel env` prepends; pins regional S3 endpoint `https://s3.{region}.amazonaws.com` to avoid cross-region `AuthorizationQueryParametersError`.

### Storage
- **S3 bucket:** `wardrope-images-v2` (misspelled), region **us-east-2**. Backend Vercel Production env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`.
- **Database:** MongoDB Atlas (shared).

### Vercel projects (team `abhsiheks-projects-351d4109`)
- `web` → whatsinmywardrobe.com (the `frontend/` expo-web export). **Active.**
- `backend` → `backend-gamma-gules-79.vercel.app` (API). **Active.**
- `frontend` → dead (404). Orphan / deletable.
- `wardrope` → old expo-web copy. Orphan / deletable.
- **Rename hazard:** backend URL is hardcoded in the apps. Renaming the `backend` project **breaks the apps.** To rename safely: add `api.whatsinmywardrobe.com` subdomain, repoint apps, redeploy, then rename.

### Domain / DNS
- `whatsinmywardrobe.com` at **GoDaddy**; A record `@` → `216.198.79.1` (Vercel).
- Always share `https://whatsinmywardrobe.com` (or stable alias `web-delta-tawny-60.vercel.app`) — never deployment-specific `*.vercel.app` URLs.

### CORS (server.py)
Allows: whatsinmywardrobe.com, www variant, `wardrope-red.vercel.app`, a `*.vercel.app` regex, localhost 8090 / 3000 / 8081 / 19006.

### EAS config (`frontend/eas.json`)
- Submit → production → ios: appleId **`adonekal@gmail.com`**, ascAppId **`6779038156`**, appleTeamId **`XDMQSSZT7C`**.
- Build → production: `autoIncrement: true`; env `EXPO_PUBLIC_BACKEND_URL=https://backend-gamma-gules-79.vercel.app`.
- cli: `appVersionSource: "local"` (build number from local `app.json`).

> **[CONFLICT] Apple ID identity.** `eas.json` submit uses `adonekal@gmail.com`, but memory (Jul 7) records the correct ASC Apple ID as **`vamshidhar.abhishek2@gmail.com`** (adonekal@gmail.com noted as wrong in early Apple support mail). Reconcile before the next `eas submit` or it may target the wrong account.

---

## 4. Chronological Evolution Timeline

**~May 26, 2026** — Repo initialized; early scaffolding (`PRODUCTION_TIMELINE.md/.pdf`, `design_guidelines.json`, `image_testing.md`, `test_result.md`, all dated May 26).

**~Jun 21, 2026** (`project_wardrobe.md`, now ~30d stale) — Architecture settled: **whatsinmywardrobe.com IS the Expo app's expo-web export**, not a separate site. A parallel **Next.js `web/` app was built then deleted** — the user was frustrated by the wasted parallel build; lesson (feedback_surface_simpler_path): "deploy the thing directly instead of rebuilding it." Backend FastAPI live on Vercel; S3 uploads verified; CORS configured. The memory line "iOS app submitted to App Store" here is **[STALE/misleading]** — it predates the rejection saga.

**Jun 22, 2026** — Square **production** token leaked in a screenshot → must rotate before any production Square swap. Square docs written (`SQUARE_DEMO_SCRIPT.md`, `SQUARE_PRODUCTION_SWAP.md`).

**Jun 23–25, 2026 — Rejection #1 + IAP migration.** v1.0 **build 9** rejected: **2.1(b)** IAP error + **2.3.10** non-iOS status bars in screenshots. Apple IAP added (expo-iap / StoreKit 2; backend JWS verify endpoints `/billing/apple-verify-purchase`, `/billing/apple-verify-subscription`). Square kept for web/Android; add-ons hidden on iOS. Screenshots regenerated with iOS status bars. **Build 10** uploaded.

**Jun 29–30, 2026 — Rejection #2 + stale build 11.** Build 10 resubmitted Jun 29 → rejected again, both **2.1(b)**: products never attached to version + purchase error on all price buttons. **Build 11** created Jun 30 with **no code change** (same commit `2988971` as build 10; "Match annual prices to Apple tiers 17.99/26.99/44.99").

**Early July 2026 — Rejection #3.** Guideline **2.1(b)**, build 10/11 — "IAP not submitted for review" + purchase error on all price buttons.

**Jul 5, 2026 — ROOT CAUSE FOUND.** From live ASC screenshots: a **product-ID mismatch.** ASC products were created with **SHORT** ids (`sub_single_monthly`, `points_starter`, …), but code + backend requested **`com.wardrope.app.*`-prefixed** ids → StoreKit returned **0 products** → "temporarily unavailable" alert on every purchase button = the exact error App Review hit. (Earlier memory claiming ids must be prefixed was **wrong**.) Fix commit **`7475e69`** (`buy-points.tsx`, `subscription.tsx`, `server.py` → short ids). **Build 12** (EAS `80f7d72b-e819-41a6-9a89-86248b819c42`) built + uploaded to ASC (submission `50505d4e`). Backend redeployed to Vercel prod, verified live. Second blocker identified: **Paid Apps Agreement "Pending User Info"** (no bank, no tax form); Miami FL address forced W-9; correct form = **W-8BEN + Indian PAN**; address self-change to Hyderabad submitted, pending Apple verification.

**Jul 7, 2026** —
- Re-verified HEAD `7475e69`, buildNumber 12, short ids confirmed.
- A **stray broken build 11** (EAS `4180c266`, pre-fix, prefixed ids) got pushed to ASC from a stale/resumed session → **must NOT be selected.**
- Correct ASC Apple ID confirmed `vamshidhar.abhishek2@gmail.com`. Apple Finance/tax case **#102930627046** opened.
- **Strategy pivot:** abandon the stuck individual account; new intended home = **RKD Tech Group LLC Apple Organization** account, via **fresh-recreate (NOT App Transfer)** — individual account's agreement/IAP state judged too unclean to transfer. US entity → clean W-9 (EIN 42-2517793) + LLC US bank. Gmail `rkdtechgroup@gmail.com` obtained; office visit planned Jul 8. **[STALE by Jul 17.]**
- App Review demo account recorded: `applereview@wardrobe-demo.com` / `Review2026!Wardrobe` (reviewer must **log in, not sign up**).

**Jul 8–9, 2026** — IAP fixes (removed Apple Pay `c342b59`, product-id `d7a3aee`, StoreKit config `0be9bc9`, IAP config `abf8f43`) merged to main → `9a28470 Merge dev-kiran into main`. Round-2 remediation across build 9+: **2.3.10** screenshots, **3.1.1 / 2.1(a)** IAP attach + defensive purchase code, **5.1.1(iv)** camera wording, **5.1.1(v)** account deletion + `DELETE /api/users/me`. **Build 12 RE-submitted** Jul 9 via EAS (submission `db4973ec`) — so build 12 has **two uploads** (Jul 5 + Jul 9). Portfolio demo login recorded as `appreview@wardrope.com`. Square web verified end-to-end in sandbox.

**Jul 17, 2026** — **RKD Org Apple ID creation STILL FAILING:** anti-fraud "account cannot be created" wall + SMS codes not arriving; user confusing Business Manager (business.apple.com — wrong) with the Developer Program (developer.apple.com/programs/enroll — right). Fixes documented (session `594dbebb`): create the Apple ID on a **physical iPhone** (Settings → Create Apple ID, VPN off); "codes can't be sent" = cooldown, wait 30–60 min; enroll at developer.apple.com/programs/enroll. **Recommendation softened** back toward: **ship on the individual account via W-8BEN NOW, App Transfer later** — a partial reversal of the Jul 7 "fresh-recreate on org" decision.

**Jul 21, 2026 (authoritative portfolio snapshot)** — Still **NOT live, 3× rejected.** Build 12 (Jul 5 + Jul 9) is the last confirmed build. Local `app.json` bumped to **13 but UNCOMMITTED**; no evidence build 13 built or submitted. Hard gate remains the Paid Apps Agreement not being Active. RKD org path still blocked.

---

## 5. App Store Submission Saga

### The three rejections (all guideline 2.1(b))
| # | Date | Build | Guideline(s) | Root cause | Fix |
|---|------|-------|--------------|-----------|-----|
| 1 | Jun 23–25 | 9 | 2.1(b) + 2.3.10 | IAP error; non-iOS status bars in screenshots | expo-iap/StoreKit 2 added; screenshots regenerated; build 10 |
| 2 | Jun 29–30 | 10 (`2988971`) | 2.1(b) | Products never attached to version + purchase errors on all buttons | Price-tier + further IAP work; build 11 (no code change) |
| 3 | early Jul | 10/11 | 2.1(b) | "IAP not submitted for review" + purchase error on all price buttons — **product-ID mismatch** (code used prefixed ids, ASC used short ids → StoreKit 0 products) | **`7475e69`** — code + backend to SHORT ids; build 12 |

**Round-2 remediation (shipped build 9+):** 2.3.10 compliant iPhone/iPad screenshots · 3.1.1 / 2.1(a) IAP products attached to version + defensive purchase code · 5.1.1(iv) camera permission wording · 5.1.1(v) in-app account deletion + `DELETE /api/users/me`.

### Which build is good vs. broken
| Build | EAS / commit | Verdict |
|-------|--------------|---------|
| 9 | — | Rejected Jun 23; superseded |
| 10 | `2988971` | Rejected Jun 30; **stale/broken — never use** |
| 11 | `4180c266` (stray, pushed Jul 7) | pre-fix, prefixed ids; **broken — do NOT select** |
| **12** | EAS **`80f7d72b-e819-41a6-9a89-86248b819c42`**, commit `7475e69` | **GOOD** — fix present; uploaded Jul 5 (`50505d4e`) + re-submitted Jul 9 (`db4973ec`) |
| 13 | `app.json` bumped locally, **uncommitted** | **Not built, not submitted** — not real yet |

> **[CONFLICT] "build 12" vs. disk.** Prior memory says "select build 12 (`80f7d72b`), not stray build 11." But tracked build numbers **on disk** are **11 (committed HEAD)** / **13 (working tree, uncommitted)** — no "12" in current files, and `80f7d72b` is an EAS build id (not a git hash), absent from git history (HEAD `9a28470`). In ASC, **12** is the build that carries the fix and was uploaded; do not confuse the local `app.json` number with the ASC build to select.

### Current submission state
- Last confirmed upload: **build 12**, Jul 5 (`50505d4e`) + Jul 9 (`db4973ec`).
- **"Submit for Review" never successfully completed** — each rejection burned a 1–3 day cycle on a gate that hadn't been cleared.
- 9 IAP products all **"Ready to Submit"** in ASC (metadata + review screenshots done) — do **not** recreate.
- iPhone screenshots (5) uploaded; **iPad screenshots (2048×2732) still needed.**
- Correct build (12) must be **selected on the version page** — not 10/11 — and the **9 IAPs must be attached to the version** (creating them ≠ submitting them).

---

## 6. The Account / Tax Blocker (Critical Path)

A **paid app with IAP cannot pass review while the Paid Apps Agreement is not Active** — and IAP products return **zero even in sandbox** until it is active.

### The core conflict
- Holder ("Abhishek Donekal") is an **Indian resident (Hyderabad)** with **no SSN** → correct form is **W-8BEN + Indian PAN**.
- ASC legal address was **Miami, FL**, forcing ASC to demand a **W-9** (US person), which cannot be truthfully completed → agreement stuck at **"Pending User Info."**
- Address self-changed to India (C923 NGO's Colony, Hyderabad, TG 500070), pending Apple verification. Apple Finance/tax case **#102930627046** open.

### Two candidate paths
- **Path A — RKD Org fresh-recreate** (Jul 7 decision, **NOT App Transfer**): US entity gives a clean **W-9** (EIN **42-2517793**) + LLC US bank; D-U-N-S obtained. Recreate the app listing + 9 IAPs (short ids → build 12 code works as-is if bundle id unchanged; a new bundle id = rebuild). **Currently BLOCKED** — as of Jul 17 the RKD Org **Apple ID creation still fails** (anti-fraud wall + SMS not received; Business Manager vs Developer Program confusion).
- **Path B — Individual account via W-8BEN now** (Jul 17 recommendation, stopgap): Apple verifies India address (case `#102930627046`) → file **W-8BEN + PAN**; add Indian bank (IFSC) → agreement Active; attach 9 IAPs to v1.0, select build 12, upload iPad screenshots, sandbox test, Resolution Center reply, resubmit. **Faster to live**, with **App Transfer to the org later.**

> **[CONFLICT / decision drift]** Jul 7 treats "fresh-recreate on RKD org" as the plan; Jul 17 softens to "individual + W-8BEN now, transfer later." **Treat org-recreate as blocked/deferred and W-8BEN-now as the near-term path — but confirm with Raj (§10).**

### Hard rule
**NEVER** put RKD Tech Group LLC (S-corp; owner Rajkumar Dhameja) TIN/name on the **individual** account's tax forms — a name/TIN mismatch is a perjury risk. The tax form must match whichever account holds the app.

### Cross-app significance
The RKD Org Apple account is a **single point of failure** — it also gates **Table for Two** and **hireme iOS**. Unblocking it (working phone, physical iPhone, possibly Rajkumar for Apple's authority-verification call) benefits three apps.

---

## 7. Current State Snapshot (verified 2026-07-21)

### Git
- **Branch:** `dev-kiran` (current). Also `main`; remotes `origin/main`, `origin/dev-kiran`.
- **HEAD:** `9a28470 Merge dev-kiran into main` (2026-07-08 23:54:38 -0400).
- Recent: `9a28470` → `fc13d68` → `60f2c31 updated to auto signin` → `12f388e`/`92b991b ui bug fixes` → `c342b59 removed apple pay` → `d7a3aee updated product id` → `6e2bf5d` → `0be9bc9 Updated storekit config` → `abf8f43 Added IAP config` → `8343bc0 prebuild ios` → `7475e69 Fix IAP product ID mismatch` → `2988971 Match annual prices to Apple tiers` → `3bb47f1 subscription IAP source`.
- `origin/main` top 5 in sync with local.
- **Local `dev-kiran` is AHEAD of `origin/dev-kiran` by 2 commits** (merge commits `9a28470` + `fc13d68` unpushed). Branch sits mid-merge-cleanup — **not a clean release point.**
- **Working tree NOT clean — 43 changes:**
  - Modified (4): `RESUBMIT-CHECKLIST.md`, `frontend/app.json`, `frontend/ios/Wardrobe/Info.plist`, `frontend/package-lock.json`
  - Deleted (37): the entire `screenshots/` toolset (icon-option-*.html/.png, generate-*.mjs, render-*.mjs, test-web-payment*)
  - Untracked (2): `frontend/auto-submit.sh`, `frontend/watch-build.sh`

### Build number (uncommitted + internally split)
- `frontend/app.json`: version **1.0.0**, buildNumber **13** in working tree; committed (HEAD) = **11**.
- `frontend/ios/Wardrobe/Info.plist` `CFBundleVersion`: working tree **13**; committed (HEAD) = **9**.
- Both agree at **13** in the working tree, but **neither change is committed** — a clean checkout builds at buildNumber 11 / CFBundleVersion 9.
- With `autoIncrement: true` + `appVersionSource: local`, EAS **bumps `app.json` on the next production build** — so local "13" is not a reliable record of the last-uploaded build.

### Live
- `https://whatsinmywardrobe.com` → **200 (up).**
- `https://backend-gamma-gules-79.vercel.app/` → **404** at root (normal; endpoints under paths).

### What works
- Web app live and serving.
- Backend API live; S3 presigned upload verified; MongoDB connected.
- IAP product-ID mismatch fixed in code (short ids everywhere).
- Square web payments verified end-to-end in **sandbox** (5+ COMPLETED payments w/ receipts).
- Account deletion, camera wording, IAP attach, compliant iPhone screenshots — shipped.

### What does not (yet)
- iOS app **not live** (Paid Apps Agreement not Active; "Submit for Review" never completed).
- iPad screenshots not uploaded; IAPs may need re-attaching to the version.
- Twilio SMS not provisioned → phone verification returns 503 (email verify works).
- Known balance bug (see §8).
- Production Square not switched on.

---

## 8. Gaps & Risks

### Technical debt / bugs
- **Balance-load bug:** `buy-points.tsx` `loadBalance` does a **GET** on `/users/me/profile`, but the backend defines that route as **PUT only** → the points balance shows **0 on initial load.** Add a GET route (or fix the client endpoint).
- **Twilio not provisioned:** phone-verify returns **503**; only email Verify works. Provision Twilio or ensure onboarding/review never depends on SMS.
- **Brand vs. code spelling:** brand "Wardrobe" vs code/infra "wardrope" (paths, bucket `wardrope-images-v2`, bundle id `com.wardrope.app`, and an ASC subscription-group localization mismatch). Bundle id and bucket are effectively immutable; audit the ASC display names.
- **Purchase-failure UX:** a generic "temporarily unavailable" masked a config error for **3 review cycles** — add diagnostic detail in TestFlight/dev builds.

### Release-hygiene risks
- **Uncommitted, split build numbers** (app.json 13 vs committed 11; Info.plist 13 vs committed 9) — a clean checkout produces the wrong build number. Commit or discard deliberately before the next build.
- **`dev-kiran` 2 commits ahead of origin**, sitting on a merge commit — push/clean up before cutting a release.
- **37 deleted screenshot-tool files** + **2 untracked shell scripts** (`auto-submit.sh`, `watch-build.sh`) in the working tree — decide keep vs remove and commit intentionally.
- **`autoIncrement: true`** drifts build numbers every build — trust ASC + `RESUBMIT-CHECKLIST.md`, not `app.json`, for "what's in ASC."

### Security items (rotate — see §11)
- **AWS secret** pasted in chat → rotate S3 key/secret; update backend Vercel env.
- **Square PRODUCTION token** leaked Jun 22 → **rotate BEFORE any prod swap** (step 0, `SQUARE_PRODUCTION_SWAP.md`).
- (Cross-project) Supabase DB password (Table for Two) shared in plaintext → rotate.

### Process / submission risks
- **Apple ID identity conflict** (`adonekal@gmail.com` in eas.json vs `vamshidhar.abhishek2@gmail.com` in memory) could send the next submit to the wrong account.
- **No physical iOS device** for the required StoreKit **sandbox** purchase test.
- **Demo account discrepancy** across sources (see §11) — give the reviewer credentials that actually work; reviewer must **log in, not sign up.**

---

## 9. Prioritized Roadmap / Things To Do

Ordered by fastest path to "app live." Owner = **Raj** (client input/decision) or **Dev** (engineering).

1. **[Raj] Decide the account path** — individual + W-8BEN now (ship fast, transfer later) vs. wait for RKD org. Top gate; everything downstream depends on it. *Recommended (Jul 17): individual + W-8BEN now.*
2. **[Raj] Clear the Paid Apps Agreement** — confirm legal address = India, file **W-8BEN + Indian PAN**, add Indian bank (IFSC), complete contact info; push Apple case **#102930627046** to **Active.** Nothing ships until this is Active (sandbox included).
3. **[Dev] Reconcile & commit the build number** — make `app.json` + `Info.plist` agree, **commit** (don't ship the uncommitted 11/13 split), and account for `autoIncrement`.
4. **[Dev] Verify the correct Apple ID in `eas.json`** before the next `eas submit` (adonekal vs vamshidhar.abhishek2).
5. **[Dev] In ASC, select build 12** (NOT 10/11) and **re-confirm the 9 IAPs are attached to v1.0.**
6. **[Dev/Raj] Upload iPad screenshots** (2048×2732). iPhone set already up.
7. **[Dev + Raj] Run the StoreKit sandbox purchase test** on a **physical iPhone** (none currently available — Raj may need to provide one/a session).
8. **[Dev] Lock one canonical App Review demo account** that logs in (login is NOT gated on email_verified; reviewer must log in, not sign up), plus reviewer notes: Profile → Plan & Billing (subs) / Profile → Buy Points (consumables).
9. **[Raj] Successfully click "Submit for Review"** once gates 2/5/6/7/8 are green — the step that has never completed.
10. **[Dev] Fix the balance bug** — add a GET `/users/me/profile` (or point the client at the right endpoint).
11. **[Dev] Rotate leaked secrets** — AWS key/secret (update backend Vercel env), Square **production** token (before any prod swap).
12. **[Raj + Dev] Square client demo + production go-live** — demo with Raj (`SQUARE_DEMO_SCRIPT.md`), then `SQUARE_PRODUCTION_SWAP.md` (rotate token, enable bank + receipt emails) — needs Raj's bank + go decision.
13. **[Dev] Provision Twilio** (or confirm nothing critical depends on SMS) to clear the 503.
14. **[Dev] Repo hygiene** — commit/clean the 37 deleted screenshot-tool files + 2 untracked scripts; push `dev-kiran`'s 2 commits; reach a clean release point.
15. **[Dev] Unblock the RKD Org Apple account** (parallel track; also unblocks TF2 + hireme) — create the Apple ID on a physical iPhone (VPN off), wait out SMS cooldowns, enroll at developer.apple.com/programs/enroll (NOT business.apple.com), Rajkumar available for Apple's verification call if asked.

---

## 10. Open Raj-Side Asks / Decisions Needed

1. **Account ownership decision** — individual (W-8BEN now, transfer later) vs. RKD org (fresh-recreate, currently blocked). Blocks everything.
2. **Paid Apps Agreement inputs** — bank account + confirmed tax residency/contact so the correct form (W-8BEN + PAN for individual, or W-9 for RKD org) can be filed and the agreement made Active.
3. **Live session with Raj** (originally the Jul 8 office visit) — finish the RKD org Apple ID + Developer Program enrollment: scan the Google QR, complete phone verification on a working phone, Rajkumar available for Apple's authority-verification call.
4. **Physical iPhone / session** for the required StoreKit sandbox purchase test.
5. **Square: client demo + production decision** — schedule the demo; provide the business bank account; approve production go-live.
6. **Confirm the correct Apple ID** to submit under (`vamshidhar.abhishek2@gmail.com` vs `adonekal@gmail.com`).

---

## 11. Credentials & Secrets Index

> Names / locations only — **no secret values are stored in this document.**

| Item | Where it lives | Action |
|------|----------------|--------|
| AWS access key + secret | Backend Vercel Production env (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) | **ROTATE** — secret pasted in chat; update Vercel env after rotating |
| S3 config | `S3_BUCKET` = `wardrope-images-v2`, `S3_REGION` = `us-east-2` (backend Vercel env) | Verify after key rotation |
| Square **production** token | Leaked in Jun 22 screenshot | **ROTATE before any prod swap** (`SQUARE_PRODUCTION_SWAP.md`); prod also needs bank + receipt emails enabled |
| Square sandbox creds | App / Square dashboard | Sandbox verified; OK |
| MongoDB Atlas | Backend connection string (Vercel env) | Keep out of chat; rotate if exposed |
| App Review demo account | ASC + backend user | **[CONFLICT]** IAP memory (Jul 7): `applereview@wardrobe-demo.com` / `Review2026!Wardrobe`; portfolio (Jul 9): `appreview@wardrope.com`. Pick ONE that logs in; reviewer must log in, not sign up |
| ASC Apple ID | Apple ID | **[CONFLICT]** memory: `vamshidhar.abhishek2@gmail.com`; eas.json submit: `adonekal@gmail.com` — reconcile |
| RKD org Gmail | `rkdtechgroup@gmail.com` (obtained Jul 7) | For the org Apple ID |
| Apple Team / IDs | Team `XDMQSSZT7C`; ASC App ID `6779038156`; Developer ID `55182fa1-a0a8-4736-bbfd-52cbc5eac86d`; bundle `com.wardrope.app` | Reference |
| Apple Finance/tax case | `#102930627046` | Push to resolution |
| RKD entity | RKD Tech Group LLC, EIN **42-2517793**, D-U-N-S obtained, W-9 at `D:\downloads\RKD Tech Group W9.pdf` | Org path only — never on individual-account forms |
| (Cross-project) Supabase DB password (TF2) | Shared in plaintext | **ROTATE** |
| (Cross-project) RKD org Apple SIM phone | (561) 816-8220 | For org verification |

---

## 12. Key File / Path Reference

**Repo root:** `D:\websites\wardrope`
(Note: `D:\websites\wardrobe-app` is an **empty abandoned scaffold — IGNORE.**)

```
D:\websites\wardrope\
├─ frontend\                     Expo/RN iOS app; expo-web export → whatsinmywardrobe.com
│  ├─ app\subscription.tsx       APPLE_SUB_IDS (6 short sub product ids)
│  ├─ app\buy-points.tsx         APPLE_PRODUCT_IDS (3 short points ids); Square modal; balance bug
│  ├─ app.json                   version 1.0.0; buildNumber (working 13 / committed 11)  [uncommitted]
│  ├─ eas.json                   submit appleId/ascAppId/teamId; autoIncrement; appVersionSource local
│  ├─ ios\Wardrobe\Info.plist    CFBundleVersion (working 13 / committed 9)  [uncommitted]
│  ├─ src\lib\api.ts             default backend URL (hardcoded)
│  ├─ auto-submit.sh             [untracked]
│  └─ watch-build.sh             [untracked]
├─ backend\                      FastAPI
│  └─ server.py                  JWS verify (/billing/apple-verify-purchase, /billing/apple-verify-subscription);
│                                DELETE /api/users/me; _clean_env() BOM strip; regional S3 endpoint; short-id maps
├─ screenshots\                  iPhone (5, up) + iPad (2048×2732, pending); toolset 37 files [deleted in working tree]
├─ RESUBMIT-CHECKLIST.md         **trusted step-status source — trust over memory** [modified]
├─ SQUARE_DEMO_SCRIPT.md         Square client demo script
├─ SQUARE_PRODUCTION_SWAP.md     Square prod go-live (step 0 = rotate token)
├─ PRODUCTION_TIMELINE.md/.pdf   early timeline (May 26)
├─ design_guidelines.json        design spec
├─ vercel.json                   Vercel config
└─ memory\                       repo-local notes
```

**Authoritative sources for "now":** git/live state (this doc, §7) + `RESUBMIT-CHECKLIST.md` (live step statuses) > 14-day-old IAP memory > 30-day-old `project_wardrobe.md`.

---

## Appendix A — Learnings (apply to all future app submissions)
1. Verify ASC product IDs vs code **character-exact** BEFORE submitting — 1 mismatch = 1 lost review cycle (1–3 days).
2. The Paid Apps Agreement must be **Active** before sandbox works at all — no bank/tax = zero products even in sandbox.
3. First IAPs must be **ATTACHED to the app version** (version-page section) — creating them isn't submitting them.
4. Check EAS `gitCommitHash` before trusting a build number — "new build" ≠ new code (build 11 == build 10 code).
5. Never mix tax identities across accounts (individual holder vs client LLC) — perjury risk.
6. Keep `RESUBMIT-CHECKLIST.md` as the single source of truth for step status.
7. Surface the simplest path early — the deleted parallel Next.js `web/` build was avoidable; deploy the expo-web export directly.

## Appendix B — Delta log (newest first)
- **2026-07-21** — Deep-dive review rewritten to exhaustive 12-section form. No new technical change since Jul 9; still blocked on the account/tax gate and the RKD-org path.
- **2026-07-17** — RKD org Apple ID creation still failing (anti-fraud + SMS); recommendation softened to individual + W-8BEN now, transfer later.
- **2026-07-09** — Build 12 re-submitted (`db4973ec`); Square web sandbox verified end-to-end.
- **2026-07-08/09** — IAP fixes merged to main `9a28470`; round-2 rejection remediation shipped (2.3.10, 3.1.1/2.1(a), 5.1.1(iv), 5.1.1(v)).
- **2026-07-07** — Pivot to RKD org fresh-recreate; correct Apple ID `vamshidhar.abhishek2@gmail.com`; tax case `#102930627046`; stray broken build 11 (`4180c266`) warning.
- **2026-07-05** — ROOT CAUSE found (product-ID mismatch) + fix `7475e69` + build 12 uploaded (`50505d4e`); Paid Apps Agreement blocker identified.
- **2026-06-29/30** — Rejection #2 (2.1(b)); stale build 11 (same code as 10).
- **2026-06-23/25** — Rejection #1 (2.1(b) + 2.3.10); Apple IAP migration (expo-iap/StoreKit 2); build 10.

---

> **Standing maintenance rule:** after EVERY material change (build, submit, blocker flip, secret rotation, decision), prepend a dated delta to Appendix B, update the per-project memory + portfolio roll-up (`project_raj_portfolio_manager.md`), and send the delta to the review session `local_f534b229-6ffd-4de8-b392-6154f4d5008a`. No prompt needed.
