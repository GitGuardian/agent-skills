---
name: ggshield-scan-workflows
description: CLI command variants for ggshield secret scanning — scanning the working tree, full git history, a specific commit or commit range, staged changes, Docker images, PyPI packages — plus required flags (`--json`, `-r -y`), exit-code handling, and CI integration. Load when running a `ggshield secret scan` command, deciding which scan variant fits the situation, building a CI gate, or installing pre-commit / pre-push hooks.
---

# GGShield Scanning Workflows

> **Recursive scans need `-y`.** Every `ggshield secret scan path -r ...` command triggers an interactive `Confirm recursive scan.` prompt. Agents cannot respond to it, so always pair `-r` with `-y` (auto-confirm). All recursive examples below include `-y`.

## Workflow 1: Scan a Repository for Secrets (Full Audit)

Use this when onboarding a new repository or doing a periodic security audit.

**Goal:** Detect all secrets in the full git history of a repository.

```bash
# Set your API key (required for headless use)
export GITGUARDIAN_API_KEY="your-personal-access-token"

# Scan the full git history of the current repo
ggshield secret scan repo . --json
```

**What it does:** Scans every commit in the repository's git history, not just the current working tree. This catches secrets that were committed and later deleted.

**Expected output (no findings):**
```json
{"id": "...", "extra_info": null, "results": [], "scan_duration": 1.23, "too_many_documents": false}
```

**Expected output (findings):**
```json
{
  "results": [
    {
      "filename": "config/database.yml",
      "mode": "...",
      "policy_break_count": 1,
      "policy_breaks": [
        {
          "break_type": "Generic High Entropy Secret",
          "validity": "unknown",
          "matches": [
            {
              "match": "REDACTED",
              "match_type": "secret",
              "line_start": 12,
              "line_end": 12
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Workflow 2: Scan Files or Directories (Path Scan)

Use this when you want to scan the current working tree without git history, or when scanning files outside a git repository.

```bash
# Scan a single file (no -r, no -y needed)
ggshield secret scan path config/settings.py --json

# Scan a directory recursively (-y required to skip the "Confirm recursive scan." prompt)
ggshield secret scan path -r -y ./src --json

# Scan multiple directories
ggshield secret scan path -r -y ./src ./config ./scripts --json

# Scan the entire working directory
ggshield secret scan path -r -y . --json
```

**Key difference from `repo` scan:** `path` scans the files as they exist on disk right now. It does not scan git history.

---

## Workflow 3: Scan Before Committing (Pre-commit)

Use this to check only the staged changes before a commit.

```bash
# Stage your changes first
git add .

# Then scan staged changes
ggshield secret scan pre-commit --json
```

**Exit codes:**
- `0` — No secrets found, safe to commit
- `1` — Secrets detected, commit should be blocked

---

## Workflow 4: Automated Scan in Agent Context

When an AI agent is writing or modifying code that handles credentials, configuration, or environment variables, run this scan automatically.

**Pattern for agent use:**

```bash
# Always use --json for structured output
# Always use GITGUARDIAN_API_KEY env var (never interactive login)
# -y is required alongside -r — the recursive-scan confirmation prompt would otherwise hang the agent
GITGUARDIAN_API_KEY="$GITGUARDIAN_API_KEY" ggshield secret scan path -r -y . --json
```

**Parsing the result in a script:**

```bash
result=$(GITGUARDIAN_API_KEY="$GITGUARDIAN_API_KEY" ggshield secret scan path -r -y . --json)
exit_code=$?

if [ $exit_code -ne 0 ]; then
  echo "Secrets detected! Review the output:"
  echo "$result" | python3 -m json.tool
  exit 1
fi

echo "No secrets found."
```

---

## Workflow 5: CI Pipeline Gate

Use this to block a CI pipeline if secrets are detected.

```bash
# In your CI environment, set GITGUARDIAN_API_KEY as a secret/env var
# Then run:
ggshield secret scan repo . --json
```

The command exits with code `1` if any secrets are found, which will fail the CI step.

**To report findings without blocking (audit mode):**

```bash
ggshield secret scan repo . --json --exit-zero
```

---

## Workflow 6: Scan a Commit Range or Specific Commit

Use this to audit only a slice of git history — useful after a rebase, merge, or to review recent work.

```bash
# Scan the last 5 commits
ggshield secret scan commit-range HEAD~5..HEAD --json

# Scan a specific commit by SHA
ggshield secret scan commit abc1234 --json

# Scan everything since branching from main
ggshield secret scan commit-range main..HEAD --json
```

---

## Workflow 7: Scan a Docker Image

```bash
ggshield secret scan docker my-image:latest --json
ggshield secret scan docker ubuntu:22.04 --json
```

Requires `docker` to be installed and running.

---

## Workflow 8: Install Git Hooks

Automate scanning on every commit or push in the current repository:

```bash
# Pre-commit hook (runs on every git commit)
ggshield install --mode local

# Pre-push hook (runs on every git push)
ggshield install --mode local --hook-type pre-push

# Install globally for all repos (pre-commit)
ggshield install --mode global

# Install globally for all repos (pre-push)
ggshield install --mode global --hook-type pre-push
```

To uninstall:

```bash
ggshield uninstall --mode local
```

---

## Quick Reference

| Goal | Command |
|---|---|
| Full repo audit (git history) | `ggshield secret scan repo . --json` |
| Scan current files | `ggshield secret scan path -r -y . --json` |
| Scan a single file | `ggshield secret scan path <file> --json` |
| Scan staged changes | `ggshield secret scan pre-commit --json` |
| Scan a commit range | `ggshield secret scan commit-range HEAD~5..HEAD --json` |
| Scan a specific commit | `ggshield secret scan commit <sha> --json` |
| Scan Docker image | `ggshield secret scan docker <image> --json` |
| CI gate (fail on findings) | `ggshield secret scan repo .` |
| CI audit (never fail) | `ggshield secret scan repo . --exit-zero` |
| Only report high+ severity | `ggshield secret scan path -r -y . --minimum-severity high` |
| Skip already-known incidents | `ggshield secret scan path -r -y . --ignore-known-secrets` |
| Write results to file | `ggshield secret scan path -r -y . --json --output results.json` |
| Check auth status | `ggshield api-status` |
| See all scan options | `ggshield secret scan --help` |
