---
name: scan-secrets
description: "[AGENT-EXECUTABLE] Use when scanning code, commits, git history, Docker images, or packages for hardcoded secrets. Use when editing credential-handling code, `.env` files, CI/CD workflows, Dockerfiles, deployment scripts, or before committing or pushing. Authorization to run `ggshield secret scan` does NOT extend to `ggshield hmsl *` — HMSL is user-run only (agent prepares the command, the user executes it)."
---

# ggshield — GitGuardian Secret Scanner

## Overview

`ggshield` is a CLI that detects 700+ types of hardcoded secrets — AWS keys, GitHub tokens, database connection strings, private keys, Stripe keys, Slack webhooks, JWTs, and more — in files, git history, Docker images, and PyPI packages.

**Core rule:** when working on code that handles credentials, run `ggshield` *before* presenting the result. Do not commit or surface code that contains a detected secret.

## Start Here — Read This Before Doing Anything

**Do not skip this section.**

- **Do not improvise alternate scanners.** No grep one-liners, no regex hunts, no custom secret-finding scripts. Use `ggshield secret scan` with the flags documented in **Scan commands** below. The detectors are tuned and validated; ad-hoc patterns are not.
- **Do not improvise remediation advice.** No general-knowledge rotation walkthroughs, no improvised `git filter-repo` / BFG suggestions, no HMSL omissions. When `ggshield` returns one or more findings, **read [`references/remediation-doctrine.md`](references/remediation-doctrine.md) before composing any user-facing remediation message** — the doctrine differs from common defaults in important ways (rotation > history rewrite; HMSL is the prescribed follow-up for unverifiable validity).
- **Always pass `--json`** in agent contexts — you need structured output to parse findings reliably.
- **Always pair `-r` with `-y`** — `-r` triggers an interactive `Confirm recursive scan.` prompt that hangs on stdin without `-y`.
- **Run Onboarding first if the CLI isn't set up.** If `ggshield --version` fails or `ggshield api-status` errors, follow [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md) before attempting any scan. Every scan command is useless until the CLI is installed and authenticated.
- **Do not surface code containing a detected secret.** When a finding is reported:
  1. Stop. Report each finding (file, line, secret type, **validity**).
  2. **Read [`references/remediation-doctrine.md`](references/remediation-doctrine.md) end-to-end** — do not skip this step. Common defaults on history rewriting, rotation triggers, and HMSL follow-up diverge from GitGuardian doctrine.
  3. Compose the remediation message: rotation first, HMSL follow-up for unverifiable-validity findings, history-rewrite only under the narrow conditions listed in the reference.

  Do not commit, do not show the code with the secret inline, do not "just continue and we'll fix it later."
- **Do not extend this skill's agent-executable contract to HMSL.** When a finding's `validity` is `unknown`, `cannot_check`, or `no_checker`, the natural follow-up is HasMySecretLeaked (HMSL) — GitGuardian's privacy-preserving hash-lookup service for *known* credentials against the public-leak corpus. HMSL has a **different execution model — user-run only** — and the contract holds whether or not the user has the dedicated `check-hmsl` skill installed:
  - Do **not** invoke `ggshield hmsl check`, `fingerprint`, `query`, `decrypt`, or `check-secret-manager` yourself.
  - Do **not** read the credential file with `Read` / `Grep` / `cat` / `head` / `tail` / `sed` / `awk` / `less` / `xxd` / `wc` / `file` / `ls` or any other tool — that pulls plaintext into the agent context before HMSL's local-hashing protocol can protect it.
  - Print the exact command for the user to run in their own terminal. Use `-n none --json` so the output the user pastes back contains no identifying hints. Suggest `ggshield hmsl quota` before any bulk check. Refuse `--naming-strategy cleartext` outright.
  - If the user has the `check-hmsl` skill installed, the agent should load it for the full protocol and command set; if not, the rules above are sufficient on their own — do not gate the follow-up on having the other skill.

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

For detailed command variants, expected JSON output shapes, and CI integration, see [references/workflows.md](references/workflows.md).
For interpreting scan output, the HMSL follow-up contract, and false-positive workflows, see [references/interpreting-results.md](references/interpreting-results.md).
For remediation — triage, rotation rules, when (and when not) to rewrite git history, per-secret-type runbooks, and validation, see [references/remediation-doctrine.md](references/remediation-doctrine.md).
For shared `ggshield` install, authentication, headless setup, CI tokens, and hook-install commands, see [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md).
For platform-wide topics that span every GitGuardian skill (public docs URL pattern, auth/scope recovery, instance URLs, headless setup), see [references/gitguardian-platform.md](references/gitguardian-platform.md).

## Onboarding (first use)

### Prerequisites

