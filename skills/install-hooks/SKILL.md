---
name: install-hooks
description: Install or repair deterministic secret-scanning hooks when users want recurring checks on commits, pushes, or AI interactions, ask to prevent leaks, or need protection while editing credential-handling code. Use when existing hooks are missing or ineffective, or when repeated agent scans duplicate them. Covers Git pre-commit/pre-push and supported AI assistants.
metadata:
  version: "0.6.2" # x-release-please-version
---

# GitGuardian — Install Hooks

## Overview

Configure ggshield to scan at defined Git or AI-assistant events. The hook performs the recurring check without depending on the agent remembering to invoke a scanner.

**Core rule:** inspect effective protection once, reuse it when present, and offer to install or repair the matching integration when missing. Do not run an ad-hoc scan before every edit, commit, push, or AI action. If installation is declined, respect that choice without repeated prompts or scans; do not claim unscanned work is clean.

## When to Use

- The user wants to prevent secret commits or pushes, including “check before every commit/push.”
- The user asks for secret protection in Claude Code, Cursor, Codex, Copilot, VS Code, or another supported assistant.
- Credential-handling edits reveal a need for recurring protection, or repeated agent scans duplicate an existing hook.
- A hook is missing, disabled, shadowed by another hook manager, or failing.

An explicit one-off scan or investigation belongs to `scan-secrets`, even if hooks exist. Installing hooks does not audit existing files or history. A concrete suspected or detected secret still needs attention.

## Onboarding (first use)

### Prerequisites

Before installation, check `ggshield --version`, the relevant command's `--help`, and `ggshield api-status`. The hook environment must have access to the CLI and authentication. Do not repeat these checks for every operation once readiness is established.

AI hooks require ggshield 1.49.0+; Codex requires 1.51.0+, and Mistral Vibe requires 1.54.0+. The current user-wide AI setup command requires 1.53.0+. Verify that the requested assistant is installed and supports the configured events.

### Setup

If the CLI or authentication is missing, follow [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md). Complete only the setup authorized by the user.

## Choose and install the integration

Read [references/hook-selection.md](references/hook-selection.md) before inspecting or changing hooks. It covers effective paths, existing managers, installation commands, and verification without a scan.

| User's need | Recommend | What it checks |
|---|---|---|
| Prevent secrets in local commits | Git `pre-commit` | Staged changes before creating the commit |
| Prevent secrets reaching a remote | Git `pre-push` | Outgoing commits, including intermediate commits |
| Protect assistant prompts and tool interactions | The named or active assistant's AI hook | Supported events inside that assistant |

Use the family, stage, and scope already identified by the request. For “prevent secret commits in this repo,” explain and use local pre-commit. For “before every push,” recommend pre-push. For bare “install hooks,” ask which family; for a generic AI-hook request with no identifiable assistant, ask which assistant.

A recommendation alone does not authorize installation. An explicit request to set up protection already authorizes its stated scope; do not ask for the same permission again. Global installation changes user-level configuration and requires that scope to be explicitly requested or approved.

### Git hooks

Inspect the effective hook and manager first. If the repo uses the pre-commit framework, Husky, Lefthook, or another manager, integrate ggshield there; preserve all existing checks. A framework installation or lint-only hook does not establish secret-scanning coverage.

For a repo with no existing hook manager or script:

```bash
ggshield install --mode local --hook-type pre-commit
# Or, when the requested boundary is push:
ggshield install --mode local --hook-type pre-push
```

Use `--append` only when inspection proves the appended command will run and propagate failure. Do not blindly append after `exit`/`exec`, replace a generated manager script, or use `--force` without explicit permission to overwrite.

### AI-assistant hooks

```bash
# Current project only; substitute the requested supported assistant
ggshield install --mode local --hook-type claude-code

# User-wide AI protection for that assistant only, ggshield 1.53.0+
# Requires an explicitly requested or approved user-wide scope
ggshield machine setup --no-git-hooks --no-honeytokens --agent claude-code
```

Do not use bare `machine setup` for an AI-only request: it also installs global Git hooks and plants a honeytoken. Older-version commands and configuration locations are in [references/hook-selection.md](references/hook-selection.md).

AI hooks complement Git hooks. Prompt/pre-tool detections can block; post-tool detections notify after execution, and scan errors fail open with a warning. Do not promise that every secret is blocked before reaching model context. Never invoke `ggshield secret scan ai-hook` manually.

### Verify and hand back control

Confirm successful installation and the effective configuration, reachable executable launcher, selected stage/events, and authentication readiness. Use `ggshield machine doctor` when supported, interpreting the relevant checks individually. Do not run a scan, create a test secret, or make a test commit/push to prove installation.

Report “configured” separately from “ran and passed.” Let the hook run on the next authorized operation. Reuse that coverage until context changes; do not install duplicates or add a second scan for the same event.

## Handling a finding

Report the secret type and location without its value. Preserve the organization's custom remediation message as primary guidance. Establish whether the credential stayed local, was pushed, or reached an external service/model; a blocked operation alone does not prove it was never exposed elsewhere.

For a purely local, never-exposed credential, remove it before retrying. A pre-push finding can require cleaning the affected unpushed commits, not just HEAD. If exposed, coordinate rotation and remediation. Use `scan-secrets` for its full remediation guidance when available. Let the same hook validate the next authorized retry rather than adding a parallel scan.

## Best Practices

- Prefer a deterministic integration for a repeated operation. Use ad-hoc scans for explicit inspections and investigations.
- Respect existing equivalent secret protection and the user's hook manager.
- Reuse the user's installation decisions; a declined setup is not permission for repeated discretionary scans.
- Git hook bypasses, skip limits, exclusions, and nonblocking modes limit coverage. Do not bypass a failing hook or claim a skipped/failed scan passed.
- Do not claim that pre-push prevents secrets entering local history, or that AI hooks replace Git gates.

## Troubleshooting

- **Hook absent or not firing:** resolve `core.hooksPath` and the actual hook path, check executable permissions and manager dispatch, and repair the integration in that manager. Do not repeatedly compensate with manual scans.
- **Authentication/API error:** follow the setup reference and the hook's diagnostic. An AI action can proceed unscanned on error; report that limitation and repair readiness.
- **AI hook installed but inactive:** check effective user/project configuration, registered events, supported version, and project trust. Local Copilot hooks also have prompt-mode restrictions.
- **Existing script:** inspect before using `--append`; preserve existing behavior and blocking exit status.
- **Removal:** remove only the ggshield entry through the owning manager/configuration, preserving other hooks. Do not invent `ggshield uninstall`; check installed CLI help for supported commands.
