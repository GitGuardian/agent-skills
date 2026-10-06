# Recurring secret protection

## Choose the hook

- A pre-commit hook checks staged changes.
- A pre-push hook checks outgoing commits, including intermediate versions.
- An AI hook checks supported events of the named or active AI assistant.

AI hooks do not replace Git hooks. Use the stage and the scope that the user requested. Ask only for a missing choice.

Reuse protection that works. Offer a missing installation or a repair one time. An explicit installation request authorizes its stated scope. A scan request does not. A global installation needs explicit authorization. If the user declines, do not ask again, and do not run scans instead. An explicit scan request or a concrete suspected leak still needs an investigation.

## Check protection once per context

Reuse the result until the repository, the assistant, the configuration, or a hook result changes. Resolve the Git hooks from the target repository:

```bash
git config --show-origin --show-scope --get-all core.hooksPath
git rev-parse --path-format=absolute --git-path hooks/pre-commit
git rev-parse --path-format=absolute --git-path hooks/pre-push
```

An unset `core.hooksPath` is normal. Check that each hook file is executable. Check that it dispatches to the hook manager configuration. Account for worktrees and overrides. These give no secret protection:

- a script in `.git/hooks` that `core.hooksPath` shadows
- a hook manager configuration without a launcher
- a hook that only runs a linter

An equivalent secret scanner counts as protection. Reuse it.

Check that the hook reaches the scan and that a failure stops the operation. These can disable protection: an unconditional `exit` or `exec` before the scan, `--exit-zero`, a swallowed exit status, or a bypass. Never add `--no-verify` or `SKIP=ggshield`. Report an error or a skipped check as unchecked, not as clean. The pre-push hook can skip a large push. The default limit is 50 commits (`max-commits-for-hook`). Report this. Then propose a configuration repair, or a separately authorized scan of the outgoing range.

For AI hooks, check the effective project and user entries, the enabled events, and the trust settings. Do not show unrelated settings or credentials. Use `ggshield machine doctor` when the installed version supports it. Interpret each check on its own. A honeytoken check that fails does not mean that a Git hook is absent.

## Install Git hooks

Keep the existing checks and the existing hook manager:

- **pre-commit framework:** use the official hook `id: ggshield` with `stages: [pre-commit]`, or `id: ggshield-push` with `stages: [pre-push]`. Keep a compatible pinned revision. Check upstream before you choose a new revision. Run `pre-commit install --hook-type <stage>`. Do not replace the launcher that the framework generates.
- **Husky, Lefthook, or another manager:** use the configuration that the manager documents. Keep the failure propagation. Keep the pre-push arguments and stdin.
- **No manager:** run `ggshield install --mode local --hook-type <stage>`. Use `--append` only when the existing hook reaches the scan and a failure stops the operation. If necessary, insert the scan before a terminal `exit` or `exec`. Do not use `--force` without authorization.

For an explicitly requested global Git installation, use `--mode global`. Check the effective paths and overrides. Do not assume that the global hook applies.

## Install AI hooks

Check the installed version and its help output. Replace `<assistant>` with the requested supported identifier: `claude-code`, `cursor`, `codex`, `copilot`, `vscode`, or `vibe` (Mistral Vibe).

```bash
# Project-local protection:
ggshield install --mode local --hook-type <assistant>
# User-wide protection for AI hooks only, when the user requested it (ggshield 1.53.0 or later):
ggshield machine setup --no-git-hooks --no-honeytokens --agent <assistant>
```

A bare `machine setup` also installs Git hooks and plants a honeytoken. On older versions, use `ggshield install --mode global --hook-type <assistant>`, and check that the version supports it. AI hooks need ggshield 1.49.0 or later. Codex needs 1.51.0 or later. Mistral Vibe needs 1.54.0 or later.

Read the configuration paths from the installer output. Keep the unrelated entries. A local Copilot hook needs folder trust. Prompt mode needs an additional opt-in. A finding in a prompt or pre-tool event can block the action. A finding in a post-tool event cannot undo the action. When an AI scan has an error, the action continues and ggshield shows a warning. Describe the enabled events. Do not promise that the hook blocks all output. Never run `secret scan ai-hook` manually. The assistant supplies its input.

## Check the configuration, then let the hooks run

After an installation, check:

- the installer reported success
- the entries are effective
- the launchers are executable
- the stages or events are enabled
- the authentication works
- the environment is ready

Do not create a test secret, a test commit, or a test push. Do not run a duplicate scan. Report "configured" and "ran and passed" as two different states. The next authorized operation runs the hook. If the hook finds a secret, remediate it. The same hook checks the authorized retry.

## Sources

Check the installed help output and the official documentation when you apply a command:

- [Pre-commit](https://docs.gitguardian.com/ggshield-docs/integrations/git-hooks/pre-commit) and [pre-push](https://docs.gitguardian.com/ggshield-docs/integrations/git-hooks/pre-push)
- [Framework definitions](https://github.com/GitGuardian/ggshield/blob/v1.54.0/.pre-commit-hooks.yaml)
- [AI hooks](https://docs.gitguardian.com/ggshield-docs/integrations/ai-coding-tools/secret-scanning-for-ai-coding-tools)
- [Git hook resolution](https://git-scm.com/docs/githooks)
