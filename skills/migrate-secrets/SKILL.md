---
name: migrate-secrets
description: Move plaintext secrets out of files and code into your existing secrets manager — HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, 1Password, or Infisical — then replace the hardcoded value with a reference. Use when centralizing secrets from a .env or config, or after a scan surfaces hardcoded credentials you want vaulted.
metadata:
  version: "0.1.7" # x-release-please-version
---

# Migrate Secrets to a Secrets Manager

## Overview

This skill moves plaintext secrets out of files and code into an **existing**, already-authenticated secrets manager, then replaces each hardcoded literal with a reference back to the vault. It is tool-agnostic: the same flow drives HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, 1Password, and Infisical through their CLIs (see **Backends**).

The skill is deliberately mechanical. It performs the move and warns loudly when a value looks already-leaked — but it does **not** rotate, and it does **not** provision a vault. Rotation is owned by the `scan-secrets` remediation doctrine; this skill is the "store the value and update the caller" tail of that lifecycle, and it is equally usable on its own for routine hygiene (getting secrets out of a `.env` before they ever leak).

## When to Use

- You have plaintext secrets in a `.env`, config file, or source and want them centralized in your secrets manager.
- A scan surfaced hardcoded credentials and you want them vaulted (rotate first if they have leaked — see the warning in the move flow).
- You are onboarding a repo to a secrets manager your team already runs.

Do **not** use this skill to:
- **Find** secrets — that is `scan-secrets`.
- **Rotate** a leaked secret — that is the `scan-secrets` remediation doctrine.
- **Provision** a new vault, or wire **runtime** secret-fetching into your app — both are out of scope.

## Onboarding (first use)

### Prerequisites

- **An existing, reachable secrets manager** and its CLI, installed and authenticated. One of: HashiCorp Vault (`vault`), AWS Secrets Manager (`aws`), GCP Secret Manager (`gcloud`), Azure Key Vault (`az`), Doppler (`doppler`), 1Password (`op`), or Infisical (`infisical`). This skill targets a vault you already run — it does not provision one.
- **`ggshield`** — only needed if you want the skill to scan a target to discover secrets (input mode 2). Not needed if you point it at a file. See `references/ggshield-cli-setup.md`.

### Setup

Detect which secrets-manager CLI is installed and authenticated using the auth checks in `references/backends.md`. If exactly one is ready, use it. If several are, ask which to target. If none are, stop and point the user at that backend's login flow.

## The move workflow

Follow the full step-by-step flow in `references/move-workflow.md`: discover -> dedup by value -> detect backend -> leaked-check -> name -> store -> replace reference -> verify. The leaked-value warning in that file is mandatory and must be shown before storing any value that may have been exposed.

## Backends

Per-backend auth checks, store commands (stdin/file — never argv), naming conventions, and reference syntax live in `references/backends.md`. Three backends (Azure Key Vault, 1Password, Infisical) carry an argv-caution note.

## Best Practices

- **Leaked = burned.** A value that has been committed, pushed, or shared is compromised; vaulting the same value does not un-leak it. Rotate first (`scan-secrets` remediation doctrine), then vault the new value. This skill warns but never blocks — the judgment is the user's.
- **Never put a secret value in argv.** Use stdin or a file so it stays out of shell history and `ps`. For argv-only CLIs, use a `umask 077` temp file and delete it after.
- **One value = one entry.** Dedup before storing; replace every occurrence after.
- **Verify before done.** Re-scan the edited files to confirm the plaintext is gone and the reference is in place.
- **Stay in scope.** Do not rotate, do not provision a vault, do not wire runtime fetching — name those as the user's next steps instead.

## Troubleshooting

- **No vault CLI authenticated** — point the user at that backend's login (`vault login`, `aws configure`/SSO, `gcloud auth login`, `az login`, `doppler login`, `op signin`, `infisical login`). The skill does not provision a vault.
- **Multiple vault CLIs present** — ask which backend to target; do not guess.
- **Write permission denied** — the token/role lacks write scope on the target path; surface the exact path and required permission.
- **Secret already exists** — use the backend's update/new-version command (see `references/backends.md`) instead of create.
- **Value has special characters or newlines** — this is why the flow uses stdin/`file://`; avoid argv forms that mangle quoting.
- **Scan mode finds nothing but you know there are secrets** — confirm the target path and that `ggshield` is authenticated (`references/ggshield-cli-setup.md`); the file-input mode is the fallback.
