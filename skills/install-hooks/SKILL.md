---
name: install-hooks
description: Install ggshield as a hook so secrets are caught before they leak. Covers git hooks (pre-commit and pre-push) that block secrets from entering git history, and AI-assistant hooks (claude-code, codex, copilot, cursor, vscode) that scan an AI coding tool's prompts, actions, and outputs in real time. Use when asked to install Claude Code, Cursor, Copilot, or git hooks, or to block secrets from being committed or pushed.
metadata:
  version: "0.4.1" # x-release-please-version
---

# ggshield — Install Hooks

## Overview

`ggshield install` wires `ggshield` in as a hook so hardcoded secrets are caught **before they
leak**. This is the **prevention** layer — the reactive skills (`scan-secrets`, `scan-machine`,
`check-hmsl`) find secrets that already exist; this one stops new ones at the door.

It installs two distinct families of hook:

- **Git hooks** — `pre-commit` / `pre-push`. Catch a secret as it is committed or pushed and block
  the git operation, so it never enters history.
- **AI-assistant hooks** — `claude-code`, `codex`, `copilot`, `cursor`, `vscode`. Register
  `ggshield` inside an AI coding tool so it scans the tool's prompts, actions, and outputs in real
  time: it scans your prompt before it reaches the model, scans commands, file reads, and MCP calls
  before the agent runs them, and scans outputs — blocking the prompt or action when a secret is
  found.

Both families install **local** (this project only) or **global** (all projects). Global is
system-modifying — get explicit consent first.

## When to Use

Install a hook when:

- The user asks to "install Claude hooks", "add a Cursor hook", "set up Copilot/Codex secret
  scanning", or otherwise wants their **AI coding tool** to stop secrets — that is the
  **AI-assistant** family.
- The user asks to "block secrets", "add a pre-commit hook", "stop secrets being committed or
  pushed", or "prevent this from happening again" after a secret was found — that is the **git**
  family.
- Setting up a new repo or hardening a machine and you want secret prevention from day one.

Do **not** use this skill to scan code that already exists — that is `scan-secrets`. A hook only
guards *future* commits, pushes, or AI-tool interactions.

## Which hook do you want?

`ggshield install` covers two families. Route by what the user said — do not guess across families:

| The request mentions… | Install this family | Hook type |
|---|---|---|
| "Claude" / "Claude Code" | AI-assistant | `claude-code` |
| "Cursor" | AI-assistant | `cursor` |
| "Copilot" / "VS Code" | AI-assistant | `copilot` / `vscode` |
| "Codex" | AI-assistant | `codex` |
| "AI assistant" / "agent" hook generically | AI-assistant | ask which tool |
| "pre-commit" / "pre-push" / "git hook" | git | `pre-commit` / `pre-push` |
| "block secrets from being committed / pushed", "stop secrets entering history" | git | `pre-commit` / `pre-push` |

**If the request is bare — e.g. "install hooks" with no family signal — STOP and ask which family
before running anything.** Present the two one-liners:

- *Git hook* — blocks secrets from entering this repo's git history (on commit or push).
- *AI-assistant hook* — makes your AI coding tool (Claude Code, Cursor, Copilot, Codex) scan its
  prompts and actions for secrets in real time.

Once the family is clear, walk the within-family choices under [Choosing your hook](#choosing-your-hook).

## Onboarding (first use)

### Prerequisites

Every hook calls the GitGuardian API to scan content, so `ggshield` must be **installed and
authenticated** before any hook will work. An unauthenticated hook fails on every commit or
AI-tool action.

- `ggshield --version` must succeed. AI-assistant hooks need `ggshield 1.49.0+` (`1.51.0+` for
  `codex`).
- `ggshield api-status` must report a working API key.
- For an **AI-assistant** hook, the target tool (Claude Code, Cursor, Copilot/VS Code, Codex) must
  itself be installed — the hook is written into that tool's config.

### Setup

If either check fails, complete the setup steps in
[`references/ggshield-cli-setup.md`](references/ggshield-cli-setup.md) (install `ggshield`, then
`ggshield auth login`) before installing any hook.

## Choosing your hook

Once the family is settled, walk the user through the within-family choices. Do **not** assume a
default — present the trade-offs and let the user choose.

### Git hooks

**1. Stage — pre-commit or pre-push?**

| Stage | Catches | Trade-off |
|---|---|---|
| `pre-commit` | Earliest — blocks the `git commit` itself | Tightest. Cannot create even a local commit containing a secret. |
| `pre-push` | Before anything leaves the machine | Allows local WIP commits with secrets; only blocks on push. |

**2. Scope — local or global?**

| Scope | Applies to | Trade-off |
|---|---|---|
| `--mode local` | The current repository only | Contained, easy to reason about and remove. |
| `--mode global` | Every repo cloned/init'd afterward (git template dir) | Maximum coverage. **Modifies the user's global git config — get explicit consent.** |

### AI-assistant hooks

**Scope — local or global?** Same present-the-choice discipline as git hooks.

| Scope | Applies to | Writes to (Claude Code example) |
|---|---|---|
| `--mode local` | The current project only | the project's `.claude/settings.json` |
| `--mode global` | All projects, for this user | the user-level `~/.claude/settings.json` |

**Global mode is system-modifying** for both families. Confirm with the user before installing a
global hook; never install one silently.

## Commands

Pick the family and combination the user chose.

### Git hooks

```bash
# Local pre-commit hook (this repo only)
ggshield install -m local -t pre-commit

# Local pre-push hook
ggshield install -m local -t pre-push

# Global pre-commit hook (all future repos) — only after explicit user consent
ggshield install -m global -t pre-commit
```

### AI-assistant hooks

```bash
# Claude Code hook, this project only
ggshield install -m local -t claude-code

# Cursor hook, all projects (user-level) — system-modifying, confirm first
ggshield install -m global -t cursor

# Other tools: -t copilot, -t vscode, -t codex
```

Which file each AI-assistant hook writes:

| Tool | `-t` value | Config file |
|---|---|---|
| Claude Code | `claude-code` | `.claude/settings.json` (local) or `~/.claude/settings.json` (global) |
| Cursor | `cursor` | `.cursor/hooks.json` |
| GitHub Copilot / VS Code | `copilot` / `vscode` | VS Code settings |
| Codex | `codex` | `~/.codex/hooks.json` |

Useful flags (both families):

- `-f, --force` — overwrite an existing hook script/config entry of the same type.
- `-a, --append` — append `ggshield` to an existing hook instead of overwriting. Use when the repo
  or tool already has a hook you must not clobber.

### Verify the install

After running `ggshield install`, confirm it landed:

1. The command exited `0`.
2. The hook is present:
   - **git, local:** `.git/hooks/pre-commit` or `.git/hooks/pre-push` in the repo.
   - **git, global:** the script is written into git's template directory
     (`git config --get init.templateDir`).
   - **AI-assistant:** the tool's config file now references `ggshield` (e.g. a `ggshield` entry in
     `.claude/settings.json`, `.cursor/hooks.json`, or `~/.codex/hooks.json`).

