---
description: Create a GitGuardian honeytoken (decoy AWS credentials that alert when used) — bare or wrapped in a realistic file.
argument-hint: [--name <name>] [--description <text>] [--language <lang>] [-o <file>]
---

Create a honeytoken for the user with `ggshield honeytoken`. Use the `create-honeytokens` skill for full reference on when to plant, where to plant, naming conventions, and alert response.

## Decide which form to use

Based on `$ARGUMENTS`:

- **`-o <path>` points at a code file** (`.py`, `.js`, `.ts`, `.go`, `.sh`, `.yml`, `.tf`, `Dockerfile`, …) → use `create-with-context` so the honeytoken is wrapped in a plausible code snippet:

  ```bash
  ggshield honeytoken create-with-context --type AWS [--name <n>] [--description "<d>"] [--language <l>] -o <path>
  ```

- **No `-o`, or `-o` points at a plain text / docs file** (`.env.example`, `.txt`, `.md`, runbook snippet) → use the bare form:

  ```bash
  ggshield honeytoken create --type AWS [--name <n>] [--description "<d>"] [-o <path>]
  ```

`--type AWS` is always required (only AWS is supported today).

## Before generating

Two things to confirm with the user *before* running the command:

1. **Where will the honeytoken be planted?** A honeytoken sitting only on the user's laptop is wasted. Ask explicitly. If the user can't name a planting surface, surface the suggestion list from `create-honeytokens` (`.env.example`, pre-publication repo audit, internal wiki, deploy script, archived repo, container image).
2. **Has a meaningful `--description` been provided?** The description shows up in the alert months later. If the user didn't pass one, propose one that records *where* it was planted, *why*, and *when* — e.g. `"planted in repo X .env.example on 2026-05-21 to monitor template leaks"`.

If `--name` is not provided, `ggshield` auto-generates one with a `ggshield-` prefix. Suggest a hand-picked name keyed to the planting surface (e.g. `env-example-billing-service-2026-05`) for easier dashboard navigation.

## If ggshield is not set up or missing scope

The honeytoken commands need stricter setup than scanning:

- The user must have **Manager** access level on their GitGuardian workspace.
- The PAT must include the **`honeytokens:write`** scope (verify with `ggshield api-status` — look at the `Token scopes:` line).

If `ggshield --version` fails, follow the install section in the `scan-secrets` skill first.

If `api-status` shows the PAT lacks `honeytokens:write`, run the scope-recovery flow from `/references/gitguardian-platform.md` with `<required-scope>` = `honeytokens:write` — the agent can drive `ggshield auth logout` + `ggshield auth login --scopes honeytokens:write` directly, the user only approves in the browser. The same file covers the Manager-role caveat and headless `--method token` fallback.

Do not proceed with `ggshield honeytoken create` until both the version check and `api-status` (scope line) pass.

## After generation

- Exit `0`: honeytoken created. Confirm to the user: the name, where it was written, and the description. Remind them to **record the planting location** somewhere durable (internal wiki, ticket, vault note) — the GitGuardian dashboard stores the token, but the planting context lives with the user.
- `403 Forbidden` / "Insufficient permissions": the PAT is missing `honeytokens:write` or the user is not a Manager. Surface the prerequisite section above and stop.
- Other non-zero: surface the CLI stderr and stop.

For where to plant, naming conventions, and what to do when a honeytoken fires, refer the user to `references/planting-strategy.md` in the `create-honeytokens` skill.
