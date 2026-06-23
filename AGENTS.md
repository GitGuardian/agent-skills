# Agent Instructions

This file is the contract for any AI agent or human contributor working **on** this repo. (The skills in `skills/` are the contract between agents and *users* of the skills — different audience.)

Read at the repo root as `AGENTS.md` (cross-vendor [agents.md](https://agents.md) convention) or as `CLAUDE.md` (symlink, for Claude Code's project-instruction lookup). One file, two entry points — editing either follows automatically.

Deep reference for specific tasks lives under `docs/maintainers/` and is loaded on demand — see [Maintainer references](#maintainer-references) at the bottom. Keep this file terse: it loads into every session.

## Project Overview

This repo ships skill files that teach AI coding agents how to use [`ggshield`](https://github.com/GitGuardian/ggshield), GitGuardian's open-source CLI. The agent invokes `ggshield` directly; the skill files supply the missing instructions on when, how, and what to do with the output.

Target agents: Claude Code directly via the plugin marketplace, Cursor via the `.cursor-plugin/` manifest, Codex via the `.codex-plugin/` manifest (and the repo-scoped `.agents/plugins/marketplace.json`), and ~50 other agents (Kiro CLI, Copilot, OpenCode, Cline, Windsurf, Gemini CLI, …) via the [skills.sh](https://skills.sh) CLI.

## Repository Structure

```
.claude-plugin/        # Claude Code plugin metadata (marketplace.json + plugin.json)
.cursor-plugin/        # Cursor plugin metadata (same two files)
.codex-plugin/         # Codex plugin metadata (plugin.json only)
.agents/plugins/       # Codex repo-scoped marketplace (marketplace.json)
.codex-mcp.json        # Codex MCP server config (Claude: .mcp.json, Cursor: mcp.json)
.github/workflows/     # CI: JSON + frontmatter validation, install-flow sanity, release automation
test/sanity.test.ts    # install-flow sanity tests (vitest)
package.json           # tooling-only (vitest); no runtime deps
release-please-*.{json} # Release Please config + released-version manifest
skills/<name>/         # one folder per skill (folder name = SKILL.md frontmatter `name:`)
  SKILL.md             #   what the agent reads first
  references/<topic>.md #  long-form, loaded on demand; shared refs duplicated per skill
  evals/               #   evals.json + targets.json + files/ fixtures (scan-secrets, check-hmsl)
docs/maintainers/      # task-gated reference for working ON this repo (see bottom of this file)
README.md              # user-facing: what / install / what-you-can-do
LICENSE                # MIT
```

The six skills are `scan-secrets`, `create-honeytokens`, `scan-machine`, `check-hmsl`, `install-hooks`, `triage-incidents`. Shared references (`ggshield-cli-setup.md`, `gitguardian-platform.md`) are duplicated into every skill that links to them — see [Skills are self-contained](#skills-are-self-contained--references-live-inside-each-skill).

## Skills index

| Skill | Description |
|---|---|
| [`scan-secrets`](skills/scan-secrets/SKILL.md) | Detect hardcoded secrets in files, git history, commits, Docker images, and PyPI packages. Auto-triggers when writing code that handles credentials. |
| [`create-honeytokens`](skills/create-honeytokens/SKILL.md) | Generate AWS decoy credentials (bare or wrapped in realistic code) and guide the user on where to plant them. Auto-triggers around `.env.example`, pre-publication open-source repos, internal wikis. |
| [`scan-machine`](skills/scan-machine/SKILL.md) | Scan the entire developer machine for credentials across local git repositories, dotfiles, cloud CLI configs, shell history, AI agent caches, and abandoned project trees. **Requires endpoint scanning to be enabled on the GitGuardian workspace** (gated server-side; not available on Free). |
| [`check-hmsl`](skills/check-hmsl/SKILL.md) | Check whether a *known* credential has been seen leaking publicly via the HasMySecretLeaked (HMSL) hash-lookup service. Inverse of `scan-secrets`: that finds unknown secrets in code, this checks known secrets against the HMSL public GitHub corpus. Can run anonymously with lower quota, or authenticated for higher quota. |
| [`install-hooks`](skills/install-hooks/SKILL.md) | Install `ggshield` as a git hook (pre-commit / pre-push) so secrets are blocked before they enter history, or as an AI-assistant hook (claude-code, codex, copilot, cursor, vscode) so an AI coding tool scans its prompts and actions for secrets in real time. The prevention counterpart to `scan-secrets`. Routes by family and asks which when the request is ambiguous. |
| [`triage-incidents`](skills/triage-incidents/SKILL.md) | Read, prioritize, and drive remediation on secret incidents already detected in the GitGuardian dashboard, via the GitGuardian Developer MCP server. Covers internal and Public Monitoring incidents, ranks them by validity/severity/blast radius/exposure, and closes the loop with confirmation-gated assign/tag/resolve writes. The one MCP-first skill in the bundle. |

## Slash commands

Every skill is invokable as a slash command — `/gitguardian:<skill-name>` (Claude Code) or the equivalent in Cursor. We do **not** ship a separate `commands/` directory; that's the legacy "flat .md as skill" pattern Anthropic now recommends against (see Critical structural rules in [`docs/maintainers/distribution.md`](docs/maintainers/distribution.md)).

| Slash invocation | Powered by |
|---|---|
| `/gitguardian:scan-secrets` | `skills/scan-secrets/SKILL.md` |
| `/gitguardian:create-honeytokens` | `skills/create-honeytokens/SKILL.md` |
| `/gitguardian:scan-machine` | `skills/scan-machine/SKILL.md` |
| `/gitguardian:check-hmsl` | `skills/check-hmsl/SKILL.md` |
| `/gitguardian:install-hooks` | `skills/install-hooks/SKILL.md` |
| `/gitguardian:triage-incidents` | `skills/triage-incidents/SKILL.md` |

The skill description (frontmatter) is what shows up in the slash-command autocomplete dropdown. Keep it action-verb-first ("Scan code for hardcoded secrets…", "Generate a GitGuardian honeytoken…") so it reads as a label, with the auto-trigger conditions following ("Auto-triggers when …") so model-driven invocation still works.

## Commit attribution

AI-authored commits **must** include the model byline:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
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

**Verb-noun, no product prefix.** `scan-secrets`, `create-honeytokens`, `check-hmsl`, `scan-machine`. The plugin name is already `gitguardian` — prefixing every skill with `gitguardian-` or `ggshield-` is redundant. Matches the convention used across mature multi-skill plugin repos.

### Long-form content goes under `references/`

Anything past ~150 lines, anything heavily detailed (alert response, planting strategy, full command variants with examples) lives in `skills/<name>/references/<topic>.md`. The SKILL.md stays terse and points at the reference. Lets the agent decide on demand what to load.

### Skills are self-contained — references live inside each skill

Every reference file lives inside its owning skill at `skills/<name>/references/<file>.md`. There is no bundle-root `references/` directory. SKILL.md files link to references as bare relative paths (`references/<file>.md`), which is the canonical pattern documented at https://code.claude.com/docs/en/skills#add-supporting-files and used by `supabase/agent-skills` and `getsentry/sentry-for-ai` — the two largest precedents.

This means truly-shared content (e.g., `ggshield-cli-setup.md` and `gitguardian-platform.md`) is **duplicated into every skill that links to it**. Yes, that means 4 copies. The DRY cost is real, and it's the price for two properties we need:

- **Every skill works in isolation.** A user who installs only `check-hmsl` via `npx skills add --skill check-hmsl` gets a complete skill folder with all its references resolved. Bundle-root references break this case.
- **Path resolution is platform-independent.** Codex, Claude Code, Cursor, and skills.sh all interpret `references/<file>.md` as relative to the SKILL.md location. Bundle-root `../../references/<file>.md` is non-standard and surfaced agent-side resolution bugs in practice (see commit history for the Codex-on-`/references/` failure).

**Edit discipline.** When you change a duplicated reference file in one skill, propagate the same change to every other skill that has a copy. A CI check that diffs the duplicated files would catch drift if/when this becomes a recurring problem. See [`docs/maintainers/contributing.md`](docs/maintainers/contributing.md) for the checksum check.

Skill-specific references (no duplication) — `scan-secrets/references/workflows.md`, `create-honeytokens/references/planting-strategy.md` — live alongside the shared ones in the same `references/` folder; only the *content* differs in whether it has copies elsewhere.

### The remediation doctrine

Remediation guidance is **per-skill, not shared**. Each skill that needs to tell the user what to do with a found credential gets its own remediation doctrine, tailored to that skill's detection context. There is no single cross-skill doctrine duplicated everywhere — that was tried and the fit was poor (an HMSL match is always public-facing; a honeytoken is never rotated; a machine-scan finding is always off-repo), so each skill's reality is different enough to warrant its own doctrine.

Current state:

- `scan-secrets/references/remediation-doctrine.md` is the **slim core** of the doctrine (four triage axes, four deliverable modes, implementation profiles, the §9.0 schema, the generic coordination framework, public-leak takedown, and per-mode validation) and acts as the router. The bulk is split into progressive-disclosure siblings, each one hop from `SKILL.md`: `remediation-lifecycle-tracks.md` (§5–8 lifecycle tracks), `remediation-cloud-keys.md` (§9.1/9.8/9.9), `remediation-saas-tokens.md` (§9.2/9.3/9.6/9.7/9.10), and `remediation-keys-and-dbs.md` (§9.4/9.5/9.11/9.12). §-numbering is preserved across the split so cross-references stay valid. The §9 worked examples cover credential archetypes (overlap support, revoke-vs-regenerate asymmetry, signing-secret invalidation, self-expiry), not every detector; new archetypes are cheap to add as a focused diff in one family file. `SKILL.md` routes into the core first, then the relevant track + credential-family file when findings are present; the sibling `interpreting-results.md` is a *separate* reference for reading ggshield output (JSON shape, validity, severity), the HMSL handoff, and `ggignore` false positives — it is not a remediation file. This doctrine is also the right basis for a future incident-management skill, which shares scan-secrets' full-lifecycle detection context.
- `check-hmsl` — keeps a short, self-contained remediation reminder inline (an HMSL match is always public-facing, so "it's burned, rotate it" is the whole story for now).
- `scan-machine` and `create-honeytokens` — retain their existing remediation prose for now; each will get its own tailored doctrine later.

Do **not** re-introduce a single shared doctrine duplicated across these skills to cover them — author per-skill doctrines instead.

When you add a remediation doctrine for another skill, author it for that skill's detection context rather than copying scan-secrets' wholesale.

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

**No markdown or bracketed prefixes in `description`.** No `*emphasis*`, `**bold**`, backticks, or `[USER-RUN ONLY …]` / `[AGENT-EXECUTABLE]` prefixes — they render as literal noise in catalog indices and machine-parsed dropdowns. Write plain prose.

**Do not mention execution in the description unless the skill is the command-handoff exception.** Agent-executable is the default, so stating it ("the agent runs X directly", "agent-executable") is noise — leave it out. Only a skill with `command-handoff: "true"` (below) states its execution contract in the description, and as a sentence ("User-run only — the agent prepares the commands, the user runs them…"), not a bracket. The machine-readable flag lives in `metadata`; the runtime enforcement lives in the body (the `check-hmsl` STOP block) — never collapse that human-readable contract out of a command-handoff skill's description.

### `metadata.command-handoff` and `metadata.version`

Every SKILL.md carries a `metadata` block (a string→string map per the [agent-skills spec](https://agentskills.io/specification)):

```yaml
metadata:
  version: "0.1.4" # x-release-please-version
```

- **`command-handoff`** — the **exception flag**, set to `"true"` only on a skill where the agent must *not* run the tool itself. Skills are agent-executable by default, so the default carries no flag. The exception exists when running the command would pull sensitive content into the agent's context — e.g. `check-hmsl`, where reading the credential file or echoing its contents into the thread defeats HMSL's local-hashing protocol. On those skills the agent's job is to *build the command and hand it to the user to run*, then interpret the sanitized output the user pastes back. Only `check-hmsl` carries it today:

  ```yaml
  metadata:
    command-handoff: "true"
    version: "0.1.4" # x-release-please-version
  ```

  It is a label for catalogs/validators/routers — it does **not** enforce anything; the body (STOP block) is the enforcement.
- **`version`** — mirrors the plugin/package version; **not** an independent per-skill semver. The line carries an `# x-release-please-version` annotation and is registered as a `generic` extra-file in `release-please-config.json`, so Release Please bumps it in lockstep with the manifests (see [`docs/maintainers/releasing.md`](docs/maintainers/releasing.md)). Quote it so YAML reads it as a string; never hand-edit it out of step.

### Verify before claiming

Before listing GitGuardian product capabilities, check `gitguardian.com` or product docs — do not rely on training data. Before listing `ggshield` CLI capabilities, run `ggshield --help` and `ggshield <subcommand> --help` against the installed version. The product surface and the CLI surface are not the same; GitGuardian has dashboard features (Public Monitoring, NHI Governance) that aren't exposed through `ggshield`, and `ggshield` does **not** ship IaC or SCA scanning despite adjacent vendors doing both.

### No `git push` without explicit consent

The maintainer reviews every push. Always commit, then ask before pushing. "Commit" does not imply "push"; previous consent for one push does not authorize the next. The same applies to deleting remote branches (e.g., during a rename), which is a destructive action — ask first.

### No emojis in skill / command content

Keep skill output platform-neutral. Emojis vary in support across the ~50 target agents.

## Maintainer references

Task-gated working knowledge lives under `docs/maintainers/`. Load the relevant file only when you're doing that task — none of it needs to be in always-on context.

| When you're… | Read |
|---|---|
| Adding a skill, a slash command, or editing a duplicated reference; planning router-pattern scaling | [`docs/maintainers/contributing.md`](docs/maintainers/contributing.md) |
| Running the skill-creator eval loop, authoring `evals.json`, or building secret-bearing fixtures | [`docs/maintainers/evals.md`](docs/maintainers/evals.md) |
| Cutting a release, bumping the version, or reasoning about SemVer policy | [`docs/maintainers/releasing.md`](docs/maintainers/releasing.md) |
| Touching manifests, validating the plugin, or publishing to Claude/Cursor/Codex marketplaces (includes the **Critical structural rules** and the manifest field reference) | [`docs/maintainers/distribution.md`](docs/maintainers/distribution.md) |

## Resources

- ggshield CLI: https://github.com/GitGuardian/ggshield
- GitGuardian Developer MCP server: https://github.com/GitGuardian/ggmcp
- GitGuardian public docs: https://docs.gitguardian.com (append `.md` to any HTML page to get the Markdown version; AI-agent index at https://docs.gitguardian.com/llms.txt)
- Claude Code plugin docs: https://code.claude.com/docs/en/plugins (full vendor docs index in [`docs/maintainers/distribution.md`](docs/maintainers/distribution.md))
- Codex plugin docs: https://developers.openai.com/codex/plugins
- Cursor plugin template: https://github.com/cursor/plugin-template
- Cursor plugin submission: https://cursor.com/marketplace/publish
- skills.sh CLI (cross-agent installer): https://skills.sh
