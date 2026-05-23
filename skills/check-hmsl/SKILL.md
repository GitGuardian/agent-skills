---
name: check-hmsl
description: Check whether a *known* credential has been seen leaking publicly via GitGuardian's HasMySecretLeaked (HMSL) — a privacy-preserving hash-lookup service for public GitHub leaks. Use when the user inherits credentials, suspects a specific token leaked, wants to vet a HashiCorp Vault inventory, or asks "has this secret leaked / is this compromised / check against HMSL". Distinct from `scan-secrets` — that finds *unknown* secrets in code; this checks *known* secrets against the HMSL corpus.
---

# ggshield — Check HasMySecretLeaked (HMSL)

## Overview

HMSL ([hasmysecretleaked.com](https://www.hasmysecretleaked.com/)) is GitGuardian's public hash-lookup service for known secrets. You bring a credential, HMSL tells you whether it's been seen leaking in GitGuardian's currently indexed public GitHub sources (public repositories, commits, gists, and issues). The plaintext credential never leaves the machine — `ggshield` hashes it locally and, by default, submits hash prefixes only.

This is the inverse of `scan-secrets`. `scan-secrets` finds *unknown* secrets in files you control. `check-hmsl` checks *known* secrets you already have against the public-leak corpus: a `.env` you inherited from a former teammate, a token someone pasted into Slack, a credential dump from a possibly-compromised system, or the full inventory of a secret manager.

**Core rule:** raw credential values must never enter the LLM context — not via the conversation, not via tool output, not via file reads, not via shell output. In the default protocol, the only secret-derived value sent to HMSL is a hash prefix produced locally by `ggshield`. The agent's job is to invoke `ggshield hmsl` against a file path; `ggshield` opens, hashes, queries — the agent never sees plaintext.

### How `ggshield hmsl` keeps plaintext local (the model behind the rules)

`ggshield hmsl check <file>` performs roughly this dance, entirely on the user's machine until the underlined step:

1. Read the file.
2. SHA-256 each secret.
3. Put a hash prefix for each secret into the payload.
4. <ins>Send the payload to HMSL.</ins> ← only this leaves the machine
5. HMSL returns all known leaked hashes that share each prefix.
6. Locally, compare the returned full hashes against the user's hashes. Matches = leaked secrets.
7. Print results using the agent-chosen `--naming-strategy`:
   - `-n key` (default; env keys when available, otherwise censored) or `-n censored` → safe hint, e.g. `AKIA************MPLE`
   - `-n none` → uses the SHA-256 as the label (also safe, one-way)
   - `-n cleartext` → **echoes the secret verbatim**. Forbidden in agent contexts.

The `hash` field in HMSL output is a one-way SHA-256 of the user's secret — safe to report back to the user, but don't publish it in issues, PR comments, or logs unless the user asks. The `url` field points to a public source (e.g., a leaked GitHub commit) — also safe; this is precisely the information the user wants.

The multi-stage `fingerprint` / `query` / `decrypt` flow uses the *same* default wire protocol (prefixes, unless `--full-hashes` is explicitly used); its added value is that it persists a payload file and mapping file so the user can inspect the payload before stage 2. The mapping file is local — but with `-n cleartext` it would contain plaintext, so the cleartext ban applies to the multi-stage flow too.

## Start Here — Read This Before Doing Anything

**Do not skip this section.** Each of these rules closes a known leakage path. Violating any one of them defeats the privacy property HMSL exists to provide.

- **Never paste a raw secret into the conversation.** If the user offers a secret inline ("check `ghp_abc123…`"), refuse and redirect: *"Put it in a file and give me the path — that way the value never enters the transcript."* The conversation is part of the LLM context; anything pasted into it has already leaked.
- **Never `Read`, `cat`, `head`, `tail`, `grep`, or otherwise display the credential file's contents.** The file is passed to `ggshield hmsl check <path>` as a **path**, not as content. `ggshield` reads and hashes locally — the agent must not. If you need to confirm the file exists or check its shape, use `ls -l <path>` (size + mode, never contents) or `wc -l <path>` (line count). Opening the file with any tool that produces text output puts plaintext into the agent's tool output, which is part of the LLM context. **This is the most common foot-gun.**
- **Never pipe the credential file through anything that surfaces it.** No `cat secrets.txt | …`, no `echo $TOKEN | …`. The official command supports stdin, but agent workflows should prefer file-path invocation. If the user insists on stdin-style invocation, hand them the command to run in their own shell and ask for the resulting `ggshield` output only.
- **`--naming-strategy cleartext` is forbidden in agent contexts.** It would echo each matched secret's plaintext into `ggshield`'s stdout, which becomes tool output, which becomes LLM context. The default `-n key` (variable name only) or `-n censored` (first + last few chars) is mandatory. `-n none` is also safe when even hints feel risky.
- **Always pass `--json`** in agent contexts for parseable output.
- **For sensitive bulk audits, prefer the multi-stage `fingerprint` / `query` / `decrypt` flow** to one-shot `check`. Both use the same default protocol (hash prefixes); multi-stage lets the user inspect the payload before stage 2. Use a private temp directory, keep the mapping file out of the repo, and clean up all intermediate files after reporting.
- **Run Onboarding first if the CLI isn't set up.** If `ggshield --version` fails or `ggshield hmsl api-status` errors, walk through **Onboarding (first use)** below before attempting any HMSL command. **Do not improvise an alternate check** (e.g., grepping a public-leak database manually, computing your own hashes, sending the secret to a different service). `ggshield hmsl` is the only sanctioned path.
- **Do not use `--full-hashes` in normal agent contexts.** Full-hash mode sends full SHA-256 hashes rather than prefixes. It exists for partner/trust arrangements and changes the privacy posture. Use prefix mode unless the user explicitly confirms they are in partner mode and accepts the tradeoff.
- **Do not use `--insecure`, `--allow-self-signed`, `--debug`, `--verbose`, or `--log-file` by default.** TLS verification and quiet structured output are the safe defaults for secret-handling workflows. Only use these flags when troubleshooting requires them and the user accepts the risk.
- **Quota matters.** HMSL has a daily credit quota (`ggshield hmsl quota` shows current). Prefix mode costs more quota than full-hash mode; large inventories may consume significant credits. Surface the remaining quota before launching bulk checks.

### Foot-gun: file-read leakage

The most likely failure mode is the agent "helpfully" opening the credential file before invoking `ggshield`. Concrete bad path:

```
User: "Check secrets.txt against HMSL"
Agent: <Read secrets.txt>          ← plaintext now in tool output → LLM context
Agent: <Bash: ggshield hmsl check secrets.txt --json>
```

The first step is the leak. By the time `ggshield` runs, the secrets have already entered the LLM's view, which is exactly what HMSL's local-hashing protocol exists to prevent. The correct path is:

```
User: "Check secrets.txt against HMSL"
Agent: <Bash: ls -l secrets.txt>   ← optional: confirm file exists (no contents)
Agent: <Bash: ggshield hmsl check secrets.txt --json -n censored>
Agent: <parses JSON, reports matches by hint/line — never by value>
```

If the user asks you to "show me what's in the file" before checking — refuse and explain why. The file's contents are precisely what we're trying to keep out of the LLM context.

### Defense in depth

The skill rules above are the first line of defense. The second is `ggshield`'s Claude Code / Cursor / Copilot agent hooks (`ggshield install -t claude-code -m global`), which scan the agent's prompts, tool calls, and tool outputs for detected secrets and block before they reach the model. Strongly recommend installing the hook on any machine where this skill will be used — see the `scan-secrets` skill's hook-install instructions, or the README's *Install secret-scanning hooks* prompts.

## When to Use

Trigger an HMSL check when:

- The user inherits credentials from a former teammate, contractor, or compromised account and wants to know which are already public
- The user suspects a specific token, key, or password may have leaked — Slack pastes, accidental commits later force-pushed away, public CI logs, etc.
- The user wants to audit a HashiCorp Vault instance against the public-leak corpus (`check-secret-manager hashicorp-vault`)
- The user has a list of credentials in a file (CSV, env, plain text) and wants to bulk-check them
- The user explicitly mentions "HMSL", "HasMySecretLeaked", "has this secret leaked", "is this credential compromised", "check against the public leaks", "see if this token is out there"

What `ggshield hmsl` covers:

- One-shot check of secrets in a file (`hmsl check`)
- Multi-stage privacy-preserving check: `fingerprint` (compute hashes locally) → `query` (send hash prefixes to HMSL) → `decrypt` (resolve which input secrets matched)
- HashiCorp Vault audit (`check-secret-manager hashicorp-vault`)
- Quota check (`hmsl quota`)
- HMSL service status (`hmsl api-status`)

For platform-wide topics (auth/scope recovery, instance URLs, headless setup), see `/references/gitguardian-platform.md` at the repo root.

## Quick Start (if ggshield is already installed and authorized)

```bash
ggshield hmsl quota                                      # check remaining credits for today
ggshield hmsl check secrets.txt --json -n censored       # one-shot check, hashes locally, sends prefixes
```

If `ggshield --version` fails, jump to **Onboarding (first use)** below.

## Onboarding (first use)

### Prerequisites

- A **GitGuardian account** is optional for quick checks. HMSL can run anonymously with lower quota; authenticated users get a higher workspace quota.
- **`ggshield` 1.49.0 or later** — for full feature support.

### Setup

`check-hmsl` reuses the same `ggshield` install and `auth login` flow as `scan-secrets`. If `ggshield --version` fails or `ggshield hmsl api-status` errors, follow the full **Onboarding (first use)** section in the `scan-secrets` skill — detect the user's package manager, install `ggshield`, run `ggshield auth login`. Return here once `ggshield hmsl api-status` reports `Status: healthy`.

HMSL works in two auth modes:

- **Unauthenticated** — no `ggshield auth login` needed. Lower default daily quota. Useful for quick one-off checks on a fresh machine.
- **Authenticated** — after `ggshield auth login`. Higher workspace quota than anonymous mode. Recommended for bulk inventories.

Confirm auth state with `ggshield hmsl api-status` — `Authenticated: true` means the call will use the user's account quota.

## Commands

### One-shot check

```bash
# Check a file of secrets (one per line)
ggshield hmsl check secrets.txt --json -n censored

# Check environment-variable-formatted input
ggshield hmsl check -t env .env --json -n key

# Stdin is supported by ggshield, but do not use it through the agent.
# If the user needs stdin, give them this pattern to run themselves:
# ggshield hmsl check - --json

# Naming strategy: how matched secrets are labelled in the output
ggshield hmsl check -t env .env --json -n key        # use VAR_NAME from .env
ggshield hmsl check secrets.txt --json -n censored   # show first+last chars only
ggshield hmsl check secrets.txt --json -n none       # no hint, fully anonymous
# DO NOT use -n cleartext in agent contexts — it would echo the secret value
```

### Multi-stage privacy-preserving check

Same default protocol as `check` (hash prefixes), but split into three commands so the user can audit what's about to leave the machine. Run it from a private temp directory so `payload.txt`, `mapping.txt`, and query output never land in the user's repository:

```bash
# Create a private work directory outside the repo
HMSL_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ggshield-hmsl.XXXXXX")"
chmod 700 "$HMSL_WORKDIR"

# Stage 1: hash locally — produces audit-payload.txt + audit-mapping.txt
ggshield hmsl fingerprint /absolute/path/to/secrets.txt -p "$HMSL_WORKDIR/audit"

# Stage 2: send the payload — produces query output in the private work directory
ggshield hmsl query "$HMSL_WORKDIR/audit-payload.txt" > "$HMSL_WORKDIR/results.dump"

# Stage 3: decrypt locally using the mapping — final human-readable output
ggshield hmsl decrypt "$HMSL_WORKDIR/results.dump" --mapping "$HMSL_WORKDIR/audit-mapping.txt" --json

# After reporting, remove local HMSL artifacts
rm -rf "$HMSL_WORKDIR"
```

Between stage 1 and stage 2, the user (not the agent — see file-read rule) can inspect the `*-payload.txt` file to see exactly what's about to be sent. **Do not inspect the `*-mapping.txt` file** — it contains the `<hash>:<hint>` table, which is safe with the default `-n key`/`censored` strategy but would contain plaintext if `-n cleartext` was passed to `fingerprint`. The agent must not open the mapping file at all; let `decrypt` consume it.

### Audit a secret manager

```bash
# Check every secret in a HashiCorp Vault namespace against HMSL
# Vault URL comes from VAULT_URL or --url; token comes from VAULT_TOKEN
# unless --use-cli-token is set. VAULT_PATH is the mount/path to audit.
ggshield hmsl check-secret-manager hashicorp-vault \
  --url https://vault.example.com \
  --recursive \
  --json \
  secret/
```

`ggshield hmsl check-secret-manager hashicorp-vault --help` for the full flag list. The current command supports HashiCorp Vault KV v1/v2, reads the Vault URL from `VAULT_URL` unless `--url` is provided, and reads the token from `VAULT_TOKEN` unless `--use-cli-token` is set. Other secret managers may follow — `check-secret-manager --help` lists what's currently wired up.

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
| `-f, --full-hashes` | Send full hashes instead of prefixes. Do not use in normal agent contexts; partner/trust mode only |
| `-p, --prefix <name>` | (`fingerprint` only) Prefix for generated `<prefix>-payload.txt` / `<prefix>-mapping.txt` files |
| `-m, --mapping <file>` | (`decrypt` only) Path to the mapping file from `fingerprint` |

Exit codes: `0` = no matches found, `1` = at least one secret matched (leaked publicly), non-zero = error (auth, quota, HMSL unreachable).

## Best Practices

- **Never read secrets from the conversation.** The user puts them in a file; the agent reads the path. If the user pastes a secret inline, redirect to file-based input.
- **Default to `--naming-strategy key`** (the safe default) for `.env` inputs, `censored` for opaque token lists. Reserve `none` for the most sensitive audits where even hints feel risky.
- **Show the quota before bulk runs.** Prefix mode currently consumes multiple credits per checked secret, so `ggshield hmsl quota` first, then proceed.
- **For a small handful of secrets, use `check`. For sensitive bulk audits, use the `fingerprint` / `query` / `decrypt` split.** The split lets the user inspect what's being sent and decouples the local hashing step from the network call.
- **Treat a match as confirmation, not coincidence.** HMSL's corpus is built from indexed public sources — a match means GitGuardian saw your exact secret in a public artifact. Walk the user through rotation (`scan-secrets/references/remediation.md`) for every match.
- **HMSL is read-only.** A check does not "report" or "remove" the secret from anywhere — it only tells the user it's already public. Removal requires takedown action on the underlying source (e.g., a public GitHub repo).

## Troubleshooting

**`ggshield: command not found`** — see the `scan-secrets` skill's Onboarding section.

**`401 Unauthorized` on `hmsl` commands** — the cached HMSL token is stale. Delete it and re-authenticate:

```bash
rm ~/.cache/ggshield/hmsl_token   # path on macOS/Linux
ggshield auth login                # if `Authenticated: false` in api-status
ggshield hmsl api-status           # confirm
```

**`429 Too Many Requests` / "quota exceeded"** — daily quota is gone. Run `ggshield hmsl quota` to see the reset time. Either wait for the reset or switch to an authenticated account with a higher quota.

**HMSL `api-status` shows `Authenticated: false`** — the CLI is hitting HMSL anonymously. Run `ggshield auth login` to get the authenticated quota. Anonymous mode works but caps out quickly.

**`No matches found` on a secret you know was leaked** — HMSL covers the public sources GitGuardian has indexed for HMSL, currently public GitHub repositories, commits, gists, and issues. If the leak was in a private repo, an unindexed paste site, or a non-public artifact, HMSL won't see it. For the user's private GitGuardian workspace incidents, see the GitGuardian dashboard or the `incidents` tools on the Developer MCP server, not HMSL.

**Output contains a literal credential value** — you ran with `-n cleartext`. Re-run without it (default is `-n key`, which is safe). For sensitive audits, use `-n censored` or `-n none`.

**Multi-stage decrypt fails with `mapping mismatch`** — the mapping file was regenerated between `fingerprint` and `decrypt`. Re-run from `fingerprint` in a fresh private temp directory to keep the payload and mapping aligned.
