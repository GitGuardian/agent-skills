---
name: scan
description: Scan for hardcoded secrets with ggshield (current files, git history, a specific path, a commit, or staged changes).
argument-hint: [path | repo | history | staged | <file>]
---

Run a `ggshield` secret scan for the user. Use the `scan-secrets` skill for full command reference, output interpretation, and remediation guidance.

## Decide what to scan

Based on `$ARGUMENTS` (may be empty):

- **empty** or **`path`** → scan the working tree at the current directory:
  `ggshield secret scan path -r -y . --json`
- **`repo`** or **`history`** → audit the full git history:
  `ggshield secret scan repo . --json`
- **`staged`** → scan only staged changes (pre-commit):
  `ggshield secret scan pre-commit --json`
- **a path to a file or directory** → scan that path. Use `-r -y` if it's a directory:
  `ggshield secret scan path [-r -y] <path> --json`

Always pass `--json` for structured output. Always pair `-r` with `-y` to avoid the interactive recursive-scan prompt.

## If ggshield is not set up

If `ggshield --version` fails or `ggshield api-status` returns an auth error, follow the setup section in the `scan-secrets` skill (install via the user's existing package manager, then `ggshield auth login`). Do not proceed with the scan until both checks pass.

## After the scan

- Exit `0`: report "no secrets found" and stop.
- Exit `1`: secrets detected. Report each finding (file, line, secret type, validity) and walk the user through removal — and rotation if the secret has ever been pushed to a remote. Refer to `references/remediation.md` in the skill for the full flow.
- Exit `128`: unexpected error. Surface the CLI's stderr and stop.

Do not commit or surface code containing a detected secret.
