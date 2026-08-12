# Autonomous App Review Remediation — standing authorization

**Granted by the user 2026-08-10:** on an App Store rejection, Claude fixes the cause, rebuilds, and resubmits **without asking**, repeating until the app is published. Do not wait for confirmation on anything in the AUTO-FIX list.

**Hard constraint from the user:** *do not change the core mechanism of how the app works.* Cataloguing items, AI tagging, the AI stylist, outfits/looks, closets, friends/swap, and account auth are the product — they get fixed, never removed, to satisfy a reviewer.

---

## The company — five subagents

`appreview-director` is the engineering manager: it is dispatched on any review-status change and runs the whole cycle by delegating to the four teams below, enforcing the loop caps and escalation rules in this document. The main session's only jobs are (a) keep the status monitor alive and (b) dispatch the director when it fires.

| Stage | Agent | Owns | Never does |
|---|---|---|---|
| — | `appreview-director` | Orchestration, routing, loop caps, escalations, reporting | Writes code; re-does a team's work |
| 1 | `appreview-analyst` | Read the rejection, reproduce it live, root-cause it | Edits code |
| 2 | `appreview-implementer` | Fix frontend + backend, deploy backend, commit | Builds or submits |
| 3 | `appreview-qc` | Adversarially verify; GO / NO-GO | Edits anything |
| 4 | `appreview-publisher` | EAS build, upload, ASC metadata, Resolution Center reply, submit | Runs on a NO-GO, or edits while a review is in flight |

**NO-GO from stage 3 loops back to stage 2** with QC's blocker list — never to stage 4. Build failures route by kind: code/native error → stage 2; cert/provisioning/service → one retry, then escalate.

Definitions live in `C:\Users\vamsh\.claude\agents\appreview-*.md`.

## Loop

1. **Detect** — the persistent monitor polls `asc review status --app 6779038156` every 30 min and fires on state change.
2. **On `REJECTED` — GET THE VERBATIM REVIEWER TEXT FIRST. Non-negotiable.**
   The App Store Connect **API does not expose Resolution Center message text.** `asc review status/doctor/validate` return submission *state* and metadata checks only. On 2026-08-12 the pipeline diagnosed a rejection from that output alone and got it **completely wrong** — it concluded a Stylist bug, while Apple had actually written *"provide a demo account… pre-populated content… friends, items to swap, community features and activity feed."* Acting on the wrong diagnosis wasted a cycle and one "fix" (hiding listings) made the real problem worse.
   **So: ask the user to paste the Resolution Center message before diagnosing.** If it isn't available, say the diagnosis is unverified and act only on what is directly observable. Then follow the pipeline above. Raw commands for reference:
   ```bash
   asc review submissions-list --app 6779038156
   asc review status --app 6779038156 --pretty
   ```
   (Resolution Center message text may need the ASC web UI; the guideline + submission ID come from the API.)
3. **Classify** the rejection against the two lists below.
4. **AUTO-FIX** → fix → verify → rebuild → resubmit → log → notify (informational, not a question).
5. **ESCALATE** → stop, notify the user with the reviewer text, the root cause, and the specific decision needed.
6. **Cap:** at most **2** autonomous fix→resubmit cycles for the *same* guideline. On a third rejection of the same guideline, stop and escalate — repeated wrong-headed resubmissions waste review cycles and attract account scrutiny.

---

## AUTO-FIX (act immediately, no asking)

| Category | Examples | Action |
|---|---|---|
| **Metadata** | description/keywords/promo text wording, missing Terms link, screenshot content or sizes, privacy policy URL, review notes | `asc metadata apply`, `asc screenshots apply`, edit + resubmit |
| **Declarations** | age rating fields, encryption, App Privacy data types, content rights | `asc age-rating edit`, etc. — *except* where it raises the public age rating (see ESCALATE) |
| **Guideline 2.1 completeness** | a screen erroring, a dead-end, a broken endpoint, placeholder/"coming soon" content, a feature that fails for the reviewer | Fix the bug in code, or hide the incomplete surface behind a flag in `frontend/src/lib/featureFlags.ts` (precedent: `SERVICES_DIRECTORY_ENABLED`, `VLOG_ENABLED`), then rebuild |
| **Guideline 2.1(b) IAP** | any purchase reference reappearing | Ensure `IAP_ENABLED` gating is complete; keep zero IAPs attached to the version |
| **Guideline 5.1.1** | permission purpose strings, account deletion, sign-in requirements | Edit `app.json` **and** `frontend/ios/Wardrobe/Info.plist` (bare workflow ships the plist), rebuild |
| **Backend faults** | API 5xx, model/config errors, dead routes | Fix `backend/server.py`, redeploy to Vercel, verify live before resubmitting |
| **Demo account** | reviewer can't sign in / empty account | Reseed `applereview@wardrobe-demo.com`, verify login + data via live API |

### Rebuild + resubmit sequence
```bash
cd /d/websites/wardrope && git add -A && git commit -m "..." && git push origin dev-kiran:main && git push origin dev-kiran
cd frontend && npx eas-cli build --platform ios --profile production --non-interactive --no-wait   # note the build id
npx eas-cli submit --platform ios --profile production --id <BUILD_ID> --non-interactive
# then, once processed:
asc validate --app 6779038156 --version-id <VERSION_ID> --output table      # must be clean of real blockers
asc review submit --app 6779038156 --version 1.0 --build <BUILD_ID> --confirm
```
Always run `asc validate` (and `asc review doctor`) **before** submitting. Always reply in the Resolution Center explaining what changed.

---

## ESCALATE (stop and tell the user)

1. **Business / legal / financial decisions** — anything needing the Paid Apps Agreement, tax forms, entity or bank details, App Transfer, or a change of account holder.
2. **Removing or materially changing a core feature** — the user's explicit constraint. Hiding an *incomplete* peripheral screen is fine; gutting closets/stylist/AI tagging/friends is not.
3. **Raising the public age rating** — e.g. declaring `socialMedia=true` or `userGeneratedContent=true` may push the app above 4+ and can trigger guideline 1.2 UGC obligations (moderation, reporting, blocking). Client-visible; ask Raj.
4. **Anything needing a physical device** — sandbox IAP testing. No iPhone available.
5. **Guideline 4.3 (spam/duplicate), 5.2 (IP), or legal/rights claims** — human judgment.
6. **Third rejection on the same guideline** — the diagnosis is wrong; stop guessing.
7. **Credentials or secrets** — never enter payment, banking, tax, or password material.

---

## After approval
1. Notify the user (PushNotification) — app is live.
2. Update `[[project-wardrobe-appstore-iap]]`, the Raj roll-up, and feed session `local_f534b229`.
3. Run `bash asc-post-review-fixes.sh --apply` (age-rating fields; guard now passes).
4. Monetization becomes a separate track — see `ORG-MIGRATION-RUNBOOK.md` / `RESUBMIT-CHECKLIST.md`. Never submit the 6 subscriptions while the free-version strategy holds.
