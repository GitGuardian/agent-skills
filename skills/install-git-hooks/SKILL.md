---
name: install-git-hooks
description: Install ggshield as a git pre-commit or pre-push hook so hardcoded secrets are blocked before they enter git history. Use when setting up secret prevention on a repo, when the user asks to block or stop secrets from being committed or pushed, when configuring pre-commit hooks, or after a secret was caught and they want to prevent a recurrence. Local for one repo or global for all repos.
metadata:
  version: "0.3.0" # x-release-please-version
---

# ggshield — Install Git Hooks

## Overview

`ggshield install` wires `ggshield` into git as a **pre-commit** or **pre-push** hook so that
hardcoded secrets are caught and blocked *before they enter git history*. This is the
**prevention** layer: the reactive skills (`scan-secrets`, `scan-machine`, `check-hmsl`) find
secrets that already exist; this one stops new ones from being committed in the first place.

Two hook stages, two scopes:

- **pre-commit** — runs when a commit is created. Catches the secret earliest, before it ever
  becomes a commit object. Blocks the `git commit`.
- **pre-push** — runs when you push. Lets you make local work-in-progress commits, but stops
  anything containing a secret from leaving the machine.
- **local** (`--mode local`) — installs the hook in the current repository only
  (`.git/hooks/`).
- **global** (`--mode global`) — installs into git's template directory so every repository you
  clone or init afterward inherits the hook. This modifies your global git configuration.

This skill covers git hooks only. `ggshield install` can also install AI-assistant hooks
(`claude-code`, `codex`, `copilot`, `cursor`, `vscode`); those are out of scope here.

## When to Use

Install a hook when:

- Setting up a new repository and you want secret prevention from day one.
- The user asks to "block secrets", "stop secrets being committed", "add a pre-commit hook",
  or "prevent this from happening again" after a secret was found.
- Hardening an existing repo or a developer's whole machine (global mode) against future leaks.

Do **not** use this skill to scan code that already exists — that is `scan-secrets`. A hook only
guards *future* commits/pushes.

## Onboarding (first use)

### Prerequisites

The hook calls the GitGuardian API to scan staged content, so `ggshield` must be **installed and
authenticated** before the hook will work. An unauthenticated hook will fail on every commit.

- `ggshield --version` must succeed.
- `ggshield api-status` must report a working API key.

### Setup

If either check fails, complete the setup steps in
[`references/ggshield-cli-setup.md`](references/ggshield-cli-setup.md) (install `ggshield`, then
`ggshield auth login`) before installing any hook.

## Choosing your hook

Walk the user through two decisions. Do **not** assume a default — present the trade-offs and let
the user choose.

**1. Stage — pre-commit or pre-push?**

| Stage | Catches | Trade-off |
|---|---|---|
| `pre-commit` | Earliest — blocks the `git commit` itself | Tightest. Cannot create even a local commit containing a secret. |
| `pre-push` | Before anything leaves the machine | Allows local WIP commits with secrets; only blocks on push. |

**2. Scope — local or global?**

| Scope | Applies to | Trade-off |
|---|---|---|
| `--mode local` | The current repository only | Contained, easy to reason about and remove. |
| `--mode global` | Every repo cloned/init'd afterward (git template dir) | Maximum coverage. **Modifies the user's global git config — get explicit consent before running it.** |

**Global mode is system-modifying.** Confirm with the user before installing a global hook;
never install one silently or as a convenience.

## Commands

Pick the combination the user chose. Examples:

```bash
# Local pre-commit hook (this repo only)
ggshield install -m local -t pre-commit

# Local pre-push hook
ggshield install -m local -t pre-push

# Global pre-commit hook (all future repos) — only after explicit user consent
ggshield install -m global -t pre-commit
```

Useful flags:

- `-f, --force` — overwrite an existing hook script of the same type.
- `-a, --append` — append ggshield to an existing hook script instead of overwriting it. Use
  this when the repo already has a pre-commit hook you must not clobber.

### Verify the install

After running `ggshield install`, confirm it landed:

1. The command exited `0`.
2. The hook script exists:
   - local: `.git/hooks/pre-commit` or `.git/hooks/pre-push` in the repo.
   - global: the script is written into git's configured template directory
     (`git config --get init.templateDir`).

This confirms **installation**, not live detection. It does not scan any existing code or prove
a real secret would be caught — it proves the hook is wired in. If the user wants to actually
scan code they already have, use the `scan-secrets` skill.

## Handling a blocked commit

When the hook fires, `ggshield` prints the detected secret's type and location and aborts the
`git commit` (pre-commit) or `git push` (pre-push). Because the hook runs **before the content
reaches any remote**, this is the easiest case to remediate — the *pre-leak* track:

1. Remove or replace the offending secret in the working tree (move it to an environment
   variable, a secrets manager, or an untracked `.env` that is gitignored).
2. Re-stage and commit again. The hook re-runs and passes.

**No rotation is required** — the secret never left your perimeter, so it has not leaked.

If, instead, you discover a secret that is **already in git history** (committed before the hook
existed, or already pushed to a remote), that is a different, harder situation: the secret is
exposed and must be treated as compromised. Use the `scan-secrets` skill, which carries the full
remediation doctrine for secrets that are already in history or already public.

## Best Practices

- **Prefer pre-commit for the strongest guarantee**; offer pre-push when the user wants to keep
  local WIP commits unblocked. State the trade-off rather than choosing for them.
- **Get explicit consent before global mode** — it changes the user's global git configuration.
- **Use `--append`, not `--force`, when a hook already exists**, unless the user confirms the
  existing hook is disposable. `--force` overwrites it.
- **A hook is not a substitute for `scan-secrets`.** It guards future commits only; existing code
  and history still need a scan.
- **Never echo secret values.** When reporting a blocked commit, report type, file, and line —
  not the secret itself.

## Troubleshooting

- **Every commit fails with an auth/API error.** The hook needs an authenticated `ggshield`. Run
  `ggshield api-status`; if it fails, complete the setup in
  [`references/ggshield-cli-setup.md`](references/ggshield-cli-setup.md).
- **`ggshield install` says a hook already exists.** Re-run with `-a, --append` to add ggshield
  alongside the existing hook, or `-f, --force` to replace it (destructive — confirm first).
- **The hook does not run on commit.** Confirm the script is executable and present at
  `.git/hooks/<type>`; for global mode confirm `git config --get init.templateDir` points where
  the hook was written and that the repo was created/cloned after the global install.
- **Need to bypass the hook once (emergency).** `git commit --no-verify` skips hooks. Use only
  when you are certain there is no secret; it defeats the protection.
- **Removing a hook.** Delete the hook script from `.git/hooks/` (local) or the template dir
  (global). There is no `ggshield uninstall`.
