---
name: check-hmsl
description: Check whether a *known* credential has been seen leaking publicly via GitGuardian's HasMySecretLeaked (HMSL) — a privacy-preserving hash-lookup service for public GitHub leaks. Use when the user inherits credentials, suspects a specific token leaked, wants to vet a HashiCorp Vault inventory, or asks "has this secret leaked / is this compromised / check against HMSL". Distinct from `scan-secrets` — that finds *unknown* secrets in code; this checks *known* secrets against the HMSL corpus.
allowed-tools: Bash(ggshield:*), Bash(ls:*), Bash(wc:*)
---

# ggshield — Check HasMySecretLeaked (HMSL)

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
7. Print results using the agent-chosen `--naming-strategy` (default `key`, never `cleartext` in agent contexts).

**The wire protocol is safe.** The threat model for this skill is different: an LLM agent has tools that can read files. If the agent reads the credential file at any point — to "check what's in it", to "verify the format", to "count lines" by accident — the plaintext enters the agent's tool output, which is part of the LLM context. At that point HMSL's local-hashing protocol is irrelevant; the secret has already been exposed to whatever downstream systems the agent's context flows through (transcripts, server logs, training pipelines if applicable, future-turn re-use).

The single job of this skill is to **prepare or invoke `ggshield hmsl` against a file path without ever reading the file**, depending on the selected execution mode.

## Two execution modes — choose deliberately

Pick before doing anything. Mode A is the only mode that gives a categorical guarantee. Mode B is convenience with defense in depth.

### Mode A — User-Executed (recommended for any sensitive audit)

- The agent prepares the exact command.
- **The user runs it in their own terminal.**
- The user pastes back the JSON output. For maximum privacy, use `-n none`; `key` and `censored` are usability tradeoffs because they reveal variable names or partial secret hints.
- The agent never has filesystem access to the credential file.

This is the only mode that's structurally safe. Default to it for inherited credential dumps, ex-employee handoffs, secret-manager inventories, and anything where a leak of the plaintext would itself be a security incident.

### Mode B — Agent-Executed (convenience, with hardening)

- The agent runs `ggshield hmsl check <path>` directly.
- Plaintext stays on the machine *unless the agent mistakenly reads the file*. The rules below close that path, but they are prompt-level rules — they can be violated.
- **Required before using Mode B:** install the GitGuardian agent hook for your editor (`ggshield install -t claude-code -m global`, or `-t cursor` / `-t copilot`). The hook scans tool inputs and outputs at the harness level and blocks anything containing a detected secret before it reaches the model context. This is the realistic defense against the file-read foot-gun.
- Tool allowlists such as `allowed-tools` are agent-specific defense in depth. They are not portable security boundaries across every agent that may consume this skill.
- Use only for casual checks where the credential is not catastrophic if exposed.

If in doubt, use Mode A.

## The single rule that matters (both modes)

**Never call any file-read tool against the credential file.** Not `Read`, not `Grep`, not `cat`, `head`, `tail`, `sed`, `awk`, `less`, `more`, `file`, `xxd`, or any LSP-backed tool. The file is passed to `ggshield` as a **path argument**. `ggshield` opens, hashes, and queries — the agent must not.

If you need to confirm the file exists or has the expected shape, use only:

- `ls -l <path>` — shows size and mode, never contents
- `wc -l <path>` — shows line count, never contents

If the user asks "show me what's in the file before we check it" — refuse and explain why. The contents are exactly what we're trying to keep out of the LLM context.

### Why the prose rules aren't enough on their own

Prose rules can be rationalized away by the model under pressure ("the user really wants me to check the format first…"). That is why Mode A exists, and that is why Mode B requires the hook. Don't rely on the rules alone for high-stakes inputs.

## Other rules that close known leakage paths

