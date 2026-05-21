---
name: "ggshield-secret-scanner"
displayName: "GitGuardian Secret Scanner"
description: "Detect and prevent hardcoded secrets and credentials before they reach git — API keys, OAuth tokens, database URLs, JWTs, AWS credentials, GitHub tokens, Stripe keys, private keys, and 700+ other secret types. Relevant whenever the agent writes or edits code that handles authentication, environment variables, .env files, configuration files, CI/CD pipelines, GitHub Actions workflows, Dockerfiles, deployment scripts, or anywhere a credential could be inadvertently committed. Uses the ggshield CLI to scan files, directories, git history, commits, commit ranges, Docker images, and PyPI packages, and to install pre-commit / pre-push hooks."
keywords: [
  "ggshield", "gitguardian",
  "secrets", "credentials", "keys", "tokens", "passwords",
  "env-file", "dotenv", "config",
  "security", "scan"
]
author: "GitGuardian"
---

# GitGuardian Secret Scanner

## Overview

This power gives you the `ggshield` CLI for finding hardcoded secrets and credentials. It detects 700+ secret types — AWS keys, GitHub tokens, database connection strings, private keys, Stripe keys, Slack webhooks, and more.

What `ggshield` lets you do here:
- Scan files and directories on disk for secrets
- Audit a repository's full git history (catches secrets that were committed and later deleted)
- Scan a specific commit, a commit range, or staged changes (pre-commit)
- Scan Docker images and PyPI packages
- Run as a CI gate that fails the pipeline on findings
- Install git hooks (pre-commit / pre-push) — and AI agent hooks for users who also run Claude Code, Cursor, or Copilot alongside Kiro (those hooks scan prompts, tool calls, and tool outputs from inside the agent)
- Manage false positives via `# ggignore` comments and `.gitguardian.yaml`

Trigger a scan proactively whenever:
- The user asks to scan a file, directory, or repository for secrets or credentials
- You are writing or modifying code that handles API keys, tokens, passwords, connection strings, or any credentials — scan before presenting the result
- The user is about to commit or push — scan staged changes first

## Available Steering Files

- **ggshield-scan-workflows** — CLI scan command variants, required flags, exit codes, CI integration, git hook setup
- **ggshield-remediation** — interpreting scan output fields, rotating vs. removing secrets, cleaning git history, ignoring false positives, `.gitguardian.yaml` configuration

## Scan commands

Always pass `--json` for structured output. Recursive scans (`-r`) trigger an interactive `Confirm recursive scan.` prompt — pass `-y` whenever you use `-r` so the agent doesn't hang on confirmation.

```bash
ggshield secret scan repo . --json                       # full git history
ggshield secret scan path -r -y . --json                 # current files, no git required
ggshield secret scan path <file> --json                  # single file (no -r needed)
ggshield secret scan pre-commit --json                   # staged changes
ggshield secret scan commit-range HEAD~5..HEAD --json    # commit range
ggshield secret scan commit <sha> --json                 # specific commit
ggshield secret scan docker <image> --json               # Docker image
ggshield secret scan pypi <package> --json               # PyPI package
```

Key flags:

| Flag | Effect |
|---|---|
| `--json` | Structured JSON output — always use in automated contexts |
| `-y` / `--yes` | Auto-confirm interactive prompts. **Required whenever `-r` is used in agent contexts** |
| `--exit-zero` | Always exit 0, report findings without blocking CI |
| `--ignore-known-secrets` | Skip secrets already tracked in the GitGuardian dashboard |
| `--minimum-severity <level>` | Only report findings at or above the given severity (`info`, `low`, `medium`, `high`, `critical`) |
| `--output <file>` | Write results to a file instead of stdout |

Exit codes: `0` = no secrets found, `1` = secrets detected, `128` = unexpected error.

## Best Practices

- Call a scan proactively when writing or modifying code that handles credentials or configuration — do not wait to be asked.
- When finding a crdential: always remove it from the code. Rotation is only necessary if the secret has been exposed on a remote — pushed to a shared repository, CI system, or any external service. A secret that is purely local and has never left the machine does not need rotation, only removal.
- Do not commit or present code that contains a detected secret. Stop the workflow, report the finding with file, line, secret type, and validity, then fix and re-scan.
- For false positives, add `# ggignore` on the offending line, or run `ggshield secret ignore --last-found` to record it in `.gitguardian.yaml`.

## Troubleshooting

**`ggshield: command not found`** — `ggshield` is not on PATH. See the install section below.

**`401 Unauthorized`** — the API key or stored OAuth token is missing or invalid. Verify with `ggshield api-status`. If using `GITGUARDIAN_API_KEY`, confirm the value with `echo $GITGUARDIAN_API_KEY` and that the token has the `scan` scope.

**`Not a git repository`** — `ggshield secret scan repo` requires a git context. Use `ggshield secret scan path -r -y .` instead (the `-y` skips the recursive-scan confirmation prompt).

**Recursive scan hangs** — `-r` was used without `-y`. The CLI is waiting on the `Confirm recursive scan.` prompt. Re-run with `-y`.

**OAuth browser window does not open** — the environment is headless. Use `ggshield auth login --method token` instead — see the auth section below.

**Rate limiting** — free tier quota exceeded. Direct the user to check usage at https://dashboard.gitguardian.com.

## Configuration

