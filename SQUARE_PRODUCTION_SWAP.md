# Square Production Swap Playbook

Once client signs off on sandbox demo, switch backend to charge his real Square seller account. ~10 min.

---

## Step 0 — Rotate the previously-leaked production token (CRITICAL)

The production Square access token + secret were leaked in a screenshot during 2026-06-22 session (see [memory](../../C:/Users/vamsh/.claude/projects/D--websites/memory/wardrobe_square_sandbox.md) note). **Rotate first, swap second.**

1. Go to https://developer.squareup.com/apps → "Whats In My Wardrobe"
2. Credentials → **Production** tab
3. Click **Replace** next to Access token → confirm → save the NEW token (one-time display)
4. The old leaked token is now dead.

---

## Step 1 — Get production values from client (or his Square account)

Client needs to provide (or look up while you watch):

| Variable | Where to find |
|---|---|
| Production Access Token | Developer Console → app → Credentials → Production → "Replace" if new |
| Production Application ID | Same page, top: `sq0idp-...` (no `sandbox-` prefix) |
| Production Location ID | Either `GET /v2/locations` with prod token, or Seller dashboard → Locations |

Sanity check: Application ID for production starts with `sq0idp-`, NOT `sandbox-sq0idb-`.

---

## Step 2 — Swap Vercel env vars on backend

```bash
cd D:/websites/wardrope/backend

# Remove sandbox values
npx vercel env rm SQUARE_ACCESS_TOKEN production --yes
npx vercel env rm SQUARE_ENVIRONMENT production --yes
npx vercel env rm SQUARE_LOCATION_ID production --yes
npx vercel env rm SQUARE_APPLICATION_ID production --yes

# Add production values (replace placeholders with real values from client)
printf "EAAAxxxxxxxxxxx" | npx vercel env add SQUARE_ACCESS_TOKEN production
printf "production" | npx vercel env add SQUARE_ENVIRONMENT production
printf "LXXXXXXXXXXXX" | npx vercel env add SQUARE_LOCATION_ID production
printf "sq0idp-xxxxxxxxxxxxxxxxxx" | npx vercel env add SQUARE_APPLICATION_ID production

# Leave SQUARE_WEBHOOK_URL as-is (same path works for both envs)

# Redeploy to pick up new env
npx vercel --prod --yes
```

---

## Step 3 — Smoke test production endpoint

```bash
# Confirm config endpoint returns production values
curl -s https://backend-gamma-gules-79.vercel.app/api/billing/square-config
# Expect: {"app_id":"sq0idp-...","location_id":"L...","environment":"production"}
```

The frontend Web SDK auto-switches CDN based on `environment: production` returned by this endpoint. **No frontend deploy needed.** The same `buy-points.tsx` code loads `https://web.squarecdn.com/v1/square.js` instead of the sandbox CDN.

---

## Step 4 — Tiny live charge (client-supervised)

1. Open https://whatsinmywardrobe.com/buy-points → login as demo account
2. Click Starter $0.99
3. **Use client's real card** (or a $0.99 small charge he authorizes)
4. Confirm:
   - Success banner appears
   - Points credit
   - Charge appears in his REAL Square dashboard (https://squareup.com/dashboard/sales/transactions)

That's the production proof.

---

## Step 5 — Refund the test (immediately)

In production Square dashboard, click the test transaction → Refund. Returns $0.99 to the test card. Demo done, books clean.

---

## Rollback if anything looks wrong

```bash
# Re-swap back to sandbox values
cd D:/websites/wardrope/backend
npx vercel env rm SQUARE_ACCESS_TOKEN production --yes
npx vercel env rm SQUARE_ENVIRONMENT production --yes
npx vercel env rm SQUARE_LOCATION_ID production --yes
npx vercel env rm SQUARE_APPLICATION_ID production --yes
printf "EAAAl4mM_pbo1s_59pzvmNaPr7myCo9EgQerYUZexgxft0cF2EUSUPJYVdHB9vw3" | npx vercel env add SQUARE_ACCESS_TOKEN production
printf "sandbox" | npx vercel env add SQUARE_ENVIRONMENT production
printf "LPCR2GKC4F9JR" | npx vercel env add SQUARE_LOCATION_ID production
printf "sandbox-sq0idb-BfEQ6Ta_MO8a7TybRzFVHA" | npx vercel env add SQUARE_APPLICATION_ID production
npx vercel --prod --yes
```

---

## Things to verify before going live to real users

- [ ] Production Square seller has business address + bank account configured (else payouts won't release)
- [ ] `SQUARE_WEBHOOK_SIGNATURE_KEY` set if you want to verify webhook signatures (currently not set — backend skips signature check)
- [ ] Receipt emails enabled in Square seller settings (auto-send to buyer)
- [ ] Apple IAP path on iOS app still works (totally separate from Square — iOS uses StoreKit)
- [ ] Refund policy documented somewhere customer can see
