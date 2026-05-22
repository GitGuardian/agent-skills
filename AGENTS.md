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

## Plugin distribution & validation

This repo ships a plugin to two different ecosystems (Claude Code + Cursor) that share most of the structure but have different distribution models and submission gates. The following is the working knowledge needed to build, validate, and publish.

### Local validation

Anthropic ships a built-in validator. Run before opening any plugin-related PR:

```bash
claude plugin validate .
```

It checks the marketplace manifest schema. The same check runs on every community-marketplace submission. **Our CI runs it on every PR** (see `.github/workflows/validate.yml`).

Cursor's equivalent is a Node script from their template repo:

```bash
# from a clone of cursor/plugin-template
node scripts/validate-template.mjs
```

We don't currently run Cursor's validator in CI; the manual jq checks in `validate.yml` cover most of the same shape, and Cursor's submission review will catch the rest.

### Local development without installing

```bash
claude --plugin-dir .                       # load this repo as a plugin in the current session
claude --plugin-dir ./packaged-plugin.zip   # also accepts .zip archives (Claude Code v2.1.128+)
claude --plugin-url https://.../plugin.zip  # fetch a remote .zip (e.g., CI artifact) per-session
```

Reload changes mid-session: `/reload-plugins`. Loaded `--plugin-dir` plugins shadow any installed version with the same name for that session.

### Claude Code: three marketplace tiers

| Tier | Visibility | Submission path |
|---|---|---|
| **Decentralized** | Users run `/plugin marketplace add GitGuardian/agent-skills`, no central listing | None — the repo + `marketplace.json` is the entire distribution mechanism |
| **Community** (`anthropics/claude-plugins-community`) | Browsable at claude.ai/plugins; installable as `<plugin>@claude-community` | Submit at **https://claude.ai/settings/plugins/submit** or **https://platform.claude.com/plugins/submit** — automated safety screening + review, then pinned to a commit SHA in the catalog. CI auto-bumps the pin as you push |
| **Official** (`anthropics/claude-plugins-official`) | Auto-available in every Claude Code install | Anthropic curates at their discretion. **No public application form.** If your plugin lands here, your CLI can prompt users to install it (see "CLI hints" below) |

We currently rely on the **decentralized** tier — works today via `/plugin marketplace add GitGuardian/agent-skills` with zero gatekeeping. Submitting to community is optional and increases discoverability.

**Reserved marketplace names** (the `name:` field in `marketplace.json`): `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`. We use `gitguardian-agent-skills` — safe. Push back on any rename proposal that drops the prefix.

### Cursor marketplace

Single centralized marketplace at https://cursor.com/marketplace. Submission via **https://cursor.com/marketplace/publish** with manual review by the Cursor team. **Must be open source.** Reference template: https://github.com/cursor/plugin-template.

The Cursor template defaults to a multi-plugin layout (`plugins/<name>/...`) and tells single-plugin authors to drop `marketplace.json` and put `plugin.json` at the repo root. **We can't follow that advice** — Claude Code's distribution model requires `marketplace.json` even for single-plugin repos. So we land in a documented hybrid: single-plugin shape with `marketplace.json` on both sides, plugin `source` pointing at `"./"`. Cursor reviewers will see a marketplace.json containing one plugin entry pointing at the repo root — not forbidden, just off the template default.

### Manifest field reference