This confirms **installation**, not live detection. It does not scan existing code or prove a real
secret would be caught — it proves the hook is wired in. To scan code you already have, use the
`scan-secrets` skill.

## Handling a blocked commit or action

When a **git** hook fires, `ggshield` prints the detected secret's type and location and aborts the
`git commit` (pre-commit) or `git push` (pre-push). When an **AI-assistant** hook fires, it blocks
the prompt or the agent's action before it runs. Either way the content has **not** reached any
remote — this is the easiest case to remediate, the *pre-leak* track:

1. Remove or replace the offending secret in the working tree or prompt (move it to an environment
   variable, a secrets manager, or an untracked `.env` that is gitignored).
2. Re-stage and commit again, or re-issue the prompt. The hook re-runs and passes.

**No rotation is required** — the secret never left your perimeter, so it has not leaked.

**If the workspace has a custom remediation workflow**, ggshield (≥ 1.30.0) prints the
organization's own remediation message in the block output (configured per touchpoint under
GitGuardian → Remediation workflow → Pre-commit / Pre-push / Pre-receive). That message is the
customer's security team's process and **takes the lead** — surface it to the user verbatim as
the primary guidance, then follow the remove-and-recommit steps above to fill in around it. Do
not replace it with generic advice.

If, instead, you discover a secret that is **already in git history** (committed before the hook
existed, or already pushed), that is a different, harder situation: the secret is exposed and must
be treated as compromised. Use the `scan-secrets` skill, which carries the full remediation
doctrine for secrets that are already in history or already public.

## Best Practices

- **Route by family first.** If the user named an AI tool (Claude, Cursor, Copilot, Codex), install
  that AI-assistant hook — not a git pre-commit hook. If the request is bare "install hooks", ask
  which family before acting.
- **Prefer pre-commit for the strongest git guarantee**; offer pre-push when the user wants to keep
  local WIP commits unblocked. State the trade-off rather than choosing for them.
- **Get explicit consent before global mode** (either family) — it changes user-level config.
- **Use `--append`, not `--force`, when a hook already exists**, unless the user confirms the
  existing hook is disposable. `--force` overwrites it.
- **A hook is not a substitute for `scan-secrets`.** It guards future commits, pushes, and AI-tool
  interactions only; existing code and history still need a scan.
- **Never echo secret values.** When reporting a block, report type, file, and line — not the
  secret itself.

## Troubleshooting

- **Every commit or AI action fails with an auth/API error.** The hook needs an authenticated
  `ggshield`. Run `ggshield api-status`; if it fails, complete the setup in
  [`references/ggshield-cli-setup.md`](references/ggshield-cli-setup.md).
- **`ggshield install` says a hook already exists.** Re-run with `-a, --append` to add ggshield
  alongside the existing hook, or `-f, --force` to replace it (destructive — confirm first).
- **The AI-assistant hook does nothing.** Confirm the target tool is installed and that the
  expected config file was written (`.claude/settings.json`, `.cursor/hooks.json`, `~/.codex/hooks.json`,
  or VS Code settings); confirm `ggshield 1.49.0+` (`1.51.0+` for codex).
- **A git hook does not run on commit.** Confirm the script is executable and present at
  `.git/hooks/<type>`; for global mode confirm `git config --get init.templateDir` points where the
  hook was written and that the repo was created/cloned after the global install.
- **Need to bypass a git hook once (emergency).** `git commit --no-verify` skips hooks. Use only
  when you are certain there is no secret; it defeats the protection.
- **Removing a hook.** Delete the hook script from `.git/hooks/` (local) or the template dir
  (global); for AI-assistant hooks, remove the `ggshield` entry from the tool's config file. There
  is no `ggshield uninstall`.
