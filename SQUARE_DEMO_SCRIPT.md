# Square Sandbox Demo Script — Client Walkthrough

End-to-end live test that proves the client's Square sandbox seller receives card payments through Wardrobe.

---

## Pre-demo setup (do once, 2 min before client joins)

1. Open two browser tabs side by side:
   - **Tab A:** `https://whatsinmywardrobe.com/buy-points` (the live web app)
   - **Tab B:** `https://developer.squareup.com/console/en/sandbox-test-accounts` (Square Developer Console — log in if prompted)
2. In Tab B, click **Open** on the "Default Test Account" row → opens sandbox seller dashboard at `https://squareupsandbox.com/dashboard/sales/transactions`. Leave this tab open.

If `developer.squareup.com` doesn't show an Open button, navigate directly to `https://squareupsandbox.com/dashboard/sales/transactions` after logging in.

3. In Tab A, log in as the demo account:
   - Email: `appreview@wardrope.com`
   - Password: `AppReview2026!`
4. Once on the app home, navigate to **Profile → Buy Points** (or directly `/buy-points`). Note the current balance.

---

## Live demo (in front of client, ~90 seconds)

1. **Frame the test.** "I'm going to charge a Square sandbox test card $0.99. The moment I do, the money lands in your sandbox seller account — same seller ID we'll use in production."
2. **Show your seller account.** Switch to Tab B (sandbox transactions list). Point out: "This is YOUR Square sandbox dashboard. Current balance and transaction list."
3. **Trigger the purchase.** Switch to Tab A. Click the **Starter — $0.99** pack tile. A modal opens with a Square-hosted card form.
4. **Type the test card live.**
   - Card number: `4111 1111 1111 1111`
   - Expiry: `12/30` (any future date)
   - CVV: `111`
   - ZIP: `94103`
5. **Click Pay $0.99.** Wait ~2 seconds. Success banner appears: "500 points added to your account!" Balance updates from N to N+500.
6. **Show the money landed.** Switch to Tab B. Refresh. A new $0.99 transaction appears at the top with last 4 = `1111`, status = COMPLETED.
7. **Show the receipt (the kill shot).** Right-click the new transaction → "View receipt" — or paste the receipt URL directly. Square-stamped, server-generated, public.

**Net effect for client:** "$0.99 left the card → $0.99 in your seller balance → I have a Square-stamped receipt as proof."

---

## Decline-card demo (optional, 30 sec)

Run the same flow with card `4000 0000 0000 0002` — Square will return a decline. The modal shows an error message instead of success. Proves error handling works.

---

## What you can show on demand

| Artifact | URL / where |
|---|---|
| Live web app | https://whatsinmywardrobe.com/buy-points |
| Live backend health | https://backend-gamma-gules-79.vercel.app/api/billing/square-config (returns `{app_id, location_id, environment: sandbox}`) |
| Receipts from prior tests | https://squareupsandbox.com/receipt/preview/ZqZ9WT7NKyMZYaN1llvovKzTbDRZY |
| Square API logs | developer.squareup.com → Apps → "Whats In My Wardrobe" → API logs (left sidebar). Shows every API call hitting Square. |
| Seller transactions | https://squareupsandbox.com/dashboard/sales/transactions |

---

## Sandbox test cards (memorize 1, screenshot the rest)

| Outcome | Card | CVV | Exp | ZIP |
|---|---|---|---|---|
| Success | 4111 1111 1111 1111 | 111 | 12/30 | 94103 |
| Decline | 4000 0000 0000 0002 | 111 | 12/30 | 94103 |
| Insufficient funds | 4000 0000 0000 9995 | 111 | 12/30 | 94103 |

---

## What's the same in production?

The code path is identical. Only differences:
- `SQUARE_ENVIRONMENT` env var: `sandbox` → `production`
- `SQUARE_ACCESS_TOKEN`: sandbox token → production token (CLIENT generates this from his real Square account)
- `SQUARE_LOCATION_ID`: sandbox location → his real Square location ID
- `SQUARE_APPLICATION_ID`: sandbox app id → production app id

Frontend Web SDK switches CDN automatically based on `SQUARE_ENVIRONMENT`. See `SQUARE_PRODUCTION_SWAP.md`.
