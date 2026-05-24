# scan-secrets: interpreting results and remediation

Scan-output structure and false-positive handling live here. **Remediation defers to the cross-skill doctrine** at [`../../../references/remediation-doctrine.md`](../../../references/remediation-doctrine.md) — that doctrine covers triage axes, the four deliverable modes, the four lifecycle tracks (pre-leak / post-leak public / post-leak internal-private / off-repo), per-secret-type rotation runbooks, the coordination framework, takedown, and validation.

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

### Filtering noise in large repos

```bash
# Only report critical and high severity findings
# -y is required alongside -r to skip the "Confirm recursive scan." prompt
ggshield secret scan path -r -y . --minimum-severity high --json
```

## Remediation

For every finding, dispatch into the doctrine by detection context:

- **Agent file-edit hook fired** → [§ 5.1](../../../references/remediation-doctrine.md#51-agent-file-edit-hook-fired)
- **Pre-commit hook fired** → [§ 5.2](../../../references/remediation-doctrine.md#52-pre-commit-hook-fired)
- **Pre-push hook fired** → [§ 5.3](../../../references/remediation-doctrine.md#53-pre-push-hook-fired)
- **Repo / branch / commit / image / package scan finding** → triage in [§ 6](../../../references/remediation-doctrine.md#6-post-leak--public-facing-track) (public-facing) or [§ 7](../../../references/remediation-doctrine.md#7-post-leak--internal-private-track) (internal-private) depending on the repo's exposure

Per-type rotation guidance (the schema and AWS worked example today; more types to follow) lives in the doctrine's [§ 9 per-secret-type appendix](../../../references/remediation-doctrine.md#9-per-secret-type-appendix). Do not duplicate rotation prose here.

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
