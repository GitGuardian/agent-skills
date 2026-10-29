---
name: scan-secrets
description: Scan files, staged changes, commits, history, Docker images, or packages for hardcoded secrets. Use when the user asks for a scan, during an audit, or when you investigate a suspected leak or a finding. Use install-hooks for recurring checks on edits, commits, pushes, and AI assistant actions.
license: MIT
compatibility: Requires the ggshield CLI, version 1.49.0 or later, installed and authenticated against a GitGuardian account. Needs network access to the GitGuardian API.
metadata:
  version: "0.6.2" # x-release-please-version
---

# Scan secrets

## Overview

Use `ggshield secret scan` for an explicit scan or a suspected leak. For routine credential edits, commits, and pushes, hooks do the checks. Reuse protection that works, or offer an installation one time through `install-hooks`. If that skill is not available, [hook-selection.md](references/hook-selection.md) is a self-contained fallback. If the user declined an installation, do not run repeated scans instead. Do not report unscanned work as clean.

## When to Use

- Run the requested one-off scan, also when a hook exists. If a project scan request is ambiguous, scan the current files or ask. Do not scan the full history without a request.
- Use `check-hmsl` to check if a known credential leaked publicly. Use `scan-machine` to inventory a whole machine.
- Use the CLI for the supported scan surfaces. Do not write custom grep or regex scanners. Do not use the MCP tool `GitGuardian:scan_secrets` for these surfaces. If the user declines a CLI installation, offer the MCP tool only for a single pasted snippet. It is not a substitute for a repository or history scan.

## Onboarding (first use)

### Prerequisites

An installed and authenticated `ggshield` that supports the requested command. If the state is unknown, check `ggshield --version`, the relevant `--help` output, and `ggshield api-status`.

### Setup

If needed, read [ggshield-cli-setup.md](references/ggshield-cli-setup.md). A hook installation is optional and needs its own authorization. A requested scan does not need a hook.

## Commands

Always use `--json`. A recursive path scan needs both `-r` and `-y`. Without `-y`, the CLI waits for an interactive confirmation. Scan the requested surface. Do not stage unrelated files to scan them.

```bash
ggshield secret scan path <file> --json
ggshield secret scan path -r -y . --json               # current files
ggshield secret scan pre-commit --json                 # explicit staged scan
ggshield secret scan repo . --json                     # full history
ggshield secret scan commit-range HEAD~5..HEAD --json
ggshield secret scan commit <sha> --json
ggshield secret scan docker <image> --json
ggshield secret scan pypi <package> --json
```

A staged scan does not cover the outgoing commit history. For command variants and CI, read [workflows.md](references/workflows.md). For JSON fields, validity, or false positives, read [interpreting-results.md](references/interpreting-results.md). Do not read them for a command or a result that you already understand. Report an error or an incomplete scan as unchecked, not as clean.

## Best Practices

### Findings

Wait for the complete result before you remediate. Group repeated credentials across files and commits. Keep each distinct credential. Report the locations, the type, and the validity. Do not show the secret values. Stop the affected publishing or commit action. Never show code that contains a detected secret.

Before you give remediation advice, read [remediation-doctrine.md](references/remediation-doctrine.md). Use its triage axes (detection context, exposure, ownership, blast radius) and its deliverable modes. A valid credential still needs triage. A production rotation can need coordination. Produce one consolidated plan.

- Local only and never exposed: remove the secret. When necessary, clean the affected unpushed commits.
- Exposed to a remote or a service: rotate first. Do not rewrite history by default.
- The organization has a custom remediation message: keep it verbatim as the primary guidance.
- A hook found the secret: the same hook checks the next authorized retry. An explicit scan found the secret: scan the affected scope again. A pending, skipped, or failed check is not a success.

### HMSL handoff

If the validity is `unknown`, `cannot_check`, `no_checker`, or `failed_to_check`, propose HMSL to check for a public leak. HMSL is **user-run only**, also when the `check-hmsl` skill is absent. Never run its checks, its fingerprint, query, or decrypt pipeline, or its secret-manager checks. Never read a credential file or an intermediate file with any tool. Never ask for plaintext in the chat.

Prepare the command for the user's terminal with `-n none --json`. Ask the user to check `ggshield hmsl quota` before a bulk run. Reject a naming strategy that identifies the secret, including `cleartext`. Read the HMSL section of [interpreting-results.md](references/interpreting-results.md) when you prepare the handoff. Or use `check-hmsl` for its additional flows.

## Troubleshooting

- CLI, authentication, or headless error: use the setup reference. Never print an API key. In a headless environment, prefer the supported out-of-band (OOB) login.
- Missing scopes or instance problem: read [gitguardian-platform.md](references/gitguardian-platform.md).
- No Git repository: use a path scan for the current files. A history scan needs Git.
- A recursive scan hangs: add `-y` with `-r`.
- Known false positive: use the interpreting-results reference for `ggignore` or the ignore list.
- Other error: find the relevant official page through https://docs.gitguardian.com/llms.txt before you invent a workaround.
