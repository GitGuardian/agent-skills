---
name: check-hmsl
description: Check whether a *known* credential has been seen leaking publicly via GitGuardian's HasMySecretLeaked (HMSL) — a privacy-preserving hash-lookup service against GitGuardian's database of secrets harvested from public GitHub, gists, Docker Hub, and other public sources. Use when the user inherits credentials from a teammate, suspects a specific token may have leaked, wants to vet a secret-manager (HashiCorp Vault) inventory against public leaks, or asks "has this secret been leaked / is this credential compromised / check this against HMSL". Distinct from `scan-secrets` — that finds *unknown* secrets in code; this checks *known* secrets against the public-leak database.
---

# ggshield — Check HasMySecretLeaked (HMSL)

## Overview

HMSL ([hasmysecretleaked.com](https://www.hasmysecretleaked.com/)) is GitGuardian's public hash-lookup service for known secrets. You bring a credential, HMSL tells you whether it's been seen leaking in public sources (public GitHub repos, gists, Docker Hub, npm, PyPI, and more). The plaintext credential never leaves the machine — `ggshield` hashes it locally with a slow memory-hard scheme (HMSL protocol) and submits hash prefixes only.

This is the inverse of `scan-secrets`. `scan-secrets` finds *unknown* secrets in files you control. `check-hmsl` checks *known* secrets you already have against the public-leak corpus: a `.env` you inherited from a former teammate, a token someone pasted into Slack, a credential dump from a possibly-compromised system, or the full inventory of a secret manager.

**Core rule:** never let raw credential values flow into agent transcripts, prompts, or tool outputs. Always read secrets from a file (or stdin redirect) — do not paste a credential into the chat to "have the agent check it." The whole point of HMSL is that plaintext stays local.

## Start Here — Read This Before Doing Anything

**Do not skip this section.**

- **Never paste a raw secret into the conversation.** The user must put credentials in a file (or pipe them via stdin from a tool the user controls). The agent invokes `ggshield hmsl check <path>` against that file. If the user offers a secret inline, refuse and redirect: *"Drop it in a file and tell me the path — that way the value never enters the transcript."*
- **Use `--naming-strategy key`** (the default) or `censored` for outputs. Never use `cleartext` — it would surface the secret in the agent's output. The `key` strategy emits the variable name (e.g., `AWS_SECRET_KEY`) as the hint; `censored` shows the first/last characters only.
- **Always pass `--json`** in agent contexts for parseable output.
- **For sensitive secrets, use the multi-stage `fingerprint` / `query` / `decrypt` flow** instead of one-shot `check`. The multi-stage form keeps the plaintext on the user's machine and only sends hash prefixes to HMSL; the one-shot `check` form also hashes locally, but the fingerprint/query/decrypt split makes the privacy posture explicit and lets the user review hashes before sending.
- **Run Onboarding first if the CLI isn't set up.** If `ggshield --version` fails or `ggshield hmsl api-status` errors, walk through **Onboarding (first use)** below before attempting any HMSL command.
- **Quota matters.** HMSL has a daily credit quota (`ggshield hmsl quota` shows current). One file = one query bundle; large inventories may consume significant credits. Surface the remaining quota before launching bulk checks.

## When to Use

Trigger an HMSL check when:

- The user inherits credentials from a former teammate, contractor, or compromised account and wants to know which are already public
- The user suspects a specific token, key, or password may have leaked — Slack pastes, accidental commits later force-pushed away, public CI logs, etc.
- The user wants to audit a HashiCorp Vault instance against the public-leak corpus (`check-secret-manager hashicorp-vault`)
- The user has a list of credentials in a file (CSV, env, plain text) and wants to bulk-check them
- The user explicitly mentions "HMSL", "HasMySecretLeaked", "has this secret leaked", "is this credential compromised", "check against the public leaks", "see if this token is out there"

What `ggshield hmsl` covers:

- One-shot check of secrets in a file or stdin (`hmsl check`)
- Multi-stage privacy-preserving check: `fingerprint` (compute hashes locally) → `query` (send hash prefixes to HMSL) → `decrypt` (resolve which input secrets matched)
- HashiCorp Vault audit (`check-secret-manager hashicorp-vault`)
- Quota check (`hmsl quota`)
- HMSL service status (`hmsl api-status`)

For platform-wide topics (auth/scope recovery, instance URLs, headless setup), see `/references/gitguardian-platform.md` at the repo root.

## Quick Start (if ggshield is already installed and authorized)

```bash
ggshield hmsl quota                                      # check remaining credits for today
ggshield hmsl check secrets.txt --json                   # one-shot check, hashes locally, sends prefixes
```

If `ggshield --version` fails, jump to **Onboarding (first use)** below.

## Onboarding (first use)

### Prerequisites

- A **GitGuardian account** — Free tier is enough. HMSL is available to all plans (Free included); the difference between tiers is the daily quota.
- **`ggshield` 1.49.0 or later** — for full feature support.

### Setup

`check-hmsl` reuses the same `ggshield` install and `auth login` flow as `scan-secrets`. If `ggshield --version` fails or `ggshield hmsl api-status` errors, follow the full **Onboarding (first use)** section in the `scan-secrets` skill — detect the user's package manager, install `ggshield`, run `ggshield auth login`. Return here once `ggshield hmsl api-status` reports `Status: healthy`.

HMSL works in two auth modes:

- **Unauthenticated** — no `ggshield auth login` needed. Lower default daily quota. Useful for quick one-off checks on a fresh machine.
- **Authenticated** — after `ggshield auth login`. Per-plan/per-account quota (10,000+ credits/day on paid plans). Recommended for bulk inventories.

Confirm auth state with `ggshield hmsl api-status` — `Authenticated: true` means the call will use the user's account quota.

## Commands

### One-shot check

```bash
# Check a file of secrets (one per line)
ggshield hmsl check secrets.txt --json

# Check environment-variable-formatted input
ggshield hmsl check -t env .env --json

# Check from stdin
cat secrets.txt | ggshield hmsl check - --json

# Naming strategy: how matched secrets are labelled in the output
ggshield hmsl check secrets.txt --json -n key        # use VAR_NAME from .env (default)
ggshield hmsl check secrets.txt --json -n censored   # show first+last chars only
ggshield hmsl check secrets.txt --json -n none       # no hint, fully anonymous
# DO NOT use -n cleartext in agent contexts — it would echo the secret value
```

### Multi-stage privacy-preserving check

Use when the user is uncomfortable with even hash prefixes leaving their machine in one step, or wants to review what's being sent before sending. Three commands, two intermediate files:

```bash
# Stage 1: compute hashes locally — produces payload.txt + mapping.txt
ggshield hmsl fingerprint secrets.txt

# Stage 2: send hash prefixes to HMSL — produces encrypted_matches.txt
ggshield hmsl query payload.txt > encrypted_matches.txt

# Stage 3: decrypt locally using the mapping — final human-readable output
ggshield hmsl decrypt encrypted_matches.txt --mapping mapping.txt --json
```

This flow gives the user a chance to inspect `payload.txt` (just hash prefixes, no plaintext) before stage 2.

### Audit a secret manager

```bash
# Check every secret in a HashiCorp Vault namespace against HMSL
ggshield hmsl check-secret-manager hashicorp-vault \
  --vault-url https://vault.example.com \
  --vault-namespace ops \
  --vault-mount secret \
  --json
```

`ggshield hmsl check-secret-manager hashicorp-vault --help` for the full flag list (auth methods, path filters, etc.). Other secret managers may follow — `check-secret-manager --help` lists what's currently wired up.

### Operational commands

```bash
ggshield hmsl quota         # remaining credits today
ggshield hmsl api-status    # confirm HMSL is reachable + whether the CLI is authenticated
```

Key flags (applicable to `check` and `fingerprint`):

| Flag | Effect |
|---|---|
| `--json` | Structured output — always pass in agent contexts |
| `-t file\|env` | Input format. `file` = one secret per line (default). `env` = `KEY=VALUE` lines |
| `-n key\|censored\|none\|cleartext` | Hint format for matched secrets in the output. **Never use `cleartext` in agent contexts.** Default `key` is safe |
| `-f, --full-hashes` | Send full hashes instead of prefixes (partner mode, lower credit cost per query, requires partner agreement) |
| `-p, --prefix <name>` | (`fingerprint` only) Prefix for generated `<prefix>-payload.txt` / `<prefix>-mapping.txt` files |
| `-m, --mapping <file>` | (`decrypt` only) Path to the mapping file from `fingerprint` |

Exit codes: `0` = no matches found, `1` = at least one secret matched (leaked publicly), non-zero = error (auth, quota, HMSL unreachable).

## Best Practices

- **Never read secrets from the conversation.** The user puts them in a file; the agent reads the path. If the user pastes a secret inline, redirect to file-based input.
- **Default to `--naming-strategy key`** (the safe default) for `.env` inputs, `censored` for opaque token lists. Reserve `none` for the most sensitive audits where even hints feel risky.
- **Show the quota before bulk runs.** A 5,000-secret vault audit will dent the daily quota — `ggshield hmsl quota` first, then proceed.
- **For a small handful of secrets, use `check`. For sensitive bulk audits, use the `fingerprint` / `query` / `decrypt` split.** The split lets the user inspect what's being sent and decouples the local hashing step from the network call.
- **Treat a match as confirmation, not coincidence.** HMSL's database is harvested from public sources — a match means GitGuardian saw your exact secret in a public artifact. Walk the user through rotation (`scan-secrets/references/remediation.md`) for every match.
- **HMSL is read-only.** A check does not "report" or "remove" the secret from anywhere — it only tells the user it's already public. Removal requires takedown action on the underlying source (e.g., a public GitHub repo).

## Troubleshooting

**`ggshield: command not found`** — see the `scan-secrets` skill's Onboarding section.

**`401 Unauthorized` on `hmsl` commands** — the cached HMSL token is stale. Delete it and re-authenticate:

```bash
rm ~/.cache/ggshield/hmsl_token   # path on macOS/Linux
ggshield auth login                # if `Authenticated: false` in api-status
ggshield hmsl api-status           # confirm
```

**`429 Too Many Requests` / "quota exceeded"** — daily quota is gone. Run `ggshield hmsl quota` to see the reset time (UTC midnight by default). Either wait for the reset or switch to an authenticated account with a higher quota.

**HMSL `api-status` shows `Authenticated: false`** — the CLI is hitting HMSL anonymously. Run `ggshield auth login` to get the authenticated quota. Anonymous mode works but caps out quickly.

**`No matches found` on a secret you know was leaked** — HMSL covers public sources GitGuardian has indexed (public GitHub, gists, Docker Hub, npm, PyPI). If the leak was in a *private* repo, a paste site we don't index, or a non-public artifact, HMSL won't see it. For the user's private GitGuardian workspace incidents, see the GitGuardian dashboard or the `incidents` tools on the Developer MCP server, not HMSL.

**Output contains a literal credential value** — you ran with `-n cleartext`. Re-run without it (default is `-n key`, which is safe). For sensitive audits, use `-n censored` or `-n none`.

**Multi-stage decrypt fails with `mapping mismatch`** — the `mapping.txt` was regenerated between `fingerprint` and `decrypt` (a second `fingerprint` overwrote it). Re-run from `fingerprint` to keep the payload and mapping aligned.
