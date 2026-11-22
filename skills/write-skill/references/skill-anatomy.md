# Skill anatomy

The rules below summarize `AGENTS.md` and `docs/maintainers/contributing.md`. If they
disagree, those files win.

## Folder

```
skills/<name>/
  SKILL.md                 # what the agent reads first
  references/<topic>.md    # long-form detail, loaded on demand
  evals/
    evals.json             # behaviour cases with assertions
    trigger-eval.json      # should-trigger / should-not-trigger prompts
    targets.json           # models the eval driver sweeps
    files/                 # fixtures, or a README for a live harness
```

- `<name>` is verb-noun, lowercase, with single hyphens: `scan-secrets`, `check-hmsl`.
  No `gitguardian-` or `ggshield-` prefix. The folder name equals `name:` in the frontmatter.
- Ask: would the name still be right if the underlying tool changed? If not, a tool name
  is in the wrong layer.
- Do not create a `kiro/` copy. `kiro/` is a legacy folder and is not edited.
- Do not create a `commands/` directory. Every skill is already `/gitguardian:<name>`.

## Frontmatter

```yaml
---
name: <name>
description: Use when <user condition>, when <file pattern>, when <error message>. Use when <explicit ask>.
license: MIT
compatibility: <what this skill needs, in one sentence, max 500 characters>
metadata:
  version: "<current plugin version>" # x-release-please-version
---
```

- `description` is a trigger statement, about 50 to 60 words, plain prose: no Markdown,
  no backticks, no bracketed prefixes. Agent-executable is the default, so do not mention
  execution. Only a skill with `command-handoff: "true"` states its execution contract.
- `compatibility` states what this skill needs: the minimum `ggshield` version, or the
  gg-mcp version and the token scopes, or a workspace feature. It must agree with the
  Prerequisites section. A generic "requires ggshield" is not enough.
- `metadata.version` is the current plugin version (read it from `package.json`), quoted,
  with the `# x-release-please-version` comment. Release Please moves it; never bump it
  by hand.
- `metadata.command-handoff: "true"` only when the agent must not run the tool itself
  because the output would bring sensitive content into the conversation (`check-hmsl`).
- No other top-level keys: `skills-ref validate` rejects them.
- No unquoted `: ` inside a value.

## Section order

```
## Overview
## When to Use
## Onboarding (first use)
    ### Prerequisites
    ### Setup
## Commands (or the skill-specific workflow)
## Best Practices
## Troubleshooting
```

Onboarding comes before Commands: no command works before the tool is installed and
authenticated. A skill may add a short "Start here" block of hard rules after Overview
(see `triage-incidents`).

## References

- Anything past about 150 lines, or heavily detailed, goes in `references/<topic>.md`.
  SKILL.md links to it with a bare relative path: `references/<topic>.md`.
- A skill is self-contained. It links only to files inside its own folder. No links to
  another skill, no `../../` paths, no bundle-root `references/`.
- Shared references are copied into each skill that needs them:
  `gitguardian-platform.md` (auth, scopes, instance URLs) for every skill,
  `ggshield-cli-setup.md` for CLI-backed skills, `hook-selection.md` for scanning and hook
  setup. Copy the current version from an existing skill without changes; all copies
  must have the same checksum:

  ```bash
  for f in skills/*/references/gitguardian-platform.md; do shasum "$f"; done
  ```

- Remediation guidance is per skill. Do not copy the `scan-secrets` doctrine. Write what
  fits this skill's detection context.

## Content rules

- No emojis.
- No zero-width, bidi or other invisible characters, and no long base64 runs:
  `node scripts/check-skill-markdown.mjs` fails on them.
- Write instructions in the imperative. A skill is read by a model, not a marketing
  audience.

## Registration

| File | What to add |
|---|---|
| `AGENTS.md` | A row in the Skills index table and in the Slash commands table |
| `README.md` | An entry in Skills and Commands and a line in the Project Structure block |
| `release-please-config.json` | `{ "type": "generic", "path": "skills/<name>/SKILL.md" }` in `extra-files` |
