# Plugin distribution & validation

This repo ships a plugin to two different ecosystems (Claude Code + Cursor) that share most of the structure but have different distribution models and submission gates. The following is the working knowledge needed to build, validate, and publish.

## Local validation

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

The canonical **cross-vendor** validator for the agent-skills spec is `skills-ref` from [agentskills/agentskills](https://github.com/agentskills/agentskills/tree/main/skills-ref). It is the spec author's reference implementation — it validates every constraint defined at https://agentskills.io/specification (strict YAML, name = parent dir, name format rules, description length, etc.). Install once, then run against any skill:

```bash
pip install "skills-ref @ git+https://github.com/agentskills/agentskills.git#subdirectory=skills-ref"
for d in skills/*/; do skills-ref validate "$d"; done
```

Our CI runs this on every PR (see the `Validate every skill against the agent-skills spec` step in `validate.yml`). The strict-YAML check there catches things the shell-level `grep ^name:` checks miss — e.g., an unquoted colon in a description field, uppercase letters in `name:`, consecutive hyphens, or a name that doesn't match the parent directory.

## Install-flow sanity tests

`test/sanity.test.ts` runs `npx skills add` against this repo into a temp directory and asserts every skill installs, has a `SKILL.md`, and the `--skill <name>` filter works. This is the behavioral half of validation — it catches manifest-vs-disk drift (a skill folder renamed without updating something, a `SKILL.md` deleted, a malformed frontmatter that schema checks let through). Schema checks alone don't catch these.

```bash
npm install                # one-time
npm run test:sanity        # ~2 seconds — runs vitest against test/sanity.test.ts
```

CI runs the same suite on every PR (`.github/workflows/sanity.yml`). It needs no GitGuardian account, no network beyond the npm registry, and no auth — just `npx --yes skills add` against a local path.

The test auto-discovers skills (no hard-coded skill list), so it stays correct as we add new skills without per-skill maintenance.

## Local development without installing

```bash
claude --plugin-dir .                       # load this repo as a plugin in the current session
claude --plugin-dir ./packaged-plugin.zip   # also accepts .zip archives (Claude Code v2.1.128+)
claude --plugin-url https://.../plugin.zip  # fetch a remote .zip (e.g., CI artifact) per-session
```

Reload changes mid-session: `/reload-plugins`. Loaded `--plugin-dir` plugins shadow any installed version with the same name for that session.

## Claude Code: three marketplace tiers

| Tier | Visibility | Submission path |
|---|---|---|
| **Decentralized** | Users run `/plugin marketplace add GitGuardian/agent-skills`, no central listing | None — the repo + `marketplace.json` is the entire distribution mechanism |
| **Community** (`anthropics/claude-plugins-community`) | Browsable at claude.ai/plugins; installable as `<plugin>@claude-community` | Submit at **https://claude.ai/settings/plugins/submit** or **https://platform.claude.com/plugins/submit** — automated safety screening + review, then pinned to a commit SHA in the catalog. CI auto-bumps the pin as you push |
| **Official** (`anthropics/claude-plugins-official`) | Auto-available in every Claude Code install | Anthropic curates at their discretion. **No public application form.** If your plugin lands here, your CLI can prompt users to install it (see "CLI hints" below) |

We currently rely on the **decentralized** tier — works today via `/plugin marketplace add GitGuardian/agent-skills` with zero gatekeeping. Submitting to community is optional and increases discoverability.

**Reserved marketplace names** (the `name:` field in `marketplace.json`): `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`. We use `gitguardian-agent-skills` — safe. Push back on any rename proposal that drops the prefix.

## Cursor marketplace

Single centralized marketplace at https://cursor.com/marketplace. Submission via **https://cursor.com/marketplace/publish** with manual review by the Cursor team. **Must be open source.** Reference template: https://github.com/cursor/plugin-template.

The Cursor template defaults to a multi-plugin layout (`plugins/<name>/...`) and tells single-plugin authors to drop `marketplace.json` and put `plugin.json` at the repo root. **We can't follow that advice** — Claude Code's distribution model requires `marketplace.json` even for single-plugin repos. So we land in a documented hybrid: single-plugin shape with `marketplace.json` on both sides, plugin `source` pointing at `"./"`. Cursor reviewers will see a marketplace.json containing one plugin entry pointing at the repo root — not forbidden, just off the template default.

## Codex marketplace

Codex (OpenAI's CLI) introduced a first-class plugin marketplace in CLI v0.117.0 (March 2026). Plugin manifest lives in `.codex-plugin/plugin.json`; the marketplace pointer lives separately at `.agents/plugins/marketplace.json` (repo-scoped) — note the marketplace location is **outside** the manifest folder, different from Claude/Cursor where they sit side by side.

Users install with the same shorthand pattern as Claude Code:

```
codex plugin marketplace add GitGuardian/agent-skills
codex
/plugins
```

In the plugin browser, select the GitGuardian marketplace, open `gitguardian`, and choose **Install plugin**.

Codex also supports a legacy fallback path: if `.agents/plugins/marketplace.json` is missing, the CLI reads `.claude-plugin/marketplace.json` instead. We ship the native location anyway for cleaner Codex semantics.

Distinctive fields in `.codex-plugin/plugin.json`:

- `skills` (string) — path to skills dir, we use `"./skills/"`
- `mcpServers` (string) — path to the Codex MCP config, we use `"./.codex-mcp.json"`
- `interface` (object) — install-surface metadata: `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `websiteURL`, `logo`, etc. Codex's marketplace UI consumes these.

In `.agents/plugins/marketplace.json`, each plugin entry takes:

- `source` (object) — we use `{"source": "url", "url": "https://github.com/GitGuardian/agent-skills.git"}` because Codex currently rejects local marketplace entries whose `source.path` resolves to the marketplace root; use `local` only for plugin subdirectories such as `./plugins/my-plugin`
- `policy` (object) — `installation` (`AVAILABLE` | `INSTALLED_BY_DEFAULT` | `NOT_AVAILABLE`), `authentication` (`ON_INSTALL` | `ON_USE`)
- `category` (string) — we use `"security"`

Reference docs: https://developers.openai.com/codex/plugins, https://developers.openai.com/codex/plugins/build, https://developers.openai.com/codex/skills.

## Manifest field reference

`.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` carry the same field set (we keep them symmetric so they can't drift). `.codex-plugin/plugin.json` adds Codex-specific fields (`skills`, `mcpServers`, `interface`) on top of the shared base.

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

`.agents/plugins/marketplace.json` (Codex) has its own shape:

- Required at top level: `name`, `plugins[]`
- Optional: `interface.{displayName}`
- Each plugin entry requires: `name`, `source` (object — see Codex marketplace section above), `policy.installation`, `policy.authentication`, `category`

## Plugin surfaces we ship + ones we deliberately don't

| Surface | Where it lives | We ship? | What it does |
|---|---|---|---|
| `skills/<name>/SKILL.md` | plugin root | ✅ | Model-invoked skills (Claude auto-triggers on description match). Each skill is also manually invokable as `/gitguardian:<skill-name>`. |
| `commands/*.md` | plugin root | ❌ | Anthropic's legacy "skills as flat Markdown files" pattern. We deliberately don't ship a `commands/` directory — see [Critical structural rules](#critical-structural-rules). |
| `.codex-mcp.json` (Codex) + `.mcp.json` (Claude) + `mcp.json` (Cursor) | plugin root | ✅ | Auto-configure the GitGuardian Developer MCP server on install |
| `assets/logo.png` | plugin root | ✅ (PR #12) | Marketplace card icon |
| `rules/*.mdc` | plugin root | ❌ | Cursor's always-on coding rules (different concept from skills — rules apply even when no skill triggers). Worth adding if we want a Cursor-side always-on "never commit a detected secret" rule beyond what's already in each SKILL.md's Core rule. |
| `agents/*.md` | plugin root | ❌ | Specialized subagents. No strong use case yet. |
| `hooks/hooks.json` | plugin root | ❌ | Cursor agent hooks (`afterFileEdit`, `beforeShellExecution`, `sessionEnd`). We currently tell users to run `ggshield install -t cursor` externally; a bundled hooks.json would make defense-in-depth zero-config. |
| `monitors/monitors.json` | plugin root | ❌ | Claude Code background watchers (e.g., `tail -F logs/error.log`); each stdout line becomes a notification to the agent. |
| `bin/` | plugin root | ❌ | Executables added to the Bash tool's PATH while the plugin is enabled. |
| `.lsp.json` | plugin root | ❌ | Language Server Protocol configs for code intelligence. |
| `settings.json` | plugin root | ❌ | Default settings applied when plugin is enabled (currently only `agent` and `subagentStatusLine` keys are honored). |

## Critical structural rules

- **Only `plugin.json` goes inside `.claude-plugin/` / `.cursor-plugin/` / `.codex-plugin/`.** Every other directory (`skills/`, `agents/`, `hooks/`, `assets/`) must be at the plugin root, NOT nested inside the manifest folder. Cursor's `add-a-plugin.md`, Anthropic's `plugins.md`, and OpenAI's Codex docs all call this out as a common mistake.
- **Codex marketplace path lives outside `.codex-plugin/`.** Unlike Claude/Cursor where `marketplace.json` sits next to `plugin.json`, Codex looks for `.agents/plugins/marketplace.json` at the repo root. We ship the native location; Codex will also fall back to `.claude-plugin/marketplace.json` if the native one is missing. Because this repo is itself the plugin root, do not use a Codex local source path of `"./"` here; current Codex releases skip that entry as an empty local source path.
- **No `commands/` directory.** Anthropic's plugin docs frame `commands/*.md` as "skills as flat Markdown files" and explicitly recommend `skills/<name>/SKILL.md` for new content. Shipping both at once creates duplicate slash-dropdown entries for the same capability (the flat command and the skill both show up). The skill primitive is strictly more capable (supports `references/`, `disable-model-invocation`, `allowed-tools`, folder structure). We migrated away from `commands/` in `refactor/remove-legacy-commands-directory` — don't re-introduce it.
- **`disable-model-invocation: true`** in a SKILL.md's YAML frontmatter is the canonical Claude Code field for hiding a skill from the initial agent metadata. Used by the router pattern (see Future scaling in `contributing.md`). Documented in the Claude Code Quickstart — not vendor-specific.
- **Filename and schema matter for MCP config**: Cursor specifically looks for `mcp.json` (not `.mcp.json`), Claude Code reads `.mcp.json` with `mcpServers`, and Codex uses `.codex-mcp.json` pointed to by `.codex-plugin/plugin.json` with the `mcp_servers` wrapper accepted by Codex.
- **Symlink `CLAUDE.md` → `AGENTS.md`** at the repo root. AGENTS.md is the cross-vendor name (agents.md spec); CLAUDE.md is what Claude Code reads for project instructions. One file, two entry points — recent Claude Code versions also fall back to AGENTS.md natively but the symlink makes the intent explicit and supports older versions.

## CLI hints (future-only — official marketplace required)

If the plugin lands in `claude-plugins-official`, the ggshield CLI itself can prompt Claude Code users to install us. When `CLAUDECODE=1` is set, the CLI emits a self-closing XML tag to stderr:

```
<claude-code-hint v="1" type="plugin" value="gitguardian@claude-plugins-official" />
```

Claude Code scans output, strips the hint line before passing to the model, validates it targets an official-marketplace plugin, then shows an install prompt (dismisses as "No" after 30s, prompted once per session). That's a change in the ggshield CLI repo, not this one. Same idea applies to future GitGuardian CLIs.

Reference: https://code.claude.com/docs/en/plugin-hints

## Vendor docs index (the ones we actually use)

**Anthropic (Claude Code):**

- https://code.claude.com/docs/en/plugins — primary authoring guide (Quickstart, directory layout, migration from `.claude/`, submission process)
- https://code.claude.com/docs/en/plugins-reference — full technical schema for `plugin.json`, version management, debugging tools
- https://code.claude.com/docs/en/plugin-marketplaces — `marketplace.json` schema, plugin source types (github, git URL, git-subdir, npm, relative path), hosting options
- https://code.claude.com/docs/en/discover-plugins — user-facing install flows, `extraKnownMarketplaces`, security
- https://code.claude.com/docs/en/plugin-hints — CLI-emitted install prompts (above)
- https://code.claude.com/docs/en/plugin-dependencies — declaring version constraints between plugins
- https://code.claude.com/docs/en/agent-sdk/plugins — loading plugins via the Agent SDK

**OpenAI (Codex):**

- https://developers.openai.com/codex/plugins — plugin system overview, install flows, marketplace sources
- https://developers.openai.com/codex/plugins/build — `plugin.json` schema (required + optional fields, `interface` block), `marketplace.json` schema (sources, policy, category), repo / personal / git / git-subdir sources, directory layout
- https://developers.openai.com/codex/skills — Agent Skills format, SKILL.md frontmatter, discovery semantics
- https://developers.openai.com/codex/guides/agents-md — AGENTS.md custom-instructions guide (the cross-vendor file we use here)
- https://developers.openai.com/codex/changelog — versioned changelog; plugin system landed in CLI v0.117.0

**Cursor:**

- https://github.com/cursor/plugin-template — Cursor's reference plugin layout + submission checklist
- https://cursor.com/marketplace/publish — Cursor marketplace submission

**Cross-vendor:**

- https://agentskills.io — the cross-vendor Agent Skills standard (also lives at `anthropics/skills/spec/agent-skills-spec.md`)
- https://agents.md — the cross-vendor AGENTS.md convention

**GitGuardian:**

- https://docs.gitguardian.com/llms.txt — GitGuardian's AI-agent docs index (append `.md` to any HTML page on docs.gitguardian.com to get Markdown)
