---
name: scan-machine
description: Scan a developer's entire machine for credentials across local git repositories, dotfiles, ~/.aws/credentials, ~/.kube/config, ~/.docker/config.json, ~/.npmrc, browser profile databases, shell history, AI agent caches, and abandoned project trees via ggshield machine scan. Use when preparing to wipe, sell, or hand off a laptop, when onboarding a new machine, when auditing what credentials live on a machine, or when the user explicitly asks to inventory secrets on the system itself. Requires endpoint scanning enabled on the GitGuardian workspace; not available on Free.
metadata:
  version: "0.4.0" # x-release-please-version
---

# ggshield — Scan Machine

## Overview

`ggshield machine scan` scans the entire home directory for secrets across local git repositories, dotfiles (`~/.bashrc`, `~/.zshrc`, `~/.netrc`), shell history (`.zsh_history`, `.bash_history`), cloud CLI configs (`~/.aws/credentials`, `~/.kube/config`, `~/.docker/config.json`, `~/.npmrc`, `~/.pypirc`), AI agent caches (Cursor, Claude Code, Copilot), browser profile databases, archives, and abandoned project trees. Findings are stored in a local SQLite database (`~/.ggshield/ggshield_machine_scan.db`) and viewable in a local web dashboard.

This is distinct from `secret scan` (which targets a specific path, repo, image, or package). Machine scan is for *the machine itself*: "what credentials are sitting across this laptop, including local repositories and personal configuration files?" GitGuardian positions it as **endpoint protection** — typically rolled out across a fleet via MDM (Intune, Jamf), but also runnable ad-hoc by an individual developer whose workspace has it enabled.

**Two things have to be set up before `ggshield machine scan` runs at all:**

1. **Endpoint scanning enabled on the GitGuardian workspace.** Endpoint scanning is gated server-side; on Free, the plugin install will fail.
2. **The `machine_scan` plugin**, installed and enabled. Machine scan is not built into the base `ggshield` binary — it ships as a separate plugin that has to be installed via `ggshield plugin install` and enabled via `ggshield plugin enable machine_scan`. A fresh `ggshield` install does **not** include it. Until the plugin is enabled, `ggshield machine scan` will exit with "command not found" or a similar error.

Confirm both prerequisites *before* walking the user through a scan. If they're on Free, redirect them to `scan-secrets` (which works on Free for individual repos) and mention that machine scan requires endpoint scanning to be enabled on the workspace.

**Core rule:** confirm with the user *before* running. Machine scans inspect every file in `$HOME` including shell history and AI agent caches; that's invasive even when legitimate. State what will happen, ask once, then proceed.

## Start Here — Read This Before Doing Anything

**Do not skip this section.**

- **Confirm endpoint scanning is enabled first.** Machine scan is gated server-side and will not work on Free. If the user can't confirm endpoint scanning is enabled on their workspace, do not run the scan; redirect to `scan-secrets` (which covers individual repos on Free) and explain that machine scan requires the endpoint scanning capability.
- **Confirm the `machine_scan` plugin is installed and enabled.** Run `ggshield plugin list` *before* the first `ggshield machine scan` and look for `machine_scan` marked as enabled. If it isn't present or isn't enabled, run the **Setup → Step 3** flow below (install the plugin, then `ggshield plugin enable machine_scan`). Skipping this is the most common cause of `ggshield machine: command not found`.
- **Confirm the scope with the user before launching.** Tell them which `--mode` you're about to use and why. `quick` (credentials-only) is the safe default; `standard` and `full` walk the entire home directory and may take many minutes.
- **Do not run machine scans silently in the background.** They are long-running, produce large output, and may surface very personal credentials (browser saves, SSH keys). The user should be in front of the keyboard when this runs.
- **Always pair `-f json` with `--show-findings`** in agent contexts. The default output is summary stats only (counts) — useless for the agent. `--show-findings` reveals individual findings; `-f json` makes them parseable.
- **`--include-protected` requires macOS permission grants.** On macOS, `Desktop`, `Documents`, `Pictures`, and other TCC-protected directories are excluded by default. Passing `--include-protected` triggers a Full Disk Access prompt the first time — only suggest it after explaining the prompt.
- **Treat findings with the same care as production secrets.** Live credentials surfaced by a machine scan must be rotated immediately; dead credentials should still be removed. Never log raw secret values; report by file, line, type, and validity.
- **Run Onboarding first if the CLI isn't set up.** If `ggshield --version` fails or `ggshield api-status` errors, complete the **Onboarding (first use)** section in the `scan-secrets` skill before attempting a machine scan.

