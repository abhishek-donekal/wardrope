# App Store Connect CLI (`asc`) — setup

Installed 2026-08-07. Lets Claude drive App Store Connect directly: check review status, validate a submission, apply metadata/screenshots, upload builds, and submit for review — instead of clicking through the ASC web UI.

- **Binary:** `asc` v3.7.0 (Rorkai.ASC via winget), on the user PATH
- **Telemetry:** disabled (`ASC_TELEMETRY_DISABLED=1`, user env var)
- **Unofficial tool** — not affiliated with Apple; it just wraps the official App Store Connect API.

---

## ONE-TIME: create an API key (user must do this — the .p8 downloads only once)

1. **appstoreconnect.apple.com** → **Users and Access** → **Integrations** tab → **App Store Connect API** → **Team Keys**.
2. Click **+** (Generate API Key).
   - **Name:** `claude-cli`
   - **Access:** **App Manager** (needed to submit for review; "Developer" can't submit)
3. **Download** the `AuthKey_XXXXXXXXXX.p8` file — **this is the only chance**. Save it to:
   ```
   D:\websites\wardrope\.secrets\AuthKey_XXXXXXXXXX.p8
   ```
   (`.secrets/` is gitignored — never commit a .p8.)
4. From the same page copy two identifiers (not secrets — they're displayed in the UI):
   - **Key ID** — the 10-char code on the key's row
   - **Issuer ID** — the UUID shown at the top of the Team Keys section

## Then run this yourself (one command, stores the key in Windows Credential Manager)

```bash
asc auth login --name wardrobe --key-id "YOUR_KEY_ID" --issuer-id "YOUR_ISSUER_ID" --private-key "D:/websites/wardrope/.secrets/AuthKey_YOUR_KEY_ID.p8" --network
```

`--network` validates the credentials immediately. After this the .p8 file can be deleted — the key material lives in the keychain.

**Tell Claude when it succeeds** (no need to share the key or the IDs).

---

## What Claude can then do without you

| Need | Command |
|---|---|
| Is the app still in review? | `asc review status --app 6779038156` |
| What's blocking submission? | `asc review doctor --app 6779038156` |
| Pre-flight checks before submitting | `asc validate --app 6779038156` |
| List builds | `asc builds list --app 6779038156` |
| Push metadata (description, keywords, notes) | `asc metadata apply` |
| Upload screenshots | `asc screenshots apply` / `upload` |
| Full publish + submit | `asc publish appstore --submit --confirm` |
| Preview a submission without doing it | add `--dry-run` |

## App identifiers for this project
- **App ID (ASC):** `6779038156`
- **Bundle ID:** `com.wardrope.app`
- **Team ID:** `XDMQSSZT7C`
- Current submission: build **1.0.0 (17)**, free version, Waiting for Review since 2026-08-07

## Safety rules for automated use
- Always run `asc validate` / `asc review doctor` before any `--submit`.
- Use `--dry-run` first on anything that mutates a live submission.
- **Never** submit the 6 subscription products while the free version is the strategy — they must stay in "Prepare for Submission".