### Prerequisites
- A GitGuardian account (free tier available at https://dashboard.gitguardian.com/signup)

### Setup (first use)

**Run every step below in a single session before declaring setup complete.** Each step assumes the previous one succeeded; pausing midway leaves the user unable to use the power. A "not installed" or "logged out" state at the start of a step is exactly what that step is there to resolve — keep going through it.

Pause only when:
- A command must run in the user's own terminal (the browser-opening `ggshield auth login`) — surface the command, explain it, and resume once the user confirms it succeeded.
- The documented fallbacks for a step are all exhausted and progress requires user input.

Step 2 ends with the `ggshield api-status` verification. Reach that point before reporting setup is complete.

**Before installing anything — brief the user on what the power lets them do.** This power runs on the `ggshield` CLI, which needs to be installed and authenticated against the user's GitGuardian account before any scan can run. Open by telling the user what the power will give them, and that the next two steps install and authenticate `ggshield` on their behalf:

- Scan code for hardcoded secrets — automatically when handling credentials, or on request for a specific file or directory.
- Audit a repository's git history, a commit range, a single commit, a Docker image, or a PyPI package for leaked secrets.
- Block secrets at commit time with a git hook (`ggshield install --mode local`) or ad-hoc scans of staged changes (`scan pre-commit`). If the user also runs Claude Code, Cursor, or Copilot, `ggshield install -t <tool> -m global` adds an agent-level hook that scans prompts, tool calls, and tool outputs before they execute.
- Manage false positives via inline `# ggignore` comments or `.gitguardian.yaml` rules.

Keep the brief tight; the detailed command reference is in this `POWER.md` for the agent to consult, not for the user to read. Once the user has the picture, proceed to Step 1.

**Step 1 — Check if `ggshield` is installed:**

```bash
ggshield --version
```

If not installed, **detect what's already on the user's machine and use that** — don't install a new package manager just to use it as the install vehicle. Probe in this order, and use the first manager that responds to a `--version` check:

**1. The user's platform-native package manager:**

| Platform | Command to probe | Install command |
|---|---|---|
| macOS | `brew --version` | `brew install ggshield` |
| Windows | `choco --version` | `choco install ggshield` |
| Linux (Debian/Ubuntu) | `apt --version` | Set up the Cloudsmith repo at https://cloudsmith.io/~gitguardian/repos/ggshield/setup/, then `apt install ggshield` |
| Linux (RHEL/Fedora) | `dnf --version` | Set up the Cloudsmith repo at the same URL (rpm tab), then `dnf install ggshield` |

**2. Cross-platform Python-based managers** (use whichever the user already has):

| Probe | Install command | Notes |
|---|---|---|
| `uv --version` | `uv tool install ggshield` | Upgrade later with `uv tool upgrade ggshield` |
| `pipx --version` | `pipx install ggshield` | Isolated environment |
| `pip --version` | `pip install --user ggshield` | Last resort. May fail on externally-managed Python (Debian 12+, recent Ubuntu, modern Fedora) |

**3. Standalone packages** (no Python required, manual upgrades):

- macOS: `.pkg` from https://github.com/GitGuardian/ggshield/releases
- Windows: `.zip` from the releases page — unpack and add to `%PATH%`

**4. If nothing above is available**, install `uv` (the lightest dependency, works on all platforms) and use it.

> **Supply-chain note (CWE-494):** unlike the package-manager paths above, the `astral.sh/uv/install.sh` script is fetched at runtime over HTTPS — piping it straight to `sh` runs whatever the host serves. Download the script to a file first, surface it to the user so they can inspect it (or verify it against the checksum published at https://docs.astral.sh/uv/getting-started/installation/), and only execute after the user confirms. Do not run the standalone installer autonomously.

```bash
# Step 1: download the installer (do not execute yet)
curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv-install.sh

# Step 2: ask the user to inspect /tmp/uv-install.sh — or verify its checksum
# against the value published at https://docs.astral.sh/uv/getting-started/installation/
# — before running it.

# Step 3: once the user confirms, execute and load uv onto PATH
sh /tmp/uv-install.sh && . ~/.bashrc
uv tool install ggshield
```

(Replace `~/.bashrc` with the appropriate file for the user's shell, e.g. `~/.zshrc`.) If the user prefers not to run an unverified remote installer, fall back to a platform-native option from the tables above instead.

If a chosen method fails for an unexpected reason (network restrictions, missing tap, externally-managed Python), fall through to the next available option rather than retrying the same one. Once installed, confirm with `which ggshield` (or `where ggshield` on Windows) that the binary lives on the user's normal PATH.

**Step 2 — Authenticate and verify.**

This step has two parts: hand the user the auth command (the only manual action they need to take), and verify the CLI is authenticated.

**2a — Give the user the `ggshield auth login` command.** Present the command with the GitGuardian instance options inline. By default (no flag), it targets SaaS US:

```bash
# SaaS US — default
ggshield auth login

# SaaS EU — pass the EU dashboard URL
ggshield auth login --instance https://dashboard.eu1.gitguardian.com

# Self-hosted GitGuardian — pass the user's own instance URL
ggshield auth login --instance https://<their-instance-url>
```

Tell the user the command opens a browser to authorize their workstation, and ask them to confirm once it succeeds.

**2b — Verify the CLI is authenticated.** Once the user confirms `ggshield auth login` succeeded, run:

```bash
ggshield api-status
```

A successful response confirms the credentials are stored locally and the API is reachable.

**Headless / non-interactive environments (no browser):**

When `ggshield auth login` can't open a browser (remote SSH, sandboxed dev container), use `--method token` instead. The user creates a Personal Access Token at https://dashboard.gitguardian.com/api/personal-access-tokens (or their instance's equivalent) with the `scan` scope, then runs:

```bash
# SaaS US — default
ggshield auth login --method token

# SaaS EU or self-hosted — pass the instance URL
ggshield auth login --method token --instance https://dashboard.eu1.gitguardian.com
```

`ggshield` prompts for the token on stdin and stores it in the same local config the OAuth flow uses — no `GITGUARDIAN_API_KEY` export and no shell-profile edit needed. Verify with:

```bash
ggshield api-status
```