Both `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` carry the same field set (we keep them symmetric so they can't drift):

| Field | Required by | Notes |
|---|---|---|
| `name` | both | kebab-case, becomes the namespace for slash commands (`/<name>:<command>`) |
| `displayName` | Cursor checklist | Marketplace card title — falls back to `name` if omitted |
| `version` | both (recommended) | Bump on release; if omitted on Claude Code with git source, every commit counts as a new version |
| `description` | both | Marketplace card description |
| `author.{name, email, url}` | both | Use `support@gitguardian.com` for email — matches the address ggmcp's pyproject.toml uses |
| `license` | Cursor checklist | SPDX identifier (we use `MIT`) |
| `keywords` | Cursor checklist | Drive marketplace search; keep to ~7 sharp tokens (the Kiro feedback fix landed on this number) |
| `logo` | Cursor checklist | Relative path to PNG/SVG (we use `assets/logo.png` — the official GG icon mark) |

Both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json` need:

- Required: `name`, `owner.{name, email}`, `plugins[]` with `name + source + description`
- Cursor-specific: `metadata.{description, version}` — Cursor template puts these under a metadata key (we keep top-level `description` too so Claude's schema still parses)

### Plugin surfaces we ship + ones we deliberately don't

| Surface | Where it lives | We ship? | What it does |
|---|---|---|---|
| `skills/<name>/SKILL.md` | plugin root | ✅ | Model-invoked skills (Claude triggers on description match) |
| `commands/*.md` | plugin root | ✅ | Slash commands (`/ggshield:scan`, `/ggshield:honeytoken`) |
| `.mcp.json` (Claude) + `mcp.json` (Cursor) | plugin root | ✅ (PR #11) | Auto-configure the GitGuardian Developer MCP server on install |
| `assets/logo.png` | plugin root | ✅ (PR #12) | Marketplace card icon |
| `rules/*.mdc` | plugin root | ❌ | Cursor's always-on coding rules (different concept from skills — rules apply even when no skill triggers). Worth adding if we want a Cursor-side always-on "never commit a detected secret" rule beyond what's already in each SKILL.md's Core rule. |
| `agents/*.md` | plugin root | ❌ | Specialized subagents. No strong use case yet. |
| `hooks/hooks.json` | plugin root | ❌ | Cursor agent hooks (`afterFileEdit`, `beforeShellExecution`, `sessionEnd`). We currently tell users to run `ggshield install -t cursor` externally; a bundled hooks.json would make defense-in-depth zero-config. |
| `monitors/monitors.json` | plugin root | ❌ | Claude Code background watchers (e.g., `tail -F logs/error.log`); each stdout line becomes a notification to the agent. |
| `bin/` | plugin root | ❌ | Executables added to the Bash tool's PATH while the plugin is enabled. |
| `.lsp.json` | plugin root | ❌ | Language Server Protocol configs for code intelligence. |
| `settings.json` | plugin root | ❌ | Default settings applied when plugin is enabled (currently only `agent` and `subagentStatusLine` keys are honored). |

### Critical structural rules

- **Only `plugin.json` goes inside `.claude-plugin/` / `.cursor-plugin/`.** Every other directory (`skills/`, `commands/`, `agents/`, `hooks/`, `mcp.json`, `assets/`) must be at the plugin root, NOT nested inside the manifest folder. Cursor's `add-a-plugin.md` and Anthropic's `plugins.md` both call this out as a common mistake.
- **`commands/` is documented as legacy framing in Claude docs** — they recommend `skills/<name>/SKILL.md` for new content. Our `commands/*.md` are slash commands (a different concept from skills); those are still appropriate.
- **`disable-model-invocation: true`** in a SKILL.md's YAML frontmatter is the canonical Claude Code field for hiding a skill from the initial agent metadata. Used by the router pattern (see Future scaling below). Documented in the Claude Code Quickstart — not vendor-specific.
- **Filename matters for MCP config**: Cursor specifically looks for `mcp.json` (not `.mcp.json`). Both files contain the same content; we ship both so each agent finds its expected filename.
- **Symlink `CLAUDE.md` → `AGENTS.md`** at the repo root. AGENTS.md is the cross-vendor name (agents.md spec); CLAUDE.md is what Claude Code reads for project instructions. One file, two entry points — recent Claude Code versions also fall back to AGENTS.md natively but the symlink makes the intent explicit and supports older versions.

### CLI hints (future-only — official marketplace required)

If we land in `claude-plugins-official`, ggshield itself can prompt Claude Code users to install us. When `CLAUDECODE=1` is set, the CLI emits a self-closing XML tag to stderr:

```
<claude-code-hint v="1" type="plugin" value="ggshield@claude-plugins-official" />
```

Claude Code scans output, strips the hint line before passing to the model, validates it targets an official-marketplace plugin, then shows an install prompt (dismisses as "No" after 30s, prompted once per session). That's a ggshield-repo change, not this repo's.

Reference: https://code.claude.com/docs/en/plugin-hints

### Anthropic docs index (the ones we actually use)

- https://code.claude.com/docs/en/plugins — primary authoring guide (Quickstart, directory layout, migration from `.claude/`, submission process)
- https://code.claude.com/docs/en/plugins-reference — full technical schema for `plugin.json`, version management, debugging tools
- https://code.claude.com/docs/en/plugin-marketplaces — `marketplace.json` schema, plugin source types (github, git URL, git-subdir, npm, relative path), hosting options
- https://code.claude.com/docs/en/discover-plugins — user-facing install flows, `extraKnownMarketplaces`, security
- https://code.claude.com/docs/en/plugin-hints — CLI-emitted install prompts (above)
- https://code.claude.com/docs/en/plugin-dependencies — declaring version constraints between plugins
- https://code.claude.com/docs/en/agent-sdk/plugins — loading plugins via the Agent SDK
- https://docs.gitguardian.com/llms.txt — GitGuardian's AI-agent docs index (append `.md` to any HTML page on docs.gitguardian.com to get Markdown)
- https://agentskills.io — the cross-vendor Agent Skills standard (also lives at `anthropics/skills/spec/agent-skills-spec.md`)
- https://github.com/cursor/plugin-template — Cursor's reference plugin layout + submission checklist

## Future scaling

When the skill library crosses ~5 skills:

- **Adopt a router-pattern + `SKILL_TREE.md` at repo root.** Three router skills always visible in agent metadata; everything else hidden via a `disable-model-invocation: true` frontmatter flag and loaded on demand when a router points to it. Keeps startup metadata at a few hundred tokens instead of growing linearly with the catalog.
- **Add a CI validation step** that regenerates `SKILL_TREE.md` from frontmatter and validates cross-references between skills, the README layout block, and per-skill `references/` pointers.

## Resources

- ggshield CLI: https://github.com/GitGuardian/ggshield
- GitGuardian Developer MCP server: https://github.com/GitGuardian/ggmcp
- GitGuardian public docs: https://docs.gitguardian.com (append `.md` to any HTML page to get the Markdown version; AI-agent index at https://docs.gitguardian.com/llms.txt)
- Claude Code plugin docs: https://code.claude.com/docs/en/plugins (see "Anthropic docs index" above for the full set)
- Cursor plugin template: https://github.com/cursor/plugin-template
- Cursor plugin submission: https://cursor.com/marketplace/publish
- skills.sh CLI (cross-agent installer): https://skills.sh
