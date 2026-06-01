# The move workflow

Run these steps in order. Take in the complete set of secrets before storing any — do not start moving on the first hit.

## 1. Discover

Two input modes:

- **User points at a file** — parse `KEY=value` pairs from a `.env`, or identify the located literals in a config/source file the user names.
- **Scan a target** — run a `ggshield` secret scan to discover secrets, then move them. See `references/ggshield-cli-setup.md` for install/auth. Use `ggshield secret scan path <target> --json` and read the matched values from the results.

## 2. Dedup by value

The same secret value often appears in several files or lines. Collapse them: **one value = one vault entry**, even if it appears in N places. You will still replace every occurrence in step 7.

## 3. Detect the backend

Confirm which secrets-manager CLI is installed **and** authenticated (see the auth checks in `references/backends.md`). If several are authenticated, ask the user which to target. If none are, stop and point them at that backend's login flow — this skill does not provision a vault.

## 4. Leaked-check (loud, non-blocking)

Before storing each deduplicated value, ask:

> Before storing — has this exact value ever been committed, pushed, or otherwise exposed (a public or shared repo, a shared system, logs, a paste)? If yes, storing the **same** value just relocates a burned secret; it is still compromised. The right move is to rotate it first — the `scan-secrets` skill's remediation doctrine walks the revoke -> regenerate flow — then come back and vault the **new** value. Do you want to (a) rotate first, or (b) vault this value as-is anyway?

Continue with whichever the user picks. **Never store a leaked value silently** — the warning must be shown. But do not block: if the user chooses (b), proceed.

## 5. Name

Propose a path/key using the convention for the chosen backend (see `references/backends.md`), defaulting to `<app-or-repo>/<KEY>`. Confirm with the user before writing.

## 6. Store

Run the backend's store command from `references/backends.md`, passing the value via **stdin or a file, never as a literal argv token**. Then verify the write succeeded by reading back **metadata only** — the secret's existence or version — not the value:

- Vault: `vault kv metadata get secret/<app>/<key>`
- AWS: `aws secretsmanager describe-secret --secret-id <app>/<key>`
- GCP: `gcloud secrets versions list <key>`
- Azure: `az keyvault secret show --vault-name <vault> --name <key> --query id -o tsv`
- Doppler / 1Password / Infisical: list the secret name without printing the value.

## 7. Replace the reference

For every occurrence of the literal (all the places collapsed in step 2), replace the hardcoded value with the backend-appropriate reference from `references/backends.md` and strip the plaintext. Keep the surrounding file structure intact — swap only the literal.

## 8. Verify

Re-grep or re-scan the touched files to confirm the plaintext literal is gone and the reference is in place. Then summarize:

- which values moved, and to which vault paths;
- which files were edited;
- a reminder that **wiring runtime retrieval** (env injection, SDK fetch, sidecar) is the user's next step — out of scope for this skill.

## Plaintext hygiene (applies throughout)

- Pass values via stdin/`file://`; for argv-caution backends (`references/backends.md`), use a temp file with `umask 077` and delete it after, and warn about shell history.
- Verify plaintext removal before claiming the move is complete.
- One value = one entry. One value leaked in five files is still one rotation and one vault entry.
