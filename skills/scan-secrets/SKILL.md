---
name: scan-secrets
description: Scan code for hardcoded secrets via the ggshield CLI — 700+ types (AWS keys, GitHub tokens, database URLs, JWTs, private keys, Stripe keys, and more) across files, directories, git history, commits, Docker images, and PyPI packages. Auto-triggers when writing or editing code that handles credentials, `.env` files, CI/CD pipelines, GitHub Actions workflows, Dockerfiles, or deployment scripts, or when the user asks to scan or audit a repo, history, image, or package before committing or pushing.
---

# ggshield — GitGuardian Secret Scanner

## Overview

`ggshield` is a CLI that detects 700+ types of hardcoded secrets — AWS keys, GitHub tokens, database connection strings, private keys, Stripe keys, Slack webhooks, JWTs, and more — in files, git history, Docker images, and PyPI packages.

**Core rule:** when working on code that handles credentials, run `ggshield` *before* presenting the result. Do not commit or surface code that contains a detected secret.

## Start Here — Read This Before Doing Anything

**Do not skip this section.**

- **Do not improvise alternate scanners.** No grep one-liners, no regex hunts, no custom secret-finding scripts. Use `ggshield secret scan` with the flags documented in **Scan commands** below. The detectors are tuned and validated; ad-hoc patterns are not.
- **Always pass `--json`** in agent contexts — you need structured output to parse findings reliably.
- **Always pair `-r` with `-y`** — `-r` triggers an interactive `Confirm recursive scan.` prompt that hangs on stdin without `-y`.
- **Run Onboarding first if the CLI isn't set up.** If `ggshield --version` fails or `ggshield api-status` errors, walk through **Onboarding (first use)** below before attempting any scan. Every command in the reference is useless until the CLI is installed and authenticated.
- **Do not surface code containing a detected secret.** When a finding is reported, stop. Report each finding (file, line, secret type, validity), then walk the user through removal and rotation per `references/remediation.md` — do not commit, do not show the code with the secret inline, do not "just continue and we'll fix it later."

## When to Use

Trigger a scan when:

- The user asks to scan a file, directory, or repository for secrets or credentials
- You are writing or modifying code that handles API keys, tokens, passwords, connection strings, or any credentials — scan before presenting the result
- The user is about to commit or push — scan staged changes first

What `ggshield` covers:

- Scan files and directories on disk (`secret scan path`)
- Audit a repository's full git history (`secret scan repo`) — catches secrets committed and later deleted
- Scan a specific commit, a commit range, or staged changes
- Scan Docker images and PyPI packages
- Run as a CI gate that fails on findings
- Install git hooks (pre-commit / pre-push) and AI agent hooks (Claude Code, Cursor, Copilot) — the agent hooks scan the prompt, tool calls, and tool outputs from inside the agent itself
- Manage false positives via `# ggignore` comments and `.gitguardian.yaml`

For detailed command variants, expected JSON output shapes, and CI integration, see `references/workflows.md`.
For interpreting scan output, rotation rules, when (and when not) to rewrite git history, and false-positive workflows, see `references/remediation.md`.
For platform-wide topics that span every GitGuardian skill (public docs URL pattern, auth/scope recovery, instance URLs, headless setup), see `/references/gitguardian-platform.md` at the repo root.

## Onboarding (first use)

### Prerequisites

