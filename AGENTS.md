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

## Slash commands

Every skill is invokable as a slash command — `/gitguardian:<skill-name>` (Claude Code) or the equivalent in Cursor. We do **not** ship a separate `commands/` directory; that's the legacy "flat .md as skill" pattern Anthropic now recommends against (see [Critical structural rules](#critical-structural-rules) below).

| Slash invocation | Powered by |
|---|---|
| `/gitguardian:scan-secrets` | `skills/scan-secrets/SKILL.md` |
| `/gitguardian:create-honeytokens` | `skills/create-honeytokens/SKILL.md` |

The skill description (frontmatter) is what shows up in the slash-command autocomplete dropdown. Keep it action-verb-first ("Scan code for hardcoded secrets…", "Generate a GitGuardian honeytoken…") so it reads as a label, with the auto-trigger conditions following ("Auto-triggers when …") so model-driven invocation still works.

## Commit attribution

AI-authored commits **must** include the model byline:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Replace with the actual model that authored the work. This is non-negotiable on this repo — the lineage matters for review and provenance.

## Key conventions

These are repo-wide rules. Not preferences, conventions — break them and a reviewer will push back.

### Naming layers (brand vs capability vs tool)

The repo's user-facing surface has three distinct layers, and the right name lives at the right layer:

| Layer | What it names | Tool-agnostic? | Examples |
|---|---|---|---|
| **Brand / plugin** | The thing users install | yes — it's a namespace, not a feature | `gitguardian` (plugin), `GitGuardian` (displayName), `gitguardian-agent-skills` (marketplace) |
| **Capability / skill** | What the agent learns to do | yes — verb-noun describing the action | `scan-secrets`, `create-honeytokens`, future `triage-incidents` |
| **Tool / implementation** | What actually does the work | no — real product name | `ggshield` CLI, `ggmcp` (Developer MCP server), GitGuardian public API |

Layer 3 is plumbing. It appears in each skill's `## Overview`, `## Commands`, and `## Troubleshooting` sections — because users need to know which tool runs and how to install it — but **never** in a skill folder name, command name, or plugin namespace.

Concretely:

- Skill folder is `scan-secrets/`, not `ggshield-scan-secrets/`. If we add API-backed scanning later, the same skill teaches both paths.
- Slash command is `/gitguardian:scan-secrets`, not `/ggshield:scan-secrets`. The plugin namespace is the brand; the suffix after `:` is the skill name (which is the action); nothing in between says which tool runs it.
- The plugin description is broad ("via ggshield, the Developer MCP server, and the GitGuardian API") so it doesn't lock us into one tool.
- The `ggshield` keyword stays in `plugin.json` so users searching the marketplace for "ggshield" still find this plugin — discovery is a separate concern from naming.

When in doubt, ask: *would this name still be right if we swapped the underlying tool?* If no, the tool name is in the wrong layer.

### Skill folder naming

**Verb-noun, no product prefix.** `scan-secrets`, `create-honeytokens`, future `scan-machine`, `check-hmsl`. The plugin name is already `gitguardian` — prefixing every skill with `gitguardian-` or `ggshield-` is redundant. Matches the convention used across mature multi-skill plugin repos.

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

Every skill is automatically invokable as `/gitguardian:<skill-name>` — that's the slash command. **Do not** create a `commands/` directory or flat `commands/*.md` files; Anthropic now frames those as the legacy "skills as flat Markdown files" pattern and recommends `skills/<name>/SKILL.md` for all new work (see [Critical structural rules](#critical-structural-rules)).

