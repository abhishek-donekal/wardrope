# Wardrobe → RKD Org Account Migration Runbook
**Created:** 2026-07-30 · **Decision basis:** July-7 fresh-recreate decision (NOT App Transfer)
**Goal:** Wardrobe iOS app lives on a new RKD Tech Group LLC Apple **Organization** account, with a cleanly-Active Paid Apps Agreement (LLC W-9 + EIN — no W-8BEN mess).

---

## Phase 0 — Apple ID on new email (YOU, ~15 min)
1. On a **physical iPhone** (not web — web signup hits Apple's anti-fraud wall): Settings → sign out if needed → **Create Apple ID** with the new email. VPN OFF.
2. If SMS code fails ("codes can't be sent at this time") = cooldown → wait 30–60 min, retry once, enter code fast, or use "Didn't get a code? → call".
3. Enable 2FA when prompted (required for developer accounts).

## Phase 1 — Organization enrollment (YOU, then Apple 2–7 days)
Wait until **24–48 h after the D&B email** (sent ~Jul 30) before enrolling.
1. Sign in at **https://developer.apple.com/programs/enroll/** with the new Apple ID.
2. Entity type: **Company / Organization**.
3. Enter EXACTLY as on the D&B record:
   - Legal entity name: **RKD Tech Group LLC**
   - D-U-N-S: **149879026**
   - Address: **611 S Dupont Hwy # 102, Dover, DE 19901** ← Dover, NOT Lauderhill (D&B has the registered-agent address; Apple must match D&B)
   - Legal structure will show as Corporation at D&B — normal for LLCs.
4. Your role: employee/authorized rep; Apple may **call Rajkumar Dhameja** (owner) to verify authority — keep him reachable.
5. Pay **$99/yr**. Then wait for approval (typically 2–7 days; watch email + spam).
6. NOT business.apple.com (that's Business Manager — wrong product).

## Phase 2 — ASC financial setup (YOU, ~30 min, do immediately on approval)
This is what killed the individual account 3×. On the org it's clean:
1. App Store Connect → **Business** (Agreements, Tax, Banking) → accept **Paid Apps Agreement**.
2. Tax: **W-9** — legal name RKD Tech Group LLC, EIN **42-2517793** (fits cleanly; US entity). Signed W-9 PDF reference: `D:\downloads\RKD Tech Group W9.pdf`.
3. Banking: **LLC US bank account** (payee name must match LLC).
4. Contacts: fill all 4 roles (can all be Rajkumar or you).
5. ✅ Verify status = **Active** before anything else. Non-negotiable — IAPs error in sandbox until Active.

## Phase 3 — Bundle ID decision (YOU + Raj, 5 min)
**Recommended: keep `com.wardrope.app`** (zero code/env changes; IAP code + backend APPLE_BUNDLE_ID untouched):
1. On the OLD individual account (Team XDMQSSZT7C): ASC → Wardrope app (6779038156) → App Information → **Delete App** (allowed — never published, only rejected).
2. developer.apple.com (old account) → Certificates, IDs & Profiles → Identifiers → delete the `com.wardrope.app` bundle ID registration.
3. On the NEW org account → Identifiers → register `com.wardrope.app`.
**Fallback** (if Apple blocks re-registration): new id `com.rkdtech.wardrobe` — then Claude must update app.json bundleIdentifier + code BUNDLE_ID constants + backend APPLE_BUNDLE_ID env + eas.json, and all IAP products live under the new app. More work; only if forced.

## Phase 4 — Rebuild + upload under org team (CLAUDE, ~1 h)
Prereqs: Phase 1 approved, Phase 3 done, repo reconciled.
1. Reconcile repo first: `dev-kiran` has 2 unpushed commits + dirty tree + split build numbers (app.json 13 vs committed 11) — commit/push deliberately, don't lose the Jul-21 work (S3 presign, Twilio Verify, swapbox fixes).
2. Fix known pre-submit bugs (from WARDROBE-STATUS-REVIEW.md): buy-points GETs PUT-only `/users/me/profile` (balance 0); subscription "Manage" crashes on `Linking.openURL(null)`; **AI Stylist endpoint erroring ("Stylist is taking a break") — reviewer saw this; independent rejection risk**.
3. `npx eas-cli login` as an account that can access the new team (or add new Apple credentials): `eas credentials` → iOS → new team → generate new Distribution Cert + Provisioning Profile (build 12's cert is team-scoped to XDMQSSZT7C — unusable).
4. Create new app record on org ASC: name Wardrope/Wardrobe, bundle `com.wardrope.app`, SKU fresh.
5. Update `eas.json` submit profile: new `appleId` (new email), new `ascAppId` (new app record), new `appleTeamId`.
6. `eas build -p ios --profile production` (build number restarts fine — new app record) → `eas submit`.
7. New ASC API key on new team for non-interactive submits (old key 39V475348S is old-team).

## Phase 5 — Recreate the 9 IAPs (YOU with Claude's paste-ready text, ~45 min)
All metadata + screenshots already prepared — see `RESUBMIT-CHECKLIST.md` (paste-ready tables) + `screenshots/iap-subscription.png`, `screenshots/iap-buy-points.png`.
- **Keep the SHORT product IDs** (`sub_single_monthly`, `sub_single_annual`, `sub_couples_monthly`, `sub_couples_annual`, `sub_family_monthly`, `sub_family_annual`, `points_starter`, `points_popular`, `points_best`) — build 12+ code matches SHORT ids. Do NOT prefix.
- Subscription group "Wardrobe Plans"; prices $1.99/2.99/4.99 mo, $17.99/26.99/44.99 yr upfront; points $0.99/$1.99/$3.99.
- Each product: display name + description + price + review screenshot → **Ready to Submit**.

## Phase 6 — Version setup + submit (YOU, ~30 min)
1. Version 1.0: description/keywords/support URL (reuse from old listing), **screenshots** (5 iPhone + upload the 2 iPad 2048×2732), demo account in App Review sign-in field (verify which demo login is current — two exist: appreview@wardrope.com / applereview@wardrobe-demo.com — reviewer must LOG IN, not sign up).
2. **Attach all 9 IAPs to the version** (In-App Purchases section → ⊕) — missed step that caused rejection #3.
3. Select the new build.
4. Sandbox-test on a **physical iPhone** first (StoreKit sheet must appear) — needs a device; ask Raj if none available.
5. Review notes: path Profile → Plan & Billing (subs) / Buy Points (consumables). Submit.

## Also (parallel, not blocking)
- Rotate: AWS secret (leaked in chat), Square prod token (leaked in screenshot), confirm JWT secret off dev default. SQUARE_WEBHOOK_SIGNATURE_KEY unset.
- Old individual account: after Phase 3 deletion, its Paid-Apps/tax mess becomes irrelevant — abandon (Apple Finance case 102930627046 can be dropped).