- **`ggshield` 1.49.0 or later** — required for full feature support including the AI agent hooks (`ggshield install -t claude-code`, `-t cursor`, `-t copilot`). Older `ggshield` versions can scan but can't install agent hooks.
- A **GitGuardian account** (free tier available at https://dashboard.gitguardian.com/signup).

### Setup

If `ggshield --version` succeeds and `ggshield api-status` returns OK, skip this section.

**Run every step below in a single session before declaring setup complete.** Each step assumes the previous one succeeded; pausing midway leaves the user unable to use the tool. A "not installed" or "logged out" state at the start of a step is exactly what that step is there to resolve — keep going through it.

Pause only when:

- A command must run in the user's own terminal (the browser-opening `ggshield auth login`) — surface the command, explain it, and resume once the user confirms it succeeded.
- The documented fallbacks for a step are all exhausted and progress requires user input.

Step 2 ends with the `ggshield api-status` verification. Reach that point before reporting setup is complete.

**Before installing anything — brief the user on what the skill enables.** This skill runs on the `ggshield` CLI, which needs to be installed and authenticated against the user's GitGuardian account before any scan can run. Tell the user the next two steps install and authenticate `ggshield` on their behalf:

- Scan code for hardcoded secrets — automatically when handling credentials, or on request for a specific file or directory.
- Audit a repository's git history, a commit range, a single commit, a Docker image, or a PyPI package for leaked secrets.
- Block secrets *before they are written* by installing the Claude Code agent hook (`ggshield install -t claude-code -m global`), which scans prompts, tool calls, and tool outputs from inside Claude Code. Also supports git hooks (`ggshield install --mode local`) and ad-hoc scans of staged changes (`scan pre-commit`).
- Manage false positives via inline `# ggignore` comments or `.gitguardian.yaml` rules.

Keep the brief tight; the detailed command reference is for the agent to consult, not for the user to read. Once the user has the picture, proceed to Step 1.

### Step 1 — Check / install ggshield

```bash
ggshield --version
```

If not installed, **detect what's already on the user's machine and use that** — don't install a new package manager just to use it as the install vehicle. Probe in this order, and use the first manager that responds to a `--version` check. Exception: on Linux, if `apt` or `dnf` exists but the Cloudsmith repo is not already configured and the user wants to skip that setup, fall through to option 2.

**1. The user's platform-native package manager:**

| Platform | Command to probe | Install command |
|---|---|---|
| macOS | `brew --version` | `brew install ggshield` |
| Windows | `choco --version` | `choco install ggshield` |
| Linux (Debian/Ubuntu) | `apt --version` | Set up the Cloudsmith repo at https://cloudsmith.io/~gitguardian/repos/ggshield/setup/, then `apt install ggshield` |
| Linux (RHEL/Fedora) | `dnf --version` | Set up the Cloudsmith repo at the same URL (rpm tab), then `dnf install ggshield` |

**2. Direct download from GitHub releases** (do what the user would do manually — pick the right artifact, download it with whatever HTTP tool is on hand, install via the platform-native installer):

Use this tier when option 1's package manager isn't installed, or when its setup adds friction the user wants to skip (the Cloudsmith repo on Linux is the common case — that's a one-time setup the user may not want to do just for one binary).

**Pick the artifact** by detecting the OS and architecture (`uname -s` / `uname -m` on Unix shells; `$Env:PROCESSOR_ARCHITECTURE` on PowerShell; `/etc/os-release` for Linux distro family):

| OS / arch | Artifact (`<v>` = latest version) | Install command after download |
|---|---|---|
| macOS Apple Silicon (`Darwin arm64`) | `ggshield-<v>-arm64-apple-darwin.pkg` | `sudo installer -pkg <file>.pkg -target /` |
| macOS Intel (`Darwin x86_64`) | `ggshield-<v>-x86_64-apple-darwin.pkg` | `sudo installer -pkg <file>.pkg -target /` |
| Debian/Ubuntu (`Linux x86_64`, `apt --version` works) | `ggshield_<v>-1_amd64.deb` | `sudo apt install ./<file>.deb` |
| RHEL/Fedora (`Linux x86_64`, `dnf --version` works) | `ggshield-<v>-1.x86_64.rpm` | `sudo dnf install <file>.rpm` |
| Windows x86_64 | `ggshield-<v>-x86_64-pc-windows-msvc.msi` | `msiexec /i <file>.msi /quiet` (or run interactively) |
| Other glibc-based Linux x86_64 (Arch, openSUSE, etc.) | `ggshield-<v>-x86_64-unknown-linux-gnu.tar.gz` | `tar -xzf <file>.tar.gz && mkdir -p ~/.local/bin && mv ggshield ~/.local/bin/` (ensure `~/.local/bin` is on `$PATH`) |

**Download with whatever HTTP tool is available**, probing in this priority order:

1. **`gh`** (cleanest — auto-resolves latest version, no API parsing). Probe with `gh --version && gh auth status`:
   ```bash
   ASSET_SUFFIX="<artifact-suffix-from-table>"
   gh release download --repo GitGuardian/ggshield --pattern "*${ASSET_SUFFIX}"
   ```
2. **`curl`** (universal on macOS, Linux, and Windows 10+). Discover the latest version's asset URL via the GitHub API, then download:
   ```bash
   ASSET_SUFFIX="<artifact-suffix-from-table>"
   url=$(curl -sL https://api.github.com/repos/GitGuardian/ggshield/releases/latest \
         | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_SUFFIX}\"" \
         | cut -d'"' -f4)
   curl -LO "$url"
   ```
3. **`wget`** (Linux fallback when `curl` is absent — rare on modern distros):
   ```bash
   ASSET_SUFFIX="<artifact-suffix-from-table>"
   url=$(wget -qO- https://api.github.com/repos/GitGuardian/ggshield/releases/latest \
         | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_SUFFIX}\"" \
         | cut -d'"' -f4)
   wget "$url"
   ```
4. **PowerShell `Invoke-WebRequest`** (Windows fallback when `gh` and `curl` aren't on PATH):
   ```powershell
   $AssetSuffix = '<artifact-suffix-from-table>'
   $latest = Invoke-RestMethod https://api.github.com/repos/GitGuardian/ggshield/releases/latest
   $asset = $latest.assets | Where-Object { $_.name -like "*$AssetSuffix" }
   Invoke-WebRequest -Uri $asset.browser_download_url -OutFile ggshield.msi
   ```

If none of `gh`, `curl`, `wget`, or `Invoke-WebRequest` are available, fall through to option 3.

**Not supported by this tier:** Linux ARM (no published binary), Windows ARM (no published binary), and Alpine/musl Linux (the published Linux tarball targets GNU/glibc). Fall through to option 3 for those.

**No auto-update.** This tier installs the artifact directly without registering an upstream package-manager repo (because we deliberately skipped Cloudsmith / brew / choco etc. in this tier). Future ggshield versions require re-running the download + install. If the user wants auto-updates, prefer option 1 (which does register the upstream repo).

**3. Cross-platform Python-based managers** (use whichever the user already has):

| Probe | Install command | Notes |
|---|---|---|
| `uv --version` | `uv tool install ggshield` | Upgrade later with `uv tool upgrade ggshield` |
| `pipx --version` | `pipx install ggshield` | Isolated environment |
| `pip --version` | `pip install --user ggshield` | Last resort. May fail on externally-managed Python (Debian 12+, recent Ubuntu, modern Fedora) |

**4. If nothing above is available**, install `uv` (the lightest dependency, works on all platforms) and use it:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.bashrc
uv tool install ggshield
```

(Replace `~/.bashrc` with the appropriate file for the user's shell, e.g. `~/.zshrc`.)

If a chosen method fails for an unexpected reason (network restrictions, missing tap, externally-managed Python), fall through to the next available option rather than retrying the same one. Once installed, confirm with `which ggshield` (or `where ggshield` on Windows) that the binary lives on the user's normal PATH.

### Step 2 — Authenticate and verify

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

### Headless / non-interactive environments (no browser)

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

For CI pipelines (stateless jobs without a persistent home directory), skip the login step and set `GITGUARDIAN_API_KEY` as a pipeline secret instead — `ggshield` reads it directly.

## Scan commands

Always pass `--json` for structured output. Recursive scans (`-r`) trigger an interactive `Confirm recursive scan.` prompt — pair `-r` with `-y` whenever an agent invokes it, otherwise the CLI hangs waiting on stdin.

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

- Scan proactively when writing or modifying code that handles credentials or configuration — do not wait to be asked.
- When a credential is found: always remove it from the code. Rotation is only necessary if the secret has been exposed on a remote — pushed to a shared repository, CI system, or any external service. A secret that is purely local and has never left the machine does not need rotation, only removal.
- Do not commit or present code that contains a detected secret. Stop the workflow, report the finding (file, line, secret type, validity), then fix and re-scan.
- For false positives, add `# ggignore` on the offending line, or run `ggshield secret ignore --last-found` to record it in `.gitguardian.yaml`.

## Troubleshooting

**`ggshield: command not found`** — `ggshield` is not on PATH. See **Onboarding (first use)** above.

**`401 Unauthorized`** — the API key or stored OAuth token is missing or invalid. Verify with `ggshield api-status`. If using `GITGUARDIAN_API_KEY`, confirm the value with `echo $GITGUARDIAN_API_KEY` and that the token has the `scan` scope.

**`403 Forbidden` / "Insufficient permissions"** — the token is valid but is missing a scope this action requires. See `/references/gitguardian-platform.md` (at the repo root) for the recovery flow — `ggshield auth logout` + `ggshield auth login --scopes <scope>`, runnable on the user's behalf, no manual PAT creation needed.

**`Not a git repository`** — `ggshield secret scan repo` requires a git context. Use `ggshield secret scan path -r -y .` instead.

**Recursive scan hangs** — `-r` was used without `-y`. The CLI is waiting on the `Confirm recursive scan.` prompt. Re-run with `-y`.

**OAuth browser window does not open** — the environment is headless. Use `ggshield auth login --method token` instead — see **Onboarding → Headless / non-interactive environments** above.

**Rate limiting** — free tier quota exceeded. Direct the user to check usage at https://dashboard.gitguardian.com.