- **`ggshield` 1.49.0 or later** — required for full feature support including the AI agent hooks (`ggshield install -t claude-code`, `-t cursor`, `-t copilot`). Older `ggshield` versions can scan but can't install agent hooks.
- A **GitGuardian account** (free tier available at https://dashboard.gitguardian.com/signup).

### Setup

If `ggshield --version` succeeds and `ggshield api-status` returns OK, skip shared setup. Otherwise follow [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md) and return here once both checks pass.

#### Step 1 (recommended) — Install the agent hook for defense in depth

Once `ggshield` is installed and authenticated, the recommended first action on a new machine is installing the agent hook. The hook scans prompts, tool inputs, and tool outputs from inside the agent for detected secrets and blocks them before they reach the model context — defense in depth against the agent inadvertently reading or echoing a credential. Match the user's agent:

```bash
ggshield install -t claude-code -m global     # Claude Code
ggshield install -t cursor -m global          # Cursor
ggshield install -t copilot -m global         # Copilot
```

Propose this on first use with a one-liner: *"For defense in depth — so credentials in files I read never reach my transcript — install the agent hook now? (`ggshield install -t claude-code -m global`)"* Wait for the user's yes/no. The hook is one layer of defense; the user-run-only rule for `ggshield hmsl *` documented in **Start Here** is the other. The two are complementary, not substitutes.

#### Step 2 — Brief the user on what this skill enables

- Scan code for hardcoded secrets — automatically when handling credentials, or on request for a specific file or directory.
- Audit a repository's git history, a commit range, a single commit, a Docker image, or a PyPI package for leaked secrets.
- Block secrets *before they are written* via the agent hook installed in Step 1; or via git hooks (`ggshield install --mode local`) and ad-hoc scans of staged changes (`scan pre-commit`).
- Manage false positives via inline `# ggignore` comments or `.gitguardian.yaml` rules.

Keep the brief tight; the detailed setup reference is for the agent to consult, not for the user to read.

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

## When findings are present — quick reference

Full doctrine in [`references/remediation-doctrine.md`](references/remediation-doctrine.md) — load it before composing any user-facing remediation message. Dispatch by which command produced the finding:

| Detection context | Doctrine entry point |
|---|---|
| Agent file-edit hook fired (in-buffer / just-saved file) | [§ 5.1](references/remediation-doctrine.md#51-agent-file-edit-hook-fired) |
| Pre-commit hook fired (staged change blocked) | [§ 5.2](references/remediation-doctrine.md#52-pre-commit-hook-fired) |
| Pre-push hook fired (unpushed commits blocked) | [§ 5.3](references/remediation-doctrine.md#53-pre-push-hook-fired) |
| Repo / commit / Docker image / PyPI package scan finding | Triage in [§ 6](references/remediation-doctrine.md#6-post-leak--public-facing-track) (public) or [§ 7](references/remediation-doctrine.md#7-post-leak--internal-private-track) (internal-private) per where the artifact lives |

The three triggers most often missed:

- **Pushed to a remote → rotate.** History rewriting is generally discouraged once secrets are pushed; rotation is the actual remediation. Do not lead with `git filter-repo` / BFG.
- **Validity is `unknown` / `cannot_check` / `no_checker` / `failed_to_check` → propose HMSL** as the natural follow-up to check public leakage. Prepare the command (`ggshield hmsl quota`, then `ggshield hmsl check ... -n none --json`); **the user runs it**. Never invoke `ggshield hmsl *` yourself, never read the credential file.
- **Local, never pushed → remove, don't rotate.** Rewriting unpushed history is cheap and worth doing here.

## Best Practices

- Scan proactively when writing or modifying code that handles credentials or configuration — do not wait to be asked.
- When a credential is found: always remove it from the code. Rotation is only necessary if the secret has been exposed on a remote — pushed to a shared repository, CI system, or any external service. A secret that is purely local and has never left the machine does not need rotation, only removal.
- Do not commit or present code that contains a detected secret. Stop the workflow, report the finding (file, line, secret type, validity), then fix and re-scan.
- For false positives, add `# ggignore` on the offending line, or run `ggshield secret ignore --last-found` to record it in `.gitguardian.yaml`.

## Troubleshooting

**`ggshield: command not found`** — `ggshield` is not on PATH. See **Onboarding (first use)** above.

**`401 Unauthorized`** — the API key or stored OAuth token is missing or invalid. Verify with `ggshield api-status`. If using `GITGUARDIAN_API_KEY`, confirm the value with `echo $GITGUARDIAN_API_KEY` and that the token has the `scan` scope.

**`403 Forbidden` / "Insufficient permissions"** — the token is valid but is missing a scope this action requires. See [references/gitguardian-platform.md](references/gitguardian-platform.md) for the recovery flow — `ggshield auth logout` + `ggshield auth login --scopes <scope>`, runnable on the user's behalf, no manual PAT creation needed.

**`Not a git repository`** — `ggshield secret scan repo` requires a git context. Use `ggshield secret scan path -r -y .` instead.

**Recursive scan hangs** — `-r` was used without `-y`. The CLI is waiting on the `Confirm recursive scan.` prompt. Re-run with `-y`.

**OAuth browser window does not open** — the environment is headless. Use `ggshield auth login --method token` instead — see **Onboarding → Headless / non-interactive environments** above.

**Rate limiting** — free tier quota exceeded. Direct the user to check usage at https://dashboard.gitguardian.com.