## When to Use

Trigger a machine scan when:

- The user is about to wipe, sell, hand off, or return a laptop and wants to know what credentials it holds
- The user has onboarded a new machine and wants to audit what credentials migrated over
- The user is auditing dev-machine hygiene before a compliance review, SOC 2 audit, or security questionnaire
- The user mentions `.aws/credentials`, `.kube/config`, `.npmrc`, `.pypirc`, `.docker/config.json`, or other CLI config files as a possible leak source
- The user suspects a former employee, contractor, or compromised account left credentials on a shared machine
- The user wants a credential inventory for the machine fed into GitGuardian for governance (`machine inventory`)
- The user explicitly asks to scan the machine, the laptop, the home folder, or everything on the system

What `ggshield machine` covers:

- Scan the home directory for 700+ secret types — same Rust detection engine `secret scan` uses
- Three scan depths: `quick` (credentials-only files), `standard` (entire home with sensible exclusions — the default), `full` (entire home with minimal exclusions)
- Validate secrets (`--analyze`, on by default) — distinguishes live from dead credentials
- Cross-check findings against HasMySecretLeaked (`--hmsl-check`, on by default) — flags credentials already leaking in public sources
- Store findings in a local SQLite database for triage (`~/.ggshield/ggshield_machine_scan.db`)
- Browse findings in a local web dashboard (`ggshield machine dashboard`)
- Generate a JSON inventory and upload to GitGuardian for governance (`ggshield machine inventory`)

For platform-wide topics (auth/scope recovery, instance URLs, headless setup), see [references/gitguardian-platform.md](references/gitguardian-platform.md).
For remediation guidance once findings are surfaced (rotation rules, removal flow), the same playbook as `scan-secrets/references/remediation-doctrine.md` applies — a found credential is a found credential regardless of which scanner found it.

## When Not to Use

Do not use this skill when:

- You only need to scan a single repository, directory, path, commit, Docker image, or package — use `scan-secrets`. Machine scan targets the whole home directory and is heavier than you want for a scoped check.
- You need a CI gate. Machine scan is an interactive endpoint-hygiene tool that writes to a local SQLite database and dashboard; it is not a pipeline pass/fail check — `scan-secrets` is.
- The workspace is on Free or does not have endpoint scanning enabled, or the `machine_scan` plugin is not installed and enabled. The scan cannot run; confirm both prerequisites first and otherwise redirect the user to `scan-secrets`.
- The goal is to check a *known* credential against the public-leak corpus — use `check-hmsl`.

## Quick Start (if ggshield is already installed, authorized, *and* the `machine_scan` plugin is enabled)

```bash
ggshield plugin list | grep machine_scan                         # confirm plugin enabled
ggshield api-status                                              # verify CLI is authenticated
ggshield machine scan --mode quick -f json --show-findings       # safe default — credentials-only
```

If `ggshield plugin list` doesn't show `machine_scan`, or `ggshield --version` fails, jump to **Onboarding (first use)** below.

## Onboarding (first use)

### Prerequisites