- **Never paste a raw secret into the conversation.** If the user offers one inline ("check `ghp_abc123…`"), refuse and redirect: *"Put it in a file and give me the path — that way the value never enters the transcript."*
- **Never pipe the credential through anything that surfaces it.** No `cat secrets.txt | ggshield ...`, no `echo $TOKEN | ...`. `ggshield` supports stdin, but agent workflows must use file-path invocation. If the user wants stdin, hand them the command for their own shell (Mode A).
- **`--naming-strategy cleartext` is forbidden in agent contexts.** It echoes each matched secret's plaintext into `ggshield`'s stdout, which becomes tool output, which becomes LLM context. Use the default `-n key`, or `-n censored`, or `-n none`.
- **Always pass `--json`** in agent contexts.
- **Do not use `--full-hashes`.** Full-hash mode sends full SHA-256 hashes rather than prefixes; it exists for partner/trust arrangements and changes the privacy posture. Use prefix mode (default) unless the user explicitly confirms they are in partner mode.
- **Do not use `--insecure`, `--allow-self-signed`, `--debug`, `--verbose`, or `--log-file` by default.** TLS verification and quiet structured output are the safe defaults for secret-handling workflows.
- **Surface quota before bulk runs.** HMSL has a daily credit quota — `ggshield hmsl quota` first, then proceed. Prefix mode costs more quota than full-hash mode.
- **`ggshield hmsl` is the only sanctioned path.** If `ggshield --version` or `ggshield hmsl api-status` fails, run **Onboarding (first use)** below — **do not improvise an alternate check** (manual grep of leak databases, hand-rolled hashes, sending the secret to a different service).

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

### Install the agent hook (required for Mode B)

The hook scans every tool input and output in the agent session for detected secrets and blocks before they reach the model context. It is the realistic harness-level defense against the file-read foot-gun. Install it once, globally:

```bash
ggshield install -t claude-code -m global     # Claude Code
ggshield install -t cursor -m global          # Cursor
ggshield install -t copilot -m global         # Copilot
```

If the user declines to install the hook, default to Mode A for the rest of the session.

## Mode A — Commands to hand to the user

The agent does not run these. The agent prints the command, the user runs it, the user pastes back the output.

```bash
# One-shot check with maximum privacy: no secret hint in the output
ggshield hmsl check /path/to/secrets.txt --json -n none

# .env-formatted input with maximum privacy
ggshield hmsl check -t env /path/to/.env --json -n none

# Usability tradeoff: labels matches by variable name
# Only paste this output back if variable names are acceptable in the agent context.
ggshield hmsl check -t env /path/to/.env --json -n key

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

### Secret-manager inventory (user-run only)

Secret-manager inventories are high-risk by default. The agent must not run this command unless the user explicitly says this is a low-risk/test vault and opts into Mode B. Otherwise, hand the command to the user:

```bash
# Vault URL from VAULT_URL or --url; token from VAULT_TOKEN unless --use-cli-token
ggshield hmsl check-secret-manager hashicorp-vault \
  --url https://vault.example.com \
  --recursive \
  --json \
  secret/
```

`ggshield hmsl check-secret-manager --help` lists currently-supported managers. The HashiCorp Vault command supports KV v1/v2.

## Mode B — Commands the agent may run (hook required)

Only after confirming the agent hook is installed (`ggshield install -t <editor>`). Otherwise drop to Mode A.

### One-shot check

```bash
# Plain file, one secret per line
ggshield hmsl check /path/to/secrets.txt --json -n censored

# .env-formatted input — uses VAR_NAME as the hint
ggshield hmsl check -t env /path/to/.env --json -n key

# Maximum-paranoia hint mode: no hint at all
ggshield hmsl check /path/to/secrets.txt --json -n none

# FORBIDDEN — would echo plaintext into tool output:
# ggshield hmsl check secrets.txt --json -n cleartext
```

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

- **Default to Mode A** for any audit the user describes as sensitive, inherited, secret-manager-backed, or post-incident. Drop to Mode B only when the user explicitly opts in *and* the agent hook is installed.
- **Default to `-n none` for sensitive Mode A output.** Use `-n key` or `-n censored` only when the user accepts that variable names or partial hints may enter the agent context.
- **Show the quota before bulk runs.** Prefix mode currently consumes multiple credits per checked secret, so `ggshield hmsl quota` first.
- **For a small handful of secrets, use `check`. For sensitive bulk audits, use the `fingerprint` / `query` / `decrypt` split.** The split lets the user inspect what's being sent and decouples the local hashing step from the network call.
- **Treat a match as confirmation, not coincidence.** HMSL's corpus is built from indexed public sources — a match means GitGuardian saw your exact secret in a public artifact. Walk the user through rotation (`scan-secrets/references/remediation.md`) for every match.
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

**Output contains a literal credential value** — you ran with `-n cleartext`. Re-run without it (default is `-n key`, which is safe). For sensitive audits, use `-n censored` or `-n none`.

**Multi-stage decrypt fails with `mapping mismatch`** — the mapping file was regenerated between `fingerprint` and `decrypt`. Re-run from `fingerprint` in a fresh private temp directory to keep the payload and mapping aligned.

**The agent hook blocked a `ggshield` invocation** — the hook detected a secret in a tool input/output and refused to forward it. This is working as intended; investigate what was being passed before retrying. Do not disable the hook to "get the check through".
