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
| `validity` | Whether the secret is still active: `"valid"`, `"invalid"`, `"unknown"`, `"cannot_check"` |
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

---

## Remediation Steps

### Step 1: Assess exposure

Before acting, determine whether the secret has been pushed to a remote:

- **Local only (never pushed)** — remove from code. No rotation needed.
- **Pushed to a remote** — rotate the credential first, then remove from code and clean history.

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

### Step 4: Remove from git history

If the secret was committed and pushed, removing it from the current file is not enough — it still exists in git history.

**Option A: BFG Repo Cleaner (recommended for large repos)**

```bash
# Replace the secret value in all history
bfg --replace-text secrets.txt
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

**Option B: git filter-repo**

```bash
git filter-repo --path-glob '*.env' --invert-paths
```

**Option C: For small repos — squash or rebase**

If the secret was introduced recently, an interactive rebase may be simpler.

> ⚠️ Rewriting git history requires a force push and coordination with all collaborators.

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