To add a new slash invocation:
1. Add the skill (see [Adding a new skill](#adding-a-new-skill) above).
2. Phrase the skill's frontmatter `description:` so it reads cleanly as a slash-dropdown label — lead with the action verb, then list the auto-trigger conditions. The same string serves both audiences: humans browsing the dropdown and the model deciding when to auto-invoke.
3. Update the [Slash commands table](#slash-commands) above and the README's slash-command bullets to reference the new invocation.

## Adding to the shared `references/gitguardian-platform.md`

Add a top-level section if the content applies to **two or more** skills. Skill-specific content stays in `skills/<name>/references/`.

## Versioning

We follow [Semantic Versioning](https://semver.org). The plugin is **pre-1.0** and stays pre-1.0 until the public surface is stable enough that a breaking change truly warrants a major bump.

### Source of truth

The plugin version lives in **four files** that must move together:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`
- `.cursor-plugin/plugin.json` → `version`
- `.cursor-plugin/marketplace.json` → `metadata.version`

Plus a matching Git tag (`v<major>.<minor>.<patch>`) and a GitHub Release. Tag format mirrors what [`ggmcp`](https://github.com/GitGuardian/ggmcp) uses (`tag_format = "v$version"` in its `pyproject.toml`), so the wider GitGuardian release surface stays consistent.

### When to bump

| Bump | Trigger |
|---|---|
| **patch** (`0.1.0 → 0.1.1`) | Doc fixes, typo corrections, internal cleanup, dependency bumps, README rewrites, CI tweaks — anything with no user-visible behavior change. |
| **minor** (`0.1.0 → 0.2.0`) | A new skill, a new slash command, a new MCP tool surfaced, a new manifest field that adds a capability. **While pre-1.0, also covers breaking changes** — renames, restructures, removed surfaces. Example: the `ggshield`-plugin → `gitguardian`-plugin rename was minor-bump material, not a major. |
| **major** (`0.x → 1.0.0`, then `1.x → 2.0.0`, …) | Reserved. The first `1.0.0` lands once: Cursor marketplace listing is approved and live, the GitGuardian public API integration ships, and we have enough usage data to be confident the public surface is stable. After 1.0, every breaking change becomes a major bump. |

The "while pre-1.0, breaking changes are minor" rule is explicit because SemVer leaves it ambiguous and reviewers will otherwise argue about it on each rename PR.

### Release flow (current)

For each release:

1. Bump `version` in all four manifest files in a single commit. Use `0.x.0` for minor, `0.0.x` for patch (until `1.0.0`).
2. Run `claude plugin validate .` — must still pass.
3. Open the PR, get it merged via the normal review flow.
4. On `main`, create an annotated tag with release notes inline:
   ```bash
   git tag -a v0.X.0 -m "v0.X.0 — <one-line summary>

   <bullet points of what changed>"
   git push origin v0.X.0
   ```
5. Publish a GitHub Release linked to the tag:
   ```bash
   gh release create v0.X.0 --title "v0.X.0 — <summary>" --notes-file release-notes.md
   ```
   Or use `--generate-notes` to seed from merged PRs and edit before publishing.

Once we accumulate enough monthly cadence, the bump-and-tag steps can be automated via [Release Please](https://github.com/googleapis/release-please) (the pattern Supabase uses on `supabase/agent-skills`) — it reads Conventional Commits, opens a release PR with the version bump, and tags on merge. Not worth the setup cost yet at our cadence.

### What does NOT need a version bump

- New PR description rewrites
- AGENTS.md additions that don't change the user-facing plugin surface
- Comments, internal renames within a SKILL.md body
- Anything that wouldn't show up as a behavior change for someone running the installed plugin

If unsure, the test: *would a user who already installed the plugin notice this change after running `/plugin marketplace update`?* If no, it's a patch (or doesn't need its own release).

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
| `skills/<name>/SKILL.md` | plugin root | ✅ | Model-invoked skills (Claude auto-triggers on description match). Each skill is also manually invokable as `/gitguardian:<skill-name>`. |
| `commands/*.md` | plugin root | ❌ | Anthropic's legacy "skills as flat Markdown files" pattern. We deliberately don't ship a `commands/` directory — see [Critical structural rules](#critical-structural-rules). |
| `.mcp.json` (Claude) + `mcp.json` (Cursor) | plugin root | ✅ | Auto-configure the GitGuardian Developer MCP server on install |
| `assets/logo.png` | plugin root | ✅ (PR #12) | Marketplace card icon |
| `rules/*.mdc` | plugin root | ❌ | Cursor's always-on coding rules (different concept from skills — rules apply even when no skill triggers). Worth adding if we want a Cursor-side always-on "never commit a detected secret" rule beyond what's already in each SKILL.md's Core rule. |
| `agents/*.md` | plugin root | ❌ | Specialized subagents. No strong use case yet. |
| `hooks/hooks.json` | plugin root | ❌ | Cursor agent hooks (`afterFileEdit`, `beforeShellExecution`, `sessionEnd`). We currently tell users to run `ggshield install -t cursor` externally; a bundled hooks.json would make defense-in-depth zero-config. |
| `monitors/monitors.json` | plugin root | ❌ | Claude Code background watchers (e.g., `tail -F logs/error.log`); each stdout line becomes a notification to the agent. |
| `bin/` | plugin root | ❌ | Executables added to the Bash tool's PATH while the plugin is enabled. |
| `.lsp.json` | plugin root | ❌ | Language Server Protocol configs for code intelligence. |
| `settings.json` | plugin root | ❌ | Default settings applied when plugin is enabled (currently only `agent` and `subagentStatusLine` keys are honored). |

### Critical structural rules

- **Only `plugin.json` goes inside `.claude-plugin/` / `.cursor-plugin/`.** Every other directory (`skills/`, `agents/`, `hooks/`, `assets/`) must be at the plugin root, NOT nested inside the manifest folder. Cursor's `add-a-plugin.md` and Anthropic's `plugins.md` both call this out as a common mistake.
- **No `commands/` directory.** Anthropic's plugin docs frame `commands/*.md` as "skills as flat Markdown files" and explicitly recommend `skills/<name>/SKILL.md` for new content. Shipping both at once creates duplicate slash-dropdown entries for the same capability (the flat command and the skill both show up). The skill primitive is strictly more capable (supports `references/`, `disable-model-invocation`, `allowed-tools`, folder structure). We migrated away from `commands/` in `refactor/remove-legacy-commands-directory` — don't re-introduce it.
- **`disable-model-invocation: true`** in a SKILL.md's YAML frontmatter is the canonical Claude Code field for hiding a skill from the initial agent metadata. Used by the router pattern (see Future scaling below). Documented in the Claude Code Quickstart — not vendor-specific.
- **Filename matters for MCP config**: Cursor specifically looks for `mcp.json` (not `.mcp.json`). Both files contain the same content; we ship both so each agent finds its expected filename.
- **Symlink `CLAUDE.md` → `AGENTS.md`** at the repo root. AGENTS.md is the cross-vendor name (agents.md spec); CLAUDE.md is what Claude Code reads for project instructions. One file, two entry points — recent Claude Code versions also fall back to AGENTS.md natively but the symlink makes the intent explicit and supports older versions.

### CLI hints (future-only — official marketplace required)

If the plugin lands in `claude-plugins-official`, the ggshield CLI itself can prompt Claude Code users to install us. When `CLAUDECODE=1` is set, the CLI emits a self-closing XML tag to stderr:

```
<claude-code-hint v="1" type="plugin" value="gitguardian@claude-plugins-official" />
```

Claude Code scans output, strips the hint line before passing to the model, validates it targets an official-marketplace plugin, then shows an install prompt (dismisses as "No" after 30s, prompted once per session). That's a change in the ggshield CLI repo, not this one. Same idea applies to future GitGuardian CLIs.

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
