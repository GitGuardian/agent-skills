---
name: check-hmsl
description: Check whether a known credential has already leaked publicly via GitGuardian's HasMySecretLeaked (HMSL) hash-lookup service. Use when the user inherits credentials, suspects a specific token leaked, wants to vet a HashiCorp Vault inventory, or asks "has this secret leaked", "is this compromised", or "check against HMSL". Distinct from scan-secrets, which finds unknown secrets in code; this checks known secrets against the HMSL corpus. User-run only — this is a command-handoff skill, so the agent prepares the commands, the user runs them in their own terminal, and the agent only interprets the sanitized output the user pastes back.
metadata:
  command-handoff: "true"
  version: "0.5.0" # x-release-please-version
---

# ggshield — Check HasMySecretLeaked (HMSL)

> **STOP — read before proceeding.** This skill is user-run only. The agent must not invoke `ggshield hmsl check`, `fingerprint`, `query`, `decrypt`, or `check-secret-manager`. The agent must not call `Read`, `Grep`, `cat`, `head`, `tail`, `sed`, `awk`, or any other tool against credential files, `.env`-style files, vault dumps, or HMSL intermediate files (`*-payload.txt`, `*-mapping.txt`, `*.dump`). The single agent job is to prepare commands for the user to execute in their own terminal, then interpret sanitized output the user pastes back (`-n none --json` only). Continuing past this block constitutes acknowledgement of the user-run model. If you arrived here as a follow-up from `scan-secrets` (e.g., to resolve `validity: no_checker` findings), do not extend the agent-executable contract of that skill into this one — they have different execution models.

## Overview

