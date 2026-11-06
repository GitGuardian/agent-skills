# ggshield scanning workflows

Heavy reference loaded on demand from `SKILL.md`. Covers each scan command variant, expected JSON output, and CI integration.

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

## Workflow 3: Explicit One-off Staged Scan

Use this when the user explicitly asks to scan the current staged changes now. Use it also when a pre-commit hook exists. A routine commit or push request alone does not trigger this scan.

```bash
# Scan what is already staged. Do not stage unrelated files to scan them.
ggshield secret scan pre-commit --json
```

A staged scan does not check the outgoing commit history. It is not a substitute for pre-push protection.

---

## Workflow 4: Recurring Checks During Agent Work

For recurring checks while you edit credential-handling code, commit, push, or use AI tools, offer the matching hook through `install-hooks`. If only this skill is installed, use [hook-selection.md](hook-selection.md). It contains the full selection and installation workflow.

Check the existing protection once and reuse the result. If a matching hook exists, let it scan the normal authorized operation. Do not run another staged, path, or AI hook scan next to it. If no hook exists, offer an installation or a repair one time. If the user declined, do not scan or ask again. Never claim that unscanned work passed a scan.

An explicit scan, an audit, or a concrete suspected leak is still a reason to use the relevant scan workflow. When a hook finds a secret, remediate it. The same hook checks the next authorized retry.

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

## Workflow 8: Install Hooks

Use `install-hooks`. If this skill is installed alone, use [hook-selection.md](hook-selection.md). Choose pre-commit for staged changes at commit time. Choose pre-push for outgoing commits. Choose the matching AI hook for supported assistant events. Keep the existing hook manager. Check the effective configuration without a scan. Do not suggest all hook families at once. Do not make a global change without a requested global scope.

---

## Quick Reference

| Goal | Command |
|---|---|
| Full repo audit (git history) | `ggshield secret scan repo . --json` |
| Scan current files | `ggshield secret scan path -r -y . --json` |
| Install git pre-commit hook | `ggshield install --mode local` |
| Install project-local Claude Code hook | `ggshield install -t claude-code -m local` |
| Scan a single file | `ggshield secret scan path <file> --json` |
| Explicit one-off staged scan | `ggshield secret scan pre-commit --json` |
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
