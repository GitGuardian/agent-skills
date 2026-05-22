# Agent Instructions

This file is the contract for any AI agent or human contributor working **on** this repo. (The skills in `skills/` are the contract between agents and *users* of the skills — different audience.)

Read at the repo root as `AGENTS.md` (cross-vendor [agents.md](https://agents.md) convention) or as `CLAUDE.md` (symlink, for Claude Code's project-instruction lookup). One file, two entry points — editing either follows automatically.

## Project Overview

This repo ships skill files that teach AI coding agents how to use [`ggshield`](https://github.com/GitGuardian/ggshield), GitGuardian's open-source CLI. The agent invokes `ggshield` directly; the skill files supply the missing instructions on when, how, and what to do with the output.

Target agents: Claude Code directly via the plugin marketplace, Cursor via the `.cursor-plugin/` manifest, and ~50 other agents (Kiro CLI, Codex, Copilot, OpenCode, Cline, Windsurf, Gemini CLI, …) via the [skills.sh](https://skills.sh) CLI.

## Repository Structure

```
.claude-plugin/                       # Claude Code plugin metadata (marketplace.json, plugin.json)
.cursor-plugin/                       # Cursor plugin metadata (same two files)
.github/workflows/                    # CI: JSON validation, frontmatter checks
skills/                               # one folder per skill — discovered by Claude/Cursor and skills.sh
  scan-secrets/                       #   skill folder name = SKILL.md frontmatter `name:`
    SKILL.md                          #   what the agent reads first
    references/                       #   long-form reference, loaded on demand
      workflows.md
      remediation.md
  create-honeytokens/
    SKILL.md
    references/
      planting-strategy.md
commands/                             # slash commands (Claude Code / Cursor)
  scan.md                             # /ggshield:scan
  honeytoken.md                       # /ggshield:honeytoken
references/                           # shared cross-skill reference
  gitguardian-platform.md             # public docs URL pattern, auth/scope recovery, instance URLs
README.md                             # user-facing: what / install / what-you-can-do
LICENSE                               # MIT
```

## Skills index

| Skill | Description |
|---|---|
| [`scan-secrets`](skills/scan-secrets/SKILL.md) | Detect hardcoded secrets in files, git history, commits, Docker images, and PyPI packages. Auto-triggers when writing code that handles credentials. |
| [`create-honeytokens`](skills/create-honeytokens/SKILL.md) | Generate AWS decoy credentials (bare or wrapped in realistic code) and guide the user on where to plant them. Auto-triggers around `.env.example`, pre-publication open-source repos, internal wikis. |

## Commands

| Command | Description |
|---|---|
| `/ggshield:scan` | Run a scan: working tree, full history, staged changes, or a specific path |
| `/ggshield:honeytoken` | Generate a honeytoken (bare or context-wrapped), with planting-surface confirmation |

## Commit attribution

AI-authored commits **must** include the model byline:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Replace with the actual model that authored the work. This is non-negotiable on this repo — the lineage matters for review and provenance.

## Key conventions

These are repo-wide rules. Not preferences, conventions — break them and a reviewer will push back.

### Skill folder naming

**Verb-noun, no product prefix.** `scan-secrets`, `create-honeytokens`, future `scan-machine`, `check-hmsl`. The plugin name is already `ggshield` — prefixing every skill with `ggshield-` is redundant. Matches the convention used across mature multi-skill plugin repos.

### Long-form content goes under `references/`

Anything past ~150 lines, anything heavily detailed (alert response, planting strategy, full command variants with examples) lives in `skills/<name>/references/<topic>.md`. The SKILL.md stays terse and points at the reference. Lets the agent decide on demand what to load.

### Cross-skill content goes in repo-root `references/`

Topics that apply to multiple skills — public docs URL pattern, auth/scope recovery, instance URLs, headless setup — live in `references/gitguardian-platform.md` at the repo root, not duplicated per skill. Each SKILL.md points at it with one line.

### SKILL.md section order

```
## Overview
## When to Use
## Onboarding (first use)            ← setup BEFORE commands, since commands are useless without it
    ### Prerequisites
    ### Setup
## Commands (or skill-specific reference)
## Best Practices
## Troubleshooting
```

Onboarding before Commands is deliberate: every command in the reference is useless until `ggshield` is installed and authenticated. A new user landing on the skill should hit the install path first.

### Frontmatter `description:` is a trigger statement, not a feature list

Claude Code and Cursor auto-trigger skills by matching this field against the user's prompt and the current file context. Write it as:

```
Use when <concrete user condition>, when <file pattern>, when <error message>. Use when <explicit ask>.
```

Keep it to ~50–60 words. Drop redundant credential-type enumerations and troubleshooting-detail hooks that belong in the Troubleshooting section.

### `Co-Authored-By:` on AI commits (repeated for emphasis)

See above.

### Verify before claiming

Before listing GitGuardian product capabilities, check `gitguardian.com` or product docs — do not rely on training data. Before listing `ggshield` CLI capabilities, run `ggshield --help` and `ggshield <subcommand> --help` against the installed version. The product surface and the CLI surface are not the same; GitGuardian has dashboard features (Public Monitoring, NHI Governance) that aren't exposed through `ggshield`, and `ggshield` does **not** ship IaC or SCA scanning despite adjacent vendors doing both.

### No `git push` without explicit consent

The maintainer reviews every push. Always commit, then ask before pushing. "Commit" does not imply "push"; previous consent for one push does not authorize the next. The same applies to deleting remote branches (e.g., during a rename), which is a destructive action — ask first.

### No emojis in skill / command content

Keep skill output platform-neutral. Emojis vary in support across the ~50 target agents.

## Adding a new skill

1. **Confirm the capability exists in `ggshield`.** Run `ggshield --help` and the relevant subcommand `--help`. If it's not in the CLI, this repo is not the right place — this repo wraps the CLI, not the dashboard.
2. **Pick a verb-noun name.** `scan-machine`, `check-hmsl`, `install-hooks`, etc. No `ggshield-` prefix.
3. **Create `skills/<name>/SKILL.md`** with frontmatter:
   ```yaml
   ---
   name: <name>
   description: Use when <concrete triggers>. Keep to ~50–60 words.
   ---
   ```
4. **Follow the SKILL.md section order** (Overview → When to Use → Onboarding → Commands → Best Practices → Troubleshooting).
5. **Move long-form into `skills/<name>/references/<topic>.md`** if any section exceeds ~150 lines.
6. **Point at `/references/gitguardian-platform.md`** for auth/scope recovery and instance URLs — don't re-document them.
7. **Update this `AGENTS.md`** (Skills index table) and the `README.md` (What the skills do section + Repository layout block).
8. **Validate locally:**
   ```bash
   for f in $(find . -name '*.json' -not -path './.git/*'); do jq empty "$f"; done
   for f in skills/*/SKILL.md; do head -1 "$f" | grep -q '^---$' && grep -q '^name:' "$f" && grep -q '^description:' "$f"; done
   ggshield secret scan path -r -y . --json
   ```

## Adding a slash command

1. Create `commands/<verb>.md` with frontmatter `description:` and `argument-hint:` fields.
2. Reference the relevant skill in the body — "Use the `<skill-name>` skill for full command reference, output interpretation, and remediation guidance."
3. Update `README.md` slash-command bullet list.

## Adding to the shared `references/gitguardian-platform.md`

Add a top-level section if the content applies to **two or more** skills. Skill-specific content stays in `skills/<name>/references/`.

## Future scaling

When the skill library crosses ~5 skills:

- **Adopt a router-pattern + `SKILL_TREE.md` at repo root.** Three router skills always visible in agent metadata; everything else hidden via a `disable-model-invocation: true` frontmatter flag and loaded on demand when a router points to it. Keeps startup metadata at a few hundred tokens instead of growing linearly with the catalog.
- **Add a CI validation step** that regenerates `SKILL_TREE.md` from frontmatter and validates cross-references between skills, the README layout block, and per-skill `references/` pointers.

## Resources

- ggshield CLI: https://github.com/GitGuardian/ggshield
- GitGuardian public docs: https://docs.gitguardian.com (append `.md` to any HTML page to get the Markdown version; AI-agent index at https://docs.gitguardian.com/llms.txt)
- Claude Code plugin marketplaces: https://code.claude.com/docs/en/plugin-marketplaces
- Cursor plugin submission: https://cursor.com/marketplace/publish
- skills.sh CLI: https://skills.sh