- **GitGuardian workspace with endpoint scanning enabled.** Endpoint scanning is gated server-side. On the Free plan the plugin install (and the scan command) will fail. Confirm before proceeding.
- **`ggshield` 1.45.0 or later** — minimum version that supports the plugin system. (For agent hooks via `ggshield install -t claude-code`, the floor is 1.49.0, but that's a separate skill — `scan-secrets`.)
- For fleet rollouts (security teams managing endpoints across an org), deployment is typically handled via **MDM** (Intune, Jamf) — `ggshield` and the plugin rolled out to managed endpoints with the auth config baked in. The skill below covers ad-hoc invocations by a developer whose workspace has endpoint scanning enabled; fleet deployment is out of scope.

### Setup

There are three things to set up in order: the `ggshield` binary, authentication, and the `machine_scan` plugin. Steps 1 and 2 are exactly the same as for `scan-secrets`. Step 3 is specific to this skill.

#### Step 1 — Install or upgrade `ggshield` to 1.45.0+

If `ggshield --version` fails or returns < 1.45.0, follow the full **Onboarding → Step 1 (Check / install ggshield)** section in the `scan-secrets` skill — detect the user's package manager, install or upgrade `ggshield`. Return here once `ggshield --version` reports 1.45.0 or later.

#### Step 2 — Authenticate

If `ggshield api-status` errors, follow the full **Onboarding → Step 2 (Authenticate and verify)** section in the `scan-secrets` skill — run `ggshield auth login` (or `--method token` for headless). Return here once `ggshield api-status` reports OK.

#### Step 3 — Install and enable the `machine_scan` plugin

Machine scan ships as a separate plugin, **not** as part of the base `ggshield` binary. It has to be installed and enabled before `ggshield machine scan` works.

**Discover, install, enable:**

```bash
ggshield plugin status                  # what's available for this account; prints the install command
ggshield plugin install machine_scan    # follow the command surfaced by `plugin status`
ggshield plugin enable machine_scan
```

`ggshield plugin status` is the single source of truth — it queries the GitGuardian platform for the plugins available to the user's account and prints the exact `ggshield plugin install` command to run. Use whatever it says. If `plugin status` returns a 404, the user's workspace does not have the plugin system enabled — that's a workspace-level configuration issue, not a CLI fix. Have them contact their GitGuardian admin or check whether endpoint scanning is enabled for the workspace.

#### Step 4 — Verify

```bash
ggshield plugin list          # confirm machine_scan shows up as enabled
ggshield machine --help       # the help should now resolve — base ggshield no longer says "no such command"
```

Once these both succeed, the skill is ready. Proceed to **Commands**.

## Commands

```bash
# Plugin operations — useful before/after scans
ggshield plugin status                                           # available plugins for this account
ggshield plugin list                                             # installed plugins + enabled state
ggshield plugin update --check                                   # check for plugin updates
ggshield plugin disable machine_scan                             # disable without uninstalling
ggshield plugin uninstall machine_scan                           # full removal

# Default scan modes — pick by scope
ggshield machine scan --mode quick -f json --show-findings       # credentials-only, fastest
ggshield machine scan --mode standard -f json --show-findings    # entire home with exclusions
ggshield machine scan --mode full -f json --show-findings        # entire home, minimal exclusions

# macOS: include TCC-protected directories (Desktop, Documents, Pictures)
ggshield machine scan --mode standard --include-protected -f json --show-findings

# Include build directories too (node_modules, .venv, target/)
ggshield machine scan --mode standard --thorough -f json --show-findings

# Scan a specific path on the machine instead of all of $HOME
ggshield machine scan /path/to/audit -f json --show-findings

# Force a fresh scan, ignoring the cache and any prior DB state
ggshield machine scan --rescan -f json --show-findings

# Stateless one-off (no DB writes, no cache, useful in CI)
ggshield machine scan --stateless -f json --show-findings

# Browse findings in a local web UI (default port 7890)
ggshield machine dashboard

# Generate a GitGuardian-uploadable inventory of credentials on the machine
ggshield machine inventory --output /tmp/inventory.json
```

Key flags:

| Flag | Effect |
|---|---|
| `--mode quick\|standard\|full` | Scope. `quick` = credentials-only files (fastest, safest default). `standard` = entire home with exclusions. `full` = minimal exclusions |
| `--include-protected` | macOS only — include TCC-protected directories. Triggers a Full Disk Access prompt the first time |
| `--thorough` | Include build directories (`node_modules`, `.venv`, `target/`, etc.) usually excluded for noise reasons |
| `-f, --format json` | Structured output — always pass in agent contexts |
| `--show-findings` | Show individual findings (overrides the default `--quiet` summary-only mode) |
| `--no-analyze` | Skip validation (faster, but loses live/dead classification) |
| `--no-hmsl-check` | Skip the HasMySecretLeaked cross-check |
| `--rescan` | Force a fresh scan, ignoring the cache |
| `--stateless` | One-off mode — no SQLite reads or writes |

Exit codes: `0` = no secrets found, non-zero = secrets found or an error occurred.

## Best Practices

- **Default to `--mode quick` for the first run.** It targets known credential files specifically — fast, low surprise. Escalate to `standard` or `full` only after the user has seen the quick-mode output and wants broader coverage.
- **Always pair `-f json` with `--show-findings`** in agent contexts. Without `--show-findings`, you only get counts.
- **Suggest `ggshield machine dashboard` for triage when the scan finds more than ~10 results.** The local web UI groups findings by detector, file, and validity — much easier than scrolling through JSON output.
- **Treat findings by validity:** live credentials need rotation now; dead credentials can be deleted in place. Walk the user through both per finding — the same remediation flow as `scan-secrets/references/remediation-doctrine.md` applies.
- **Do not paste raw secret values into the response.** Report file, line, secret type, and validity only. The user can read the value from the file themselves if they need it.
- **`ggshield machine inventory` uploads findings to GitGuardian.** Only run it when the user wants the machine's credentials inventoried in their workspace (governance / compliance use case). For a plain audit, stick with `ggshield machine scan`.

## Troubleshooting

**`ggshield: command not found`** — see the `scan-secrets` skill's Onboarding section.

**`ggshield machine: command not found` or `Error: No such command 'machine'`** — the `machine_scan` plugin isn't installed or isn't enabled. Run `ggshield plugin list` to confirm. If it's missing, return to **Onboarding → Step 3**. If it's listed as disabled, run `ggshield plugin enable machine_scan`.

**`Failed to fetch plugins: 404` on `ggshield plugin status`** — the user's GitGuardian workspace does not have the plugin system enabled. This is a workspace-level configuration, not a CLI fix. Have them contact their GitGuardian admin or check whether endpoint scanning is enabled for the workspace.

**`401 Unauthorized`** — token missing or invalid. Run `ggshield api-status`. For scope recovery, see [references/gitguardian-platform.md](references/gitguardian-platform.md).

**`403 Forbidden` / "Endpoint scanning not available on your plan"** — the user's GitGuardian workspace is on Free or otherwise does not have endpoint scanning enabled. The fix is a workspace entitlement change, not a CLI change. Direct the user to https://dashboard.gitguardian.com (Settings → Billing) or to contact their workspace administrator. There is no CLI workaround.

**`Permission denied` on macOS protected dirs** — `--include-protected` was passed but the terminal app has not been granted Full Disk Access. Open *System Settings → Privacy & Security → Full Disk Access* and add the terminal binary, then re-run.

**Scan runs but reports no findings on a machine you know has credentials** — `quick` mode only checks known credential files. Try `--mode standard` or add `--thorough`. Also confirm `~/.ggshield/ggshield_machine_scan.db` was created; if not, pass `--rescan`.

**First scan takes many minutes** — expected. The plugin indexes every file in scope on first run, then caches. Subsequent scans only re-process new/modified files.

**Cache returns stale findings** — pass `--rescan` to force re-analysis.

**Dashboard won't open** — port 7890 is in use. Override with `ggshield machine dashboard --port <other>`.

**Inventory upload fails with `403 Forbidden`** — the Personal Access Token lacks the `nhi:send-inventory` scope (or `nhi:write-vault`, which includes it). Generate a PAT with the right scope at `dashboard.gitguardian.com` → API → Personal Access Tokens, or run the scope-recovery flow in [references/gitguardian-platform.md](references/gitguardian-platform.md).

**Inventory hangs forever in a headless environment (CI, SSH, no browser)** — when the API key isn't on the command line, `ggshield machine inventory` spins up a localhost OAuth callback server and waits for a browser. Always pass `--api-key "$GITGUARDIAN_API_KEY"` explicitly in headless contexts; do not rely on the env var alone.

**TLS / certificate errors behind a corporate proxy** — set `REQUESTS_CA_BUNDLE=/path/to/ca-bundle.pem` (or `SSL_CERT_FILE`, or pass `--ssl-certificate`) so the plugin trusts the proxy's CA. Priority: `--ssl-certificate` > `REQUESTS_CA_BUNDLE` > `SSL_CERT_FILE`.

**Any other or unlisted error** — before improvising a fix, consult GitGuardian's AI-agent docs index at https://docs.gitguardian.com/llms.txt to locate the relevant page, then append `.md` to that page's URL to read it as Markdown. Search there first rather than guessing.
