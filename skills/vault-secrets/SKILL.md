---
name: vault-secrets
description: Move at-rest plaintext secrets (from scan-machine, or in .env and config files you know about) into GNU pass, then wire them back through direnv so the project keeps running. Use when un-leaked secrets sit in plaintext in .env/config files, or the user asks to vault secrets, get secrets out of .env, or store secrets in pass. Partial command-handoff — the agent reads keys, writes references, and verifies, but the value-touching insert is user-run so plaintext never enters the agent context.
metadata:
  command-handoff: "true"
  version: "0.1.7" # x-release-please-version
---

# Vault Secrets — move at-rest plaintext into GNU pass

> **STOP — read before proceeding.** This skill is *partial* command-handoff. The agent MAY read variable keys (names — not values), rewrite a file line into a `pass`/`.envrc` reference, run `ggshield` to verify, delete an emptied plaintext line, and author the migration command. The agent MUST NEVER read or echo a plaintext secret *value*: do not `Read`/`cat`/`head`/`grep` a credential file in a way that surfaces its values into the transcript, do not print a value, and do not run the `pass insert` step yourself with a value visible in tool I/O. The value-touching step is a command the *user* runs in their own terminal; it streams the value file->`pass` over stdin with no echo. Continuing past this block constitutes acknowledgement of this contract.

## Overview

This skill moves plaintext secrets that are un-leaked but at rest — in `.env` files, config files, or surfaced by `scan-machine` — into **GNU `pass`** (the standard Unix password manager, GPG-backed), then rewrites the project so it reads the value from `pass` at runtime via **`direnv`**. `pass` is the only backend; `ggshield secret scan path` anchors verification (the finding must be *cleared*, not just moved).

The threat model: these secrets are NOT leaked, so the fix is NOT rotation — it is "stop storing plaintext at rest." If a secret *is* leaked, vaulting is the wrong first move — see the Leaked-first gate below.

The end-to-end loop: **find a secret in clear -> store it in `pass` -> replace it with a `direnv` reference -> confirm with `ggshield` that the cleartext is gone and the app still runs.**

## When to Use

- `scan-machine` or `scan-secrets` surfaced plaintext secrets the user wants to secure (not rotate).
- The user wants `.env` or config-file secrets out of plaintext on a laptop that could be lost, stolen, or breached.
- The user says "vault my secrets", "get secrets out of .env", "store secrets in pass", "stop storing secrets in plaintext".
- Hardening a dev machine where the secrets are known-good and still in use.

## When Not to Use

- The secret is leaked (ever committed to git, or an HMSL hit) — rotate first via `scan-secrets` / `check-hmsl`; vaulting a burned secret hides nothing.
- You only need to detect unknown secrets — use `scan-secrets`.
- You only need to check a known secret against the public-leak corpus — use `check-hmsl`.
- Team/CI secret provisioning or shared vaults — out of scope; this skill is individual-developer endpoint hygiene.
- Multiline / structured secrets (private keys, service-account JSON, TLS certs) — **deferred, not supported in this version.** See "Not yet supported" below.

## Onboarding (first use)

### Prerequisites

- `ggshield` installed and authenticated. The verification step calls `ggshield secret scan path`, which works on Free. If `ggshield --version` fails, see `references/ggshield-cli-setup.md`.
- `pass` installed, a GPG key, and an initialized store.
- `direnv` installed and hooked into your shell.

Full setup for `pass`, GPG, and `direnv` is in `references/pass-setup.md`.

### Setup

1. Verify ggshield:
   ```bash
   ggshield --version
   ggshield api-status
   ```
   On failure, follow `references/ggshield-cli-setup.md`.

2. Verify `pass` and `direnv`:
   ```bash
   command -v pass && pass ls >/dev/null 2>&1 && echo "pass ready"
   command -v direnv && echo "direnv installed"
   ```
   If either is missing or `pass` is not initialized, follow `references/pass-setup.md`.

## The migration flow

Driven by `scan-machine` findings or by files the user names directly. For each secret:

