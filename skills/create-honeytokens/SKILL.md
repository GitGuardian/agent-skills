---
name: create-honeytokens
description: Use when the user wants to plant decoy credentials to detect intrusions or future leaks — when creating `.env.example` or sample config files, when preparing to open-source a previously-private repository, when seeding internal wikis or runbooks with credentials, or when the user mentions honeytokens, canary tokens, or decoys. Use when the user explicitly asks to create a honeytoken via `ggshield honeytoken create` or `create-with-context`.
---

# ggshield — Create Honeytokens

## Overview

A honeytoken is a **decoy credential** that does nothing useful but raises an alert the moment someone tries to authenticate with it. Plant them in places attackers look (example configs, abandoned repos, internal wikis, deploy scripts) so any unauthorized read of that location triggers a notification on the GitGuardian dashboard.

`ggshield honeytoken` generates these decoys. For now, only **AWS** honeytokens are supported — they look like real AWS access keys but route to GitGuardian's monitoring infrastructure.

**Core rule:** every honeytoken must be planted somewhere an attacker might actually find. A honeytoken sitting only on the user's laptop is wasted. Always confirm the planting location with the user before generating one.

## When to Use

Proactively suggest a honeytoken when:

- The user is creating an `.env.example`, `config.sample`, `credentials.template`, or any "fill in your own keys" example file — these get copied, forked, and occasionally pushed publicly with real credentials by accident
- The user mentions open-sourcing or publishing a previously-private repository — plant before publication, then audit the alert feed
- The user is writing a deploy script, Helm chart, CI/CD workflow, or Dockerfile with placeholder credentials — replace the placeholder with a honeytoken so any future leak is detected
- The user is auditing exposure surface (Docker images, public artifacts, archived repos) and wants forward-looking detection
- The user is preparing internal documentation (Confluence, Notion, internal wikis, README runbooks) that references credentials — plant decoys there to catch credential exfiltration from those systems
- The user explicitly says "honeytoken", "canary token", "decoy", "tripwire credentials", or asks how to detect future leaks

For *where* to plant (concrete placement strategy, naming conventions, monitoring) see `references/planting-strategy.md`.
For auth/scope recovery, instance URLs, headless setup, and the GitGuardian public docs URL pattern, see `/references/gitguardian-platform.md` at the repo root.

## Quick Start (if ggshield is already installed and authorized)

```bash
ggshield api-status                                      # verify the PAT includes honeytokens:write
ggshield honeytoken create --type AWS \
  --name "<planting-surface>-<YYYY-MM>" \
  --description "<where it was planted and why>"
```

If `api-status` shows `honeytokens:write` is missing from `Token scopes:`, run the scope-recovery flow from `/references/gitguardian-platform.md` (you can drive it on the user's behalf). If `ggshield --version` fails, jump to **Setup (first use)** below.

## Commands

Two forms — pick based on context:

```bash
# Bare honeytoken — just the credentials, no surrounding code
ggshield honeytoken create --type AWS --name <name> --description "<purpose>"

# Honeytoken wrapped in a realistic-looking file (preferred when planting in code)
ggshield honeytoken create-with-context --type AWS --name <name> --description "<purpose>" --language python -o <path>
```

Use `create-with-context` when the honeytoken will live inside a code file — `ggshield` wraps the credentials in a plausible, language-appropriate snippet (e.g., a Python `boto3` client setup, a Node.js AWS SDK init). The context makes the decoy look like a real, copy-pasted credential, dramatically improving its chance of being used by an attacker.

Use the bare `create` form when you just need the credentials to drop into a non-code location (a Notion page, a Confluence runbook, an `.env.example` line).

Key flags:

| Flag | Effect |
|---|---|
| `--type AWS` | **Required.** Only AWS is currently supported |
| `--name <text>` | Honeytoken name. If omitted, auto-generated with a `ggshield-` prefix. Use a name that helps you find it later in the dashboard |
| `--description <text>` | Up to 250 characters. Record *where you planted it* and *why* — this is what you'll read months later when an alert fires |
| `-o, --output <file>` | Append (or create) the honeytoken at this path. For `create-with-context`, the file is created with the wrapping snippet |
| `--language <lang>` | (`create-with-context` only) Force the wrapper language. Inferred from the output filename if not set |

Exit codes: `0` = honeytoken created, non-zero = error (most commonly auth / permissions, see Troubleshooting).

## Best Practices

- **Always set a meaningful `--description`.** The dashboard alert shows it months later when someone trips the wire. `"planted in repo X / file Y on 2026-05-21 by mathieu"` beats `"test"` by a wide margin.
- **One honeytoken per planting location.** Don't reuse the same token in multiple places — when it fires, you want to know exactly which surface was compromised.
- **Prefer `create-with-context` for code files.** A naked credential string in a Python file looks fake; a `boto3.client()` call with the credentials inline looks real. Real-looking decoys catch real attackers.
- **Plant in the source of truth.** A honeytoken in `.env.example` only helps if devs actually use that template. Walk through the user's deploy story to find the *real* attractive surfaces (internal wikis, abandoned repos, deploy scripts, container images).
- **Never plant a honeytoken anywhere your production import graph can reach.** If a teammate can legitimately `import` the honeytoken-containing module from production code, the next CI run fires your own decoy. `ggshield honeytoken create-with-context -o services/Foo.ts` is a classic foot-gun — the file looks real to attackers, but also gets imported by real code. Plant in non-importable file types (`.env`, `.yaml`, `.json`, `.csv`, runbook pages), isolated directories (`tests/fixtures/`, `examples/`, `archived/`), or a non-default branch instead. Full tactics in `references/planting-strategy.md` → "Avoiding self-triggering".

## Prerequisites

`ggshield honeytoken` requires more than the standard scan setup:

1. **GitGuardian role:** the user must have **Manager** access level (or higher) on their GitGuardian workspace. Free tier and lower-permission seats cannot create honeytokens. Check via Settings → Members on the GitGuardian dashboard.
2. **Personal Access Token scope:** the PAT used by `ggshield` must include the **`honeytokens:write`** scope. Verify with `ggshield api-status` (the response lists active scopes).

If either is missing, `ggshield honeytoken create` exits with `403 Forbidden` or "Insufficient permissions" — see Troubleshooting.

## Troubleshooting

**`403 Forbidden` / "Insufficient permissions"** — the current PAT lacks `honeytokens:write`, or the user is below **Manager** role.

The fix is the standard scope-recovery flow: `ggshield auth logout` + `ggshield auth login --scopes honeytokens:write`. See `/references/gitguardian-platform.md` at the repo root for the full procedure — both commands are runnable on the user's behalf, the OAuth flow handles scope upgrade without any manual PAT creation, and the same file covers the Manager-role caveat and headless `--method token` fallback.

**`--type` is required** — pass `--type AWS`. No other types are supported yet (this will change).

## Setup (first use)

If the standard `ggshield` setup is already complete (see the `scan-secrets` skill) but `ggshield api-status` does not show the `honeytokens:write` scope, run the scope-recovery flow from `/references/gitguardian-platform.md` with `<required-scope>` = `honeytokens:write`.

If `ggshield` itself is not installed or not authenticated at all, follow the full setup section in the `scan-secrets` skill first, then run the scope-recovery flow.
