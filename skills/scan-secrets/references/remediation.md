# ggshield: interpreting results and remediation

Heavy reference loaded on demand from `SKILL.md`. Covers scan output structure, rotation rules, history rewriting, and false-positive handling.

## Understanding Scan Output

### JSON Output Structure

```json
{
  "results": [
    {
      "filename": "path/to/file.py",
      "policy_break_count": 2,
      "policy_breaks": [
        {
          "break_type": "AWS Keys",
          "validity": "valid",
          "matches": [
            {
              "match": "REDACTED",
              "match_type": "apikey",
              "line_start": 42,
              "line_end": 42
            }
          ]
        }
      ]
    }
  ]
}
```

### Key Fields

| Field | Meaning |
|---|---|
| `filename` | File containing the secret |
| `policy_break_count` | Number of secrets found in this file |
| `break_type` | Type of secret (e.g., `"AWS Keys"`, `"GitHub Token"`, `"Generic High Entropy Secret"`) |
| `validity` | Whether the secret is still active: `"valid"`, `"invalid"`, `"unknown"`, `"cannot_check"` (also surfaces as `"no_checker"` for detectors without a validity checker). For `unknown` / `cannot_check` / `no_checker` findings, the natural follow-up is HMSL — see "HMSL follow-up for unverifiable findings" below before suggesting it. |
| `severity` | Risk level: `critical`, `high`, `medium`, `low`, `info` |
| `line_start` / `line_end` | Line numbers in the file |

### Severity and rotation decision

**Rotation rule:** rotation is absolutely necessary if the secret has been exposed on a remote — pushed to a shared repository, CI system, or any external service. A secret that exists only locally (committed or uncommitted, but never pushed) does not need rotation; removing it from the code is sufficient.

Use `--minimum-severity` to filter noise in large repos:

```bash
# Only report critical and high severity findings
# -y is required alongside -r to skip the "Confirm recursive scan." prompt
ggshield secret scan path -r -y . --minimum-severity high --json
```

### HMSL follow-up for unverifiable findings

When `validity` is `unknown`, `cannot_check`, or `no_checker`, the live/dead validity check failed (no checker for that detector, network error, or the detector is structural-only). The natural next question is: "is this credential already public?" — answerable with **HasMySecretLeaked (HMSL)**, GitGuardian's privacy-preserving hash-lookup service.

The contract below is self-contained — it holds whether or not the user has the dedicated `check-hmsl` skill installed:

- **HMSL is user-run only.** The agent does **not** invoke `ggshield hmsl check`, `ggshield hmsl fingerprint`, `ggshield hmsl query`, `ggshield hmsl decrypt`, or `ggshield hmsl check-secret-manager`. It prepares the command and explains the trade-offs; the user runs it in their own terminal.
- **The agent does not read the credential file.** No `Read` / `Grep` / `cat` / `head` / `tail` / `sed` / `awk` / `less` / `xxd` / `wc` / `file` / `ls` / LSP-backed tool against the credential file or any HMSL intermediate file (`*-payload.txt`, `*-mapping.txt`, `*.dump`). Any such call pulls plaintext into the agent context before HMSL's local-hashing protocol can protect it.
- **Always `-n none --json`.** The naming strategy `none` strips identifying hints from the output the user pastes back. Never `-n key`, never `-n censored`, never `-n cleartext`.
- **Surface quota before bulk runs.** Have the user run `ggshield hmsl quota` first; prefix mode (the default) consumes multiple credits per checked secret.
- **Never paste a raw secret into the conversation** to set up an HMSL check. If the user offers one inline, redirect: *"Put it in a file outside the repo, give me the path, run the command yourself."*

Commands to hand to the user (the agent prints these; the user runs them):

```bash
# Quick start
ggshield hmsl quota                                          # check daily credit budget first
ggshield hmsl check /path/to/secrets.txt --json -n none      # one-shot check, no hint in output
ggshield hmsl check -t env /path/to/.env --json -n none      # .env-formatted input
```

Exit codes: `0` = no matches found (not known to be leaked publicly); `1` = at least one secret matched (leaked); non-zero = error.

A match means GitGuardian's HMSL corpus saw the exact secret in a public artifact (public GitHub repo, commit, gist, or issue). Treat a match as confirmation, not coincidence — proceed straight to rotation per Step 2 below.

If the user has the `check-hmsl` skill installed locally, it covers additional flows (multi-stage `fingerprint`/`query`/`decrypt` for sensitive bulk audits, `check-secret-manager hashicorp-vault` for vault inventories, troubleshooting). The agent should load that skill for those flows. The rules above remain in force regardless.

---

## Remediation Steps

### Step 1: Assess exposure

Before acting, determine whether the secret has been pushed to a remote:

- **Local only (never pushed)** — remove from code; if already committed locally, see Step 4 for cleanly scrubbing it from the unpushed commits. No rotation needed.
- **Pushed to a remote** — rotate the credential and remove it from the current code. **Do not attempt to rewrite already-pushed history** — see Step 4 for why; rotation is the actual remediation.