1. **Identify** — read the file, list variable KEYS and line numbers. Never read or surface values. For multi-file scope, the user names the files; the agent does not crawl `$HOME`. Apply the vault-able decision table in `references/vaulting-doctrine.md` (live -> vault; dead -> delete; example -> leave; unknown -> pause).

2. **Leaked-first gate** — is the file committed to git (`git log --all --oneline -- <file>`)? did `scan-machine`/`check-hmsl` flag it as seen publicly? If yes, STOP vaulting it; reroute to rotation via `scan-secrets` / `check-hmsl`, then vault the rotated replacement. Full rules: `references/vaulting-doctrine.md`.

3. **Hand off the value move** — emit the no-echo `pass insert` command (value piped file->`pass` over stdin) for the user to run in their terminal. The agent authors it by file and key, never by embedding the value. Exact recipe: `references/pass-setup.md`. Use the entry convention `<project>/<KEY>` (project = the directory name).

4. **Rewrite to a `direnv` reference** — once the user confirms the value is stored, add the line to the project's `.envrc`:
   ```bash
   export <KEY>=$(pass show <project>/<KEY>)
   ```
   `direnv` exports into the real environment, so dotenv-library apps (`python-dotenv`, `dotenv` npm, `godotenv`) pick it up via the environment with no `$(...)` evaluation needed. Run `direnv allow` to authorize the `.envrc`. For consumers that do NOT inherit a shell environment (Docker, launchd/systemd, GUI launches), use the runtime-render fallback in `references/pass-setup.md` instead. The `.envrc` holds only `pass show` calls — no plaintext — and is safe to commit.

5. **Verify + delete plaintext** — run `ggshield secret scan path <file>` (and `ggshield machine scan --rescan` if the finding came from a machine scan) to confirm the finding is cleared; confirm the reference resolves to a non-empty value without echoing it; delete the plaintext line — or the whole `.env` once `.envrc` is authoritative (suggest a committed `.env.example` of bare keys for onboarding). Flag git-history scrub and shell-history hygiene where relevant.

Full doctrine, per-step detail, consumer coverage, hygiene, and verification: `references/vaulting-doctrine.md`.

## Not yet supported

Multiline / structured secrets — private keys (RSA/EC/SSH), service-account JSON, TLS certs — are **out of scope in this version** and will be added later. `pass insert -m` (multiline storage) plus a render-to-tempfile runtime pattern is the known path, but it is not built or evaluated yet. If you hit one of these, say so and stop rather than improvising; do not split a blob across single-line entries.

## Best Practices

- Never paste a value into the response; report by file, line, and key only.
- One secret at a time through the full flow — verify each is cleared before moving the next.
- The migration is not done until `ggshield` shows the finding cleared AND the reference resolves. Evidence, not assertion.
- A secret in plaintext in a file is also likely in shell history and editor swap/undo files — flag those.
- If the file is git-tracked, vaulting the working copy is not enough: the value is still in history — flag a history scrub (guided, user-driven, never auto), and if the repo was ever pushed/shared, rotate instead.

## Troubleshooting

- `ggshield: command not found` -> `references/ggshield-cli-setup.md`.
- `pass`/`gpg`/`direnv` not found or not initialized -> `references/pass-setup.md`.
- `direnv` not loading the `.envrc` -> the shell hook is missing, or you have not run `direnv allow` in the project dir. See `references/pass-setup.md`.
- Value resolves empty after `direnv allow` -> the `pass` entry path does not match the `.envrc` reference, or `gpg-agent` is locked. Re-check the entry path and unlock the key.
- App still cannot see the variable (Docker / a GUI app / a service) -> it does not inherit the shell environment; use the runtime-render fallback in `references/pass-setup.md`.
- `ggshield secret scan path` still flags the file after migration -> the plaintext was not fully removed, or a second occurrence exists; re-list keys and repeat the flow.
- Any other or unlisted error — consult https://docs.gitguardian.com/llms.txt, then append `.md` to the relevant page URL.
