# Choose and verify recurring secret protection

Use this reference before suggesting or installing a hook, or deciding whether a routine operation is already covered. Hooks invoke the scanner at defined events; an agent remembering to run a command is not a recurring control.

## Select by the event

| Need | Integration | Scope of detection |
|---|---|---|
| Prevent secret commits | Git `pre-commit` hook | Staged changes before the local commit is created |
| Prevent secret pushes | Git `pre-push` hook | Outgoing commits, including secrets removed in a later commit; a staged scan is not equivalent |
| Protect AI interactions | The active assistant's AI hooks | Supported prompt and tool events; does not replace Git hooks |
| Inspect existing files, history, or an artifact now | An explicit `scan-secrets` scan | The requested surface, even when hooks exist |

Recommend pre-commit for preventing local secret commits, pre-push for the push boundary, and the matching AI hook for recurring assistant interactions. Explain only the trade-off relevant to the request. Use a stated stage/scope without asking again. Ask which family only when neither the request nor the current task identifies one.

## Inspect existing protection once

Reuse coverage established in this session until the repo, assistant, configuration, or hook result changes. Do not run a scan to check whether a hook is installed.

For Git, resolve the effective paths from the target repository:

```bash
git config --show-origin --show-scope --get-all core.hooksPath
git rev-parse --path-format=absolute --git-path hooks/pre-commit
git rev-parse --path-format=absolute --git-path hooks/pre-push
```

An unset `core.hooksPath` is normal. Inspect the resolved script's executable bit and dispatch chain, and the manager configuration it loads. Account for worktrees and local/global overrides. A `.git/hooks` file may be shadowed; a `.pre-commit-config.yaml` file may have no installed launcher. A lint-only hook is not a secret-scanning hook. Recognize existing equivalent secret protection without installing a second scanner just for this skill.

Check that the desired scanner/stage is reachable and blocking: an earlier unconditional `exit`/`exec`, skipped hook, `--exit-zero`, swallowed exit status, or bypass disables that guarantee. Do not add `--no-verify`, `SKIP=ggshield`, or similar bypasses. Treat a hook error or skipped scan as unverified coverage, not a clean result. The pre-push hook can skip large pushes (default: more than 50 commits, controlled by `max-commits-for-hook`); report a skip and propose the appropriate configuration fix or a separately authorized scan of the outgoing range.

For AI hooks, inspect only the relevant hook entries in the effective project/user configuration, enabled events, and trust requirements. Do not dump unrelated settings or credentials. `ggshield machine doctor`, when available in `--help`, provides additional read-only checks of hook setup, shadowing, and authentication. Interpret individual checks: a failure about an unrelated honeytoken or plugin scope does not establish that a Git hook is absent.

If the matching protection is effective, continue the authorized operation and use its normal hook result. Do not run `ggshield secret scan pre-commit`, `pre-push`, `path`, or `ai-hook` alongside it for the same routine check. An explicit one-off scan or investigation remains a separate task.

If protection is missing or ineffective, offer to install or repair the matching integration once. A recommendation is not permission to change configuration; an explicit setup request already authorizes its stated scope. If declined, record that choice for the session and continue the original task without claiming it was scanned. Do not turn the refusal into repeated scan commands or repeated installation prompts. Stop and address concrete suspected or detected secrets regardless of hook coverage.

## Install through the existing Git hook manager

Inspect before writing. Preserve the user's existing checks.

- **pre-commit framework:** add or update the official ggshield entry in the existing `.pre-commit-config.yaml`. Use `id: ggshield` with `stages: [pre-commit]`, or `id: ggshield-push` with `stages: [pre-push]`. Keep an existing compatible pinned revision; verify an upstream release before selecting a new pin. Then install the selected launcher with `pre-commit install --hook-type pre-commit` or `pre-commit install --hook-type pre-push`. Do not replace the framework's generated script with a standalone ggshield hook.
- **Husky, Lefthook, or another manager:** integrate through that manager's configuration and preserve exit-status propagation and, for pre-push, Git's arguments and stdin. Consult that manager's documentation for its contract.
- **Unmanaged hook script:** use `ggshield install --mode local --hook-type <stage>` when no hook exists. Use `--append` only after checking that the appended command will execute and its failure will block the operation. If an earlier `exit`/`exec` makes appending ineffective, integrate before it while preserving existing behavior. Do not overwrite with `--force` without explicit authorization.

Global Git installation (`ggshield install --mode global --hook-type <stage>`) changes user-level Git configuration. Use it only for an explicitly requested global scope; verify the installed version's effective paths and overrides rather than assuming it uses templates or covers only future repositories.

## AI hook installation and limits

Verify `ggshield --version` and relevant `--help`. Local installation uses:

```bash
ggshield install --mode local --hook-type claude-code
# Substitute the requested supported assistant: cursor, codex, copilot, vscode, vibe.
```

For an explicitly requested user-wide AI hook on ggshield 1.53.0+, target just that assistant:

```bash
ggshield machine setup --no-git-hooks --no-honeytokens --agent claude-code
```

Bare `machine setup` also installs global Git hooks and plants a honeytoken. Do not use it for an AI-only request. On older versions, `ggshield install --mode global --hook-type <assistant>` is the legacy path; verify support first. AI hooks require 1.49.0+, Codex requires 1.51.0+, and Vibe requires 1.54.0+.

Current user-level paths are `~/.claude/settings.json`, `~/.cursor/hooks.json`, `~/.codex/hooks.json`, `~/.copilot/hooks/hooks.json` (Copilot/VS Code), and `~/.vibe/hooks.toml`. Resolve project paths from installer output; local Copilot writes `.github/hooks/hooks.json` and requires folder trust, with additional opt-in for prompt mode. Preserve unrelated hook entries.

Prompt/pre-tool detections can block before execution. Post-tool detections notify after execution; they cannot undo disclosure. AI scan errors fail open with a warning. Describe the events actually enabled for the assistant; do not promise that every output is blocked before reaching model context. Never invoke `ggshield secret scan ai-hook` manually; the assistant supplies its event input.

## Verify without a duplicate scan

Confirm installer success, the effective hook/manager entry, executable launcher where required, stage/event registration, and readiness in the target environment. Separate “installed/configured” from “ran and passed.” Do not create a dummy secret, commit, push, or manually replay a scan just to verify installation. On the next authorized operation, report its actual hook result; if it blocks, address the finding and let the same hook validate the retry.

## Verified sources

Checked against ggshield 1.54.0 CLI help and official documentation on 2026-09-17. Recheck the installed version when applying commands.

- [Pre-commit integration](https://docs.gitguardian.com/ggshield-docs/integrations/git-hooks/pre-commit)
- [Pre-push integration and commit limit](https://docs.gitguardian.com/ggshield-docs/integrations/git-hooks/pre-push)
- [Official pre-commit framework hook definitions](https://github.com/GitGuardian/ggshield/blob/v1.54.0/.pre-commit-hooks.yaml)
- [AI hook setup, events, and limitations](https://docs.gitguardian.com/ggshield-docs/integrations/ai-coding-tools/secret-scanning-for-ai-coding-tools)
- [Git hook resolution and execution](https://git-scm.com/docs/githooks)
