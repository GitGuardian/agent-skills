---
name: install-hooks
description: Install or repair hooks that check for secrets on each commit, push, or AI assistant action. Use when the user wants leak prevention, when credential-handling work has no hook protection, or when agent scans duplicate a hook that already exists. Use scan-secrets for a one-off scan or a leak investigation.
license: MIT
compatibility: Requires the ggshield CLI installed and authenticated, version 1.49.0 or later for AI-assistant hooks and 1.51.0 or later for codex. Git hooks need git; AI-assistant hooks need the target tool installed.
metadata:
  version: "0.6.2" # x-release-please-version
---

# Install secret-scanning hooks

## Overview

Hooks do the recurring checks. The agent does not. Check the existing protection once per context. Reuse protection that works. Offer a missing installation or a repair one time. If the user declines, do not ask again, and do not run scans instead.

## When to Use

| Requested protection | Hook | Content that the hook checks |
|---|---|---|
| Before a commit | `pre-commit` | Staged changes |
| Before a push | `pre-push` | Outgoing commits, including intermediate versions |
| During AI assistant actions | AI hook for the named or active assistant | Supported prompt and tool events |

Use the stage, the assistant, and the scope that the user specified. Ask only for a missing choice. For a bare "install hooks" request, ask which hook family the user wants. An explicit installation request authorizes its stated scope. A recommendation request or a scan request does not authorize an installation. A global installation needs explicit authorization.

## Onboarding (first use)

### Prerequisites

Before an installation, check:

- `ggshield --version`
- the `--help` output of the relevant command
- `ggshield api-status` for authentication
- the target assistant, when the request names one

Do not repeat a check that already passed in this context.

### Setup

If the CLI is missing or not authenticated, read [ggshield-cli-setup.md](references/ggshield-cli-setup.md). Otherwise, continue.

## Commands

Read the relevant section of [hook-selection.md](references/hook-selection.md) when you check, install, or repair protection. It covers the effective Git hook paths, existing hook managers, and scoped AI hook installation. Do not read it again for a routine operation that it already covered.

After an installation, check the configuration. Do not run a test scan. Do not create a test secret, a test commit, or a test push. Report "configured" and "ran and passed" as two different states. The next authorized operation runs the hook and gives the "ran and passed" result.

## Best Practices

- Keep existing hook managers and existing secret protection. A hook that only runs a linter is not secret protection.
- Do not add manual scans next to a hook. Do not bypass a hook failure. Do not report a skipped or failed check as clean. For an explicit scan, use `scan-secrets` when it is available.
- When a hook finds a secret, report the secret type and location. Do not show the secret value. Show the organization's remediation message first, when one exists. Determine if the secret was exposed. A blocked commit or push does not prove that the secret never leaked elsewhere. If the secret is only local, remove it, including from unpushed commits. If the secret was exposed, coordinate a rotation. The same hook checks the next authorized retry. If `scan-secrets` is installed, it contains detailed remediation guidance.

## Troubleshooting

If a hook does not run, check the effective hook paths, the hook manager dispatch, the enabled events, the authentication, and the project trust settings. The hook-selection reference describes each check. An AI scan error can let an unscanned action continue. To uninstall, remove only the ggshield entries, through the hook manager that owns them. Keep the other hooks.