HMSL ([hasmysecretleaked.com](https://www.hasmysecretleaked.com/)) is GitGuardian's public hash-lookup service for known secrets. You bring a credential, HMSL tells you whether it's been seen leaking in GitGuardian's currently indexed public GitHub sources (public repositories, commits, gists, and issues). The plaintext credential never leaves the machine — `ggshield` hashes it locally and, by default, submits hash prefixes only.

This is the inverse of `scan-secrets`. `scan-secrets` finds *unknown* secrets in files you control. `check-hmsl` checks *known* secrets you already have against the public-leak corpus: a `.env` you inherited from a former teammate, a token someone pasted into Slack, a credential dump from a possibly-compromised system, or the full inventory of a secret manager.

## The privacy property HMSL provides — and the agent-context risk

`ggshield hmsl check <file>` does this dance, entirely on the user's machine until the underlined step:

1. Read the file.
2. SHA-256 each secret.
3. Put a hash prefix for each secret into the payload.
4. <ins>Send the payload to HMSL.</ins> ← only this leaves the machine
5. HMSL returns all known leaked hashes that share each prefix.
6. Locally, compare the returned full hashes against the user's hashes. Matches = leaked secrets.
7. Print results using the selected `--naming-strategy` (`-n none` for anything pasted back to the agent; never `cleartext`).

**The wire protocol is safe.** The threat model for this skill is different: an LLM agent has tools that can read files. If the agent reads the credential file at any point — to "check what's in it", to "verify the format", to "count lines" by accident — the plaintext enters the agent's tool output, which is part of the LLM context. At that point HMSL's local-hashing protocol is irrelevant; the secret has already been exposed to whatever downstream systems the agent's context flows through (transcripts, server logs, training pipelines if applicable, future-turn re-use).

The single job of this skill is to **prepare commands for the user to run in their own terminal, then interpret sanitized output the user chooses to paste back**. The agent must never run HMSL commands on the user's behalf.

## Execution model — user-run only

This skill has one execution model:

- The agent prepares the exact command.
- **The user runs it in their own terminal.**
- The user pastes back either a human summary or JSON produced with `-n none`.
- The agent never has filesystem access to the credential file or HMSL intermediate files.
- The agent never runs `ggshield hmsl check`, `ggshield hmsl fingerprint`, `ggshield hmsl query`, `ggshield hmsl decrypt`, or `ggshield hmsl check-secret-manager`.

This is the only structurally safe model. Do not offer an agent-executed fallback, even if the user says the credential is low risk or the agent hook is installed.

## The single rule that matters

**Never call any tool against the credential file or HMSL intermediate files.** Not `Read`, not `Grep`, not `cat`, `head`, `tail`, `sed`, `awk`, `less`, `more`, `file`, `xxd`, `ls`, `wc`, `ggshield`, or any LSP-backed tool. The agent does not need to confirm the file exists, inspect the format, count lines, or verify outputs. The user runs commands locally and decides what output to share.

If the user asks "show me what's in the file before we check it" or "just run the check for me" — refuse and explain that the credential contents must stay outside the agent context.

### Why the prose rules aren't enough on their own

Prose rules can be rationalized away by the model under pressure ("the user really wants me to check the format first…"). That is why this skill has no agent-executed mode. Agent hooks and tool allowlists are useful defense in depth, but they do not make it acceptable for the agent to run HMSL against user secrets.

## Other rules that close known leakage paths

- **Never paste a raw secret into the conversation.** If the user offers one inline ("check `ghp_abc123…`"), refuse and redirect: *"Put it in a file and give me the path — that way the value never enters the transcript."*
- **Never pipe the credential through anything that surfaces it.** No `cat secrets.txt | ggshield ...`, no `echo $TOKEN | ...`. `ggshield` supports stdin, but recommended user-run commands use file-path invocation.
- **`--naming-strategy cleartext` is forbidden.** It echoes each matched secret's plaintext into stdout. Use `-n none` for anything pasted back to the agent.
- **Use `-n none` for anything pasted back to the agent.** Do not paste `key`, `censored`, or `cleartext` output into the conversation.
- **Always pass `--json`** for output the user intends to paste back.
- **Do not use `--full-hashes`.** Full-hash mode sends full SHA-256 hashes rather than prefixes; it exists for partner/trust arrangements and changes the privacy posture. Use prefix mode (default) unless the user explicitly confirms they are in partner mode.
- **Do not use `--insecure`, `--allow-self-signed`, `--debug`, `--verbose`, or `--log-file` by default.** TLS verification and quiet structured output are the safe defaults for secret-handling workflows.
- **Surface quota before bulk runs.** HMSL has a daily credit quota — `ggshield hmsl quota` first, then proceed. Prefix mode costs more quota than full-hash mode.
- **`ggshield hmsl` is the only sanctioned path.** If `ggshield --version` or `ggshield hmsl api-status` fails for the user, guide them through **Onboarding (first use)** below — **do not improvise an alternate check** (manual grep of leak databases, hand-rolled hashes, sending the secret to a different service).

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

For shared `ggshield` install, authentication, headless setup, CI tokens, and hook-install commands, see [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md).
For platform-wide topics (auth/scope recovery, instance URLs, headless setup), see [references/gitguardian-platform.md](references/gitguardian-platform.md).

## When Not to Use

Do not use this skill when:

- The task is to find *unknown* secrets in code, files, or git history — use `scan-secrets` instead. This skill checks *known* credentials you already hold.
- You are tempted to run `ggshield hmsl` yourself or to read the credential file with `Read`, `cat`, `Grep`, or similar. HMSL operations are user-run only by design — running them agent-side pulls the plaintext into the agent context. Hand the command to the user.

## Onboarding (first use)

### Prerequisites

- A **GitGuardian account** is optional for quick checks. HMSL can run anonymously with lower quota; authenticated users get a higher workspace quota.
- **`ggshield` 1.49.0 or later** — for full feature support.

### Setup

`check-hmsl` reuses the same `ggshield` install and `auth login` flow as `scan-secrets`. If the user is not sure `ggshield` is installed or HMSL is reachable, give them these commands to run in their own terminal:

```bash
ggshield --version
ggshield hmsl api-status
```

If `ggshield --version` fails, point them to [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md). If `ggshield hmsl api-status` reports an auth issue, ask the user to run `ggshield auth login` locally.

HMSL works in two auth modes:

- **Unauthenticated** — no `ggshield auth login` needed. Lower default daily quota. Useful for quick one-off checks on a fresh machine.
- **Authenticated** — after `ggshield auth login`. Higher workspace quota than anonymous mode. Recommended for bulk inventories.

The user can confirm auth state with `ggshield hmsl api-status` — `Authenticated: true` means the call will use the user's account quota.

### Install the agent hook (defense in depth)

The hook scans tool inputs and outputs in agent sessions for detected secrets and blocks before they reach the model context. It is useful defense in depth for general agent work, but it does **not** make agent-executed HMSL acceptable. The user can install it once, globally:

```bash
ggshield install -t claude-code -m global     # Claude Code
ggshield install -t cursor -m global          # Cursor
ggshield install -t copilot -m global         # Copilot
```

Whether or not the hook is installed, this skill remains user-run only.

## Commands to hand to the user

The agent does not run these. The agent prints the command, the user runs it, the user pastes back the output.

```bash
# One-shot check with maximum privacy: no secret hint in the output
ggshield hmsl check /path/to/secrets.txt --json -n none

# .env-formatted input with maximum privacy
ggshield hmsl check -t env /path/to/.env --json -n none

# Quota and status
ggshield hmsl quota
ggshield hmsl api-status
```

For sensitive bulk audits, give the user the multi-stage flow so they can inspect the payload before stage 2 sends it:

```bash
# In their own shell, in a private temp directory outside any repo
HMSL_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ggshield-hmsl.XXXXXX")"
chmod 700 "$HMSL_WORKDIR"

ggshield hmsl fingerprint /absolute/path/to/secrets.txt -p "$HMSL_WORKDIR/audit" -n none
# Optional: the user can inspect "$HMSL_WORKDIR/audit-payload.txt" here.
# Do NOT inspect "$HMSL_WORKDIR/audit-mapping.txt" — keep local mapping files out of the agent context.

ggshield hmsl query "$HMSL_WORKDIR/audit-payload.txt" > "$HMSL_WORKDIR/results.dump"

ggshield hmsl decrypt "$HMSL_WORKDIR/results.dump" --mapping "$HMSL_WORKDIR/audit-mapping.txt" --json

rm -rf "$HMSL_WORKDIR"
```

The user pastes back only the final `decrypt --json` output (or just the human summary). Stage outputs stay on their machine.

### Secret-manager inventory

Secret-manager inventories are high-risk by default. The agent must not run this command. Hand it to the user:

```bash
# Vault URL from VAULT_URL or --url; token from VAULT_TOKEN unless --use-cli-token
ggshield hmsl check-secret-manager hashicorp-vault \
  --url https://vault.example.com \
  --recursive \
  --json \
  secret/
```

`ggshield hmsl check-secret-manager --help` lists currently-supported managers. The HashiCorp Vault command supports KV v1/v2.

### Operational commands

```bash
ggshield hmsl quota         # remaining credits today
ggshield hmsl api-status    # confirm HMSL is reachable + whether the CLI is authenticated
```

Key flags (applicable to `check` and `fingerprint`):

| Flag | Effect |
|---|---|
| `--json` | Structured output — use for anything the user intends to paste back |
| `-t file\|env` | Input format. `file` = one secret per line (default). `env` = `KEY=VALUE` lines |
| `-n key\|censored\|none\|cleartext` | Hint format for matched secrets in the output. Use `none` for anything pasted back to the agent. Do not paste `key`, `censored`, or `cleartext` output into the conversation |
| `-f, --full-hashes` | Send full hashes instead of prefixes. Do not use in normal agent contexts; partner/trust mode only |
| `-p, --prefix <name>` | (`fingerprint` only) Prefix for generated `<prefix>-payload.txt` / `<prefix>-mapping.txt` files |
| `-m, --mapping <file>` | (`decrypt` only) Path to the mapping file from `fingerprint` |

Exit codes: `0` = no matches found, `1` = at least one secret matched (leaked publicly), non-zero = error (auth, quota, HMSL unreachable).

## Best Practices

- **Never run HMSL commands on behalf of the user.** The agent prepares commands only.
- **Default to `-n none` for output pasted back to the agent.** Do not ask the user to paste output generated with `-n key`, `-n censored`, or `-n cleartext`.
- **Ask the user to check quota before bulk runs.** Prefix mode currently consumes multiple credits per checked secret, so `ggshield hmsl quota` first.
- **For a small handful of secrets, use `check`. For sensitive bulk audits, use the `fingerprint` / `query` / `decrypt` split.** The split lets the user inspect what's being sent and decouples the local hashing step from the network call.
- **Treat a match as confirmation, not coincidence.** HMSL's corpus is built from indexed public sources — a match means GitGuardian saw your exact secret in a public artifact. The credential is public and must be considered burned: rotate it at the issuing service and update every system that consumes it. Takedown of the public source does not substitute for rotation.
- **HMSL is read-only.** A check does not "report" or "remove" the secret from anywhere — it only tells the user it's already public. Removal requires takedown action on the underlying source (e.g., a public GitHub repo).
- **The `hash` field in HMSL output is a one-way SHA-256** — safe to report back to the user, but don't publish it in issues, PR comments, or logs unless the user asks. The `url` field points to a public source (e.g., a leaked GitHub commit) — safe and useful; this is the actionable information.

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

**Output contains a literal credential value** — the command used `-n cleartext`. Do not paste that output into the conversation. Re-run with `-n none` before sharing output with the agent.

**Multi-stage decrypt fails with `mapping mismatch`** — the mapping file was regenerated between `fingerprint` and `decrypt`. Re-run from `fingerprint` in a fresh private temp directory to keep the payload and mapping aligned.

**The agent hook blocked a `ggshield` invocation** — the hook detected a secret in a tool input/output and refused to forward it. This is working as intended. Do not disable the hook to "get the check through"; keep HMSL checks user-run only.

**Any other or unlisted error** — before improvising a fix, consult GitGuardian's AI-agent docs index at https://docs.gitguardian.com/llms.txt to locate the relevant page, then append `.md` to that page's URL to read it as Markdown. Search there first rather than guessing. (Reading docs is fine; the user-run-only rule above still forbids the agent from running HMSL commands or touching credential files.)