### Step 2: Rotate the secret (if exposed on a remote)

1. Go to the service that issued the secret (AWS console, GitHub settings, etc.)
2. Revoke or delete the exposed credential
3. Generate a new credential
4. Update all systems that use the old credential

### Step 3: Remove the secret from code

Replace the hardcoded secret with an environment variable or secrets manager reference:

```python
# Before (bad)
api_key = "sk-abc123xyz..."

# After (good)
import os
api_key = os.environ["MY_SERVICE_API_KEY"]
```

### Step 4: Removing from git history — usually don't

If the secret has already been pushed to a remote, **we generally advise against rewriting git history**. Once a credential has been on a remote, it must be rotated regardless — and rotation alone is the actual remediation. Rewriting history on top of that:

- Requires a force-push that breaks every fork, clone, and open pull request
- Does not retrieve the credential from systems that already mirrored or indexed the commit — other forks, search caches, archive sites, CI artifacts, log aggregators all keep their own copies
- Demands hard coordination with every collaborator (each has to re-clone or carefully rebase)

The rotated credential is dead — that is what stops the attack. Scrubbing history on top is a cosmetic step that buys very little for a high coordination cost.

**The exception — secret committed but not yet pushed.** If the commits are still on a local branch and have not propagated to any remote, rewriting is cheap and worth doing — there is no force-push fallout and the credential never left the machine.

For that local-only case:

```bash
# Most recent commit only — amend before pushing
# 1) edit the file to remove the secret, then:
git add <file>
git commit --amend --no-edit

# Multiple unpushed commits — interactive rebase
# squash, fixup, or edit out the commits that introduced the secret
git rebase -i <base>
```

After the rewrite, confirm the secret is gone everywhere:

```bash
ggshield secret scan repo . --json
```

**If you are forced to scrub already-pushed history** (regulatory or legal obligation, contractually-required data deletion), the tooling exists — BFG Repo Cleaner for large repos, `git filter-repo` for surgical removal — but only pursue this path *after* rotation, with explicit buy-in from every collaborator, and with the understanding that mirrors / forks / caches outside your control still hold the old credential.

### Step 5: Verify the fix

After removing and rotating:

```bash
ggshield secret scan repo . --json
```

Confirm the finding no longer appears.

---

## Ignoring False Positives

If ggshield flags something that is not a real secret (e.g., a test fixture, a placeholder value, or a public key):

### Option 1: Inline `# ggignore` comment (simplest)

Add `# ggignore` on the same line as the secret in the source file:

```python
EXAMPLE_API_KEY = "AKIAIOSFODNN7EXAMPLE"  # ggignore
```

This suppresses the finding for that specific line without modifying `.gitguardian.yaml`.

### Option 2: Ignore the last finding via CLI

```bash
ggshield secret ignore --last-found
```

This adds an entry to `.gitguardian.yaml` in the current directory.

### Option 3: Ignore by SHA (from scan output)

```bash
ggshield secret ignore <sha-from-output>
```

### Option 4: Manual entry in `.gitguardian.yaml`

```yaml
version: 2
secret:
  ignored-matches:
    - name: "test fixture - not a real key"
      match: "AKIAIOSFODNN7EXAMPLE"
```

Commit `.gitguardian.yaml` to share ignore rules with your team.

### `.gitguardian.yaml` full configuration example

```yaml
# .gitguardian.yaml — repo root or ~/.gitguardian.yaml globally
exit-zero: false              # set true to never block CI
minimum-severity: medium      # only report medium, high, critical
ignore-paths:
  - tests/fixtures/
  - "**/*.snap"
secret:
  ignored-matches:
    - name: "placeholder key in docs"
      match: "AKIAIOSFODNN7EXAMPLE"
```

---

## Common Secret Types and Where to Find Them

| Secret Type | Typical Location |
|---|---|
| AWS Access Keys | `.env`, `config/`, `~/.aws/credentials` |
| GitHub Tokens | `.env`, CI config, scripts |
| Database URLs | `config/database.yml`, `.env`, `settings.py` |
| Private Keys (RSA/EC) | `*.pem`, `*.key`, `id_rsa` |
| Generic High Entropy | Any file with long random strings |
| Stripe / Payment Keys | `.env`, backend config |
| Slack Webhooks | CI config, notification scripts |

---

## When an Agent Finds Secrets

If ggshield detects secrets in code that an agent just wrote or modified:

1. **Do not commit the code** — stop the workflow immediately
2. **Report the finding** to the user with:
   - The file and line number
   - The secret type
   - The validity status
3. **Suggest remediation**:
   - Replace the hardcoded value with an environment variable
   - Point to where the user should store the actual value (`.env` file, secrets manager)
4. **Re-scan after fixing**:

   ```bash
   ggshield secret scan path <modified-file> --json
   ```

5. Only proceed with committing once the scan returns clean.
