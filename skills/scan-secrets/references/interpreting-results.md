# ggshield: interpreting results

Heavy reference loaded on demand from `SKILL.md`. Covers scan-output structure, the HMSL follow-up contract, and false-positive handling. Remediation itself — triage, rotation, history-rewrite rules, per-secret-type runbooks — lives in [`remediation-doctrine.md`](remediation-doctrine.md); SKILL.md routes there directly when findings are present.

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

### Severity and minimum-severity filtering

Use `--minimum-severity` to filter noise in large repos:

```bash
# Only report critical and high severity findings
# -y is required alongside -r to skip the "Confirm recursive scan." prompt
ggshield secret scan path -r -y . --minimum-severity high --json
```

Whether a finding warrants rotation depends on exposure, not just severity. See [Remediation](#remediation) below for the doctrine that drives the rotation decision.

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

A match means GitGuardian's HMSL corpus saw the exact secret in a public artifact (public GitHub repo, commit, gist, or issue). Treat a match as confirmation, not coincidence — the credential is public, so dispatch it to the post-leak / public-facing track in [`remediation-doctrine.md`](remediation-doctrine.md#6-post-leak--public-facing-track).

If the user has the `check-hmsl` skill installed locally, it covers additional flows (multi-stage `fingerprint`/`query`/`decrypt` for sensitive bulk audits, `check-secret-manager hashicorp-vault` for vault inventories, troubleshooting). The agent should load that skill for those flows. The rules above remain in force regardless.

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
