# GitGuardian Agent Skills

Catch secrets before they ship, and plant decoys to catch the ones that already did. This repo ships skill files that teach AI coding agents how to use [`ggshield`](https://github.com/GitGuardian/ggshield), GitGuardian's open-source CLI — when to scan, which flags to use, how to interpret findings, how to walk the user through removal and rotation, and when and where to plant honeytokens to detect future leaks. The agent invokes `ggshield` directly.

Supported agents: [Claude Code](https://claude.ai/code), [Codex](https://openai.com/codex/), [Cursor](https://cursor.com), [Kiro](https://kiro.dev). Install instructions below.

## Installation

### Claude Code

Add this repo as a plugin marketplace, then install the `gitguardian` plugin:

```
/plugin marketplace add GitGuardian/agent-skills
/plugin install gitguardian
```

You then have access to 4 commands:

- `/gitguardian:scan-secrets` — scan code for hardcoded secrets (working tree, full git history, staged changes, a specific path, a commit, a Docker image, or a PyPI package; just say which in the prompt)
- `/gitguardian:create-honeytokens` — generate a honeytoken (decoy AWS credential) to plant in an attractive location
- `/gitguardian:scan-machine` — scan the entire developer machine for credentials outside version control (dotfiles, `~/.aws`, shell history, AI agent caches). Requires GitGuardian Growth tier or higher
- `/gitguardian:check-hmsl` — check whether a *known* credential has been seen leaking publicly via HasMySecretLeaked

**Defense in depth (recommended).** Once `ggshield` is installed and authenticated, install the agent hook so `ggshield` scans prompts, tool calls, and tool outputs from inside Claude Code:

```bash
ggshield install -t claude-code -m global
```

Requires ggshield 1.49.0+. The hook is merged into `~/.claude/settings.json` (global) or `.claude/settings.json` (local) — uninstall by removing the `ggshield` entries from that file.

**MCP server (bundled).** The plugin also ships a `.mcp.json` at the repo root that registers the [GitGuardian Developer MCP server](https://github.com/GitGuardian/ggmcp). Claude Code picks it up automatically on install — you get tools for incident triage, honeytoken management, and live scans against the GitGuardian API from inside the agent. Requires [`uvx`](https://docs.astral.sh/uv/) on your PATH (Claude Code will spawn the server with `uvx --from git+https://github.com/GitGuardian/ggmcp.git developer-mcp-server`). First run opens a browser for OAuth against your GitGuardian instance; subsequent runs reuse the cached token. For EU SaaS or self-hosted, set `GITGUARDIAN_URL` in the MCP server config (see the [ggmcp README](https://github.com/GitGuardian/ggmcp#configuration-for-different-gitguardian-instances)).

### Codex

Add this repo as a Codex plugin marketplace, then install the `gitguardian` plugin from the plugin browser:

```
codex plugin marketplace add GitGuardian/agent-skills
codex
/plugins
```

Requires Codex CLI v0.117.0 or later (plugin system). In the plugin browser, select the GitGuardian marketplace, open `gitguardian`, and choose **Install plugin**. The skills auto-trigger the same way they do in Claude Code; the bundled Codex MCP config is picked up automatically.

### Cursor, Copilot, and 50+ other agents

Install with the [skills.sh](https://skills.sh) CLI — auto-detects which agents you have on your machine:

```bash
npx skills add gitguardian/agent-skills
```

Works with Cursor, GitHub Copilot, OpenCode, Cline, Windsurf, Gemini CLI, Kiro CLI, and [50+ other agents](https://github.com/vercel-labs/skills#supported-agents).

### Kiro

1. Open Kiro and go to **Powers → Add Power**.
2. Choose **Add power from GitHub URL** and enter:

   ```
   https://github.com/GitGuardian/agent-skills/tree/main/kiro
   ```

   The `kiro/` subdirectory holds `POWER.md` and the steering files.
3. If the GitHub install does not accept a subdirectory in your version of Kiro, fall back to **Add power from local path**: clone this repo and point Kiro at the `kiro/` folder.

Once installed, Kiro will activate the power based on its keywords (`ggshield`, `secrets`, `credentials`, etc.) and load the steering files in `kiro/steering/` contextually as you work.

## What you can ask

**Scan for secrets** — auto-triggers when you write or edit code that touches credentials, runs on demand for any path, history, or artifact. Reports findings with file, line, secret type, and validity. Walks you through removal and rotation.

```
Scan this repo for hardcoded credentials
Audit the full git history for leaked secrets
Check this Dockerfile and the CI config for AWS keys
Did I just commit any tokens? Scan the staged changes first
Find the secrets I leaked in commit abc1234
Scan the working tree before I push
Scan this Docker image for embedded credentials
```

**Plant a honeytoken** — generates an AWS decoy credential, suggests where to plant it for highest signal, and avoids the foot-gun of dropping it in a code path real engineers will import.

```
Drop a honeytoken in my .env.example before I publish this repo
Generate a decoy AWS credential for my Confluence runbook
Plant a tripwire credential so I know if anyone clones our archived repos
Create a honeytoken for the staging deploy script
```

**Scan the whole machine for credentials outside git** — scans dotfiles, shell history, `~/.aws`, `~/.kube`, AI agent caches, browser profiles, and abandoned project trees for credentials that never made it into a repository. Distinct from the repo-scan use case: this is for *the laptop itself*. **Requires a paid GitGuardian plan (Growth tier or higher) — endpoint scanning is not on the Free tier.**

```
Audit my whole machine for credentials before I wipe it
Scan my home folder for AWS keys and SSH credentials
What credentials am I sitting on outside git?
Inventory the secrets on this laptop before I hand it back
Check ~/.aws, ~/.kube and my shell history for live tokens
```

**Install secret-scanning hooks** — wires `ggshield` into your editor and git workflow so secrets are caught before they reach a commit. The agent picks the right hook type (`claude-code`, `cursor`, `copilot`, `pre-commit`, `pre-push`) and scope (`global` for every project on this machine, `local` for the current repo) based on what you ask.

```
Install the ggshield hook for Claude Code
Set up ggshield in Cursor so it scans my prompts and tool calls
Wire up ggshield in VS Code with Copilot
Add a pre-commit hook to block secrets before commit
Install ggshield as a pre-push hook for this repo
Set up the strongest secret-scanning coverage on this machine
```

**Check whether a known credential has been leaked publicly** — looks up a credential (or a whole file / vault inventory) against GitGuardian's HasMySecretLeaked corpus of indexed public GitHub leaks. Plaintext never leaves the machine — by default, only hash prefixes go over the wire. The inverse of *Scan for secrets*: that finds unknown secrets in code; this checks known secrets against HMSL.

```
I inherited a .env from a former teammate — check if any of these are compromised
Run an HMSL check on this list of API keys
Show me which of these credentials have appeared in public leaks
```

All skills share the same `ggshield` setup flow — detect the user's package manager, install `ggshield`, and walk through OAuth or token authentication — documented once in [references/ggshield-cli-setup.md](references/ggshield-cli-setup.md). Honeytokens additionally need Manager access on the GitGuardian workspace and a PAT with the `honeytokens:write` scope; the agent can drive the scope upgrade on the user's behalf via `ggshield auth logout` + `ggshield auth login --scopes honeytokens:write` — see [references/gitguardian-platform.md](references/gitguardian-platform.md).

## Repository layout

```
.claude-plugin/                       # Claude Code plugin manifest
  marketplace.json
  plugin.json
.cursor-plugin/                       # Cursor plugin manifest
  marketplace.json
  plugin.json
.codex-plugin/                        # Codex plugin manifest
  plugin.json
.agents/plugins/                      # Codex repo-scoped marketplace
  marketplace.json
.codex-mcp.json                       # GitGuardian Developer MCP server config (Codex)
.mcp.json                             # GitGuardian Developer MCP server config (Claude Code)
mcp.json                              # same, for Cursor
skills/                               # one folder per skill — shared by Claude Code, Codex & Cursor
  scan-secrets/
    SKILL.md
    references/                       # heavy reference, loaded on demand
      workflows.md
      remediation.md
  create-honeytokens/
    SKILL.md
    references/
      planting-strategy.md
  scan-machine/
    SKILL.md
  check-hmsl/
    SKILL.md
references/                           # shared cross-skill references
  ggshield-cli-setup.md               # install/auth/headless setup for ggshield
  gitguardian-platform.md             # public docs URL pattern, auth/scope recovery, instance URLs
kiro/                                 # Kiro power (separate format)
  POWER.md
  steering/                           # contextually-loaded guidance
    scan-workflows.md
    scan-remediation.md
    honeytoken-planting.md
```

## Requirements

A [GitGuardian account](https://dashboard.gitguardian.com/signup) — the free tier is enough to get started. The shared setup reference handles installing the CLI and authenticating it on first use.

## Testing locally

When hacking on this repo, you don't need to publish to test changes — every plugin host has a "load this local directory as a plugin" path:

### Claude Code

```bash
claude --plugin-dir /path/to/agent-skills
```

The session loads this repo as the `gitguardian` plugin (shadowing any installed version for the duration of the session). Edit a `SKILL.md`, then `/reload-plugins` to pick up the change without restarting.

### Codex

```bash
codex plugin marketplace add file:///path/to/agent-skills
codex
/plugins
```

The repo's `.agents/plugins/marketplace.json` is picked up directly. In the plugin browser, select the local GitGuardian marketplace, open `gitguardian`, and choose **Install plugin**. Current Codex releases reject local marketplace entries that point at the marketplace root, so the checked-in marketplace points at the public Git source for install. To test unmerged branch content end to end, temporarily change the marketplace entry's `source.url` to a local `file:///...` Git URL and add a `ref` for your branch before installing. Use the same plugin browser to disable `gitguardian` when swapping back to the published version.

### Cursor

```bash
ln -s /path/to/agent-skills ~/.cursor/plugins/local/gitguardian
```

Restart Cursor (or reload the plugins surface) so it picks up the symlinked local copy.

### Sanity tests

A behavioral install-flow test lives at [`test/sanity.test.ts`](test/sanity.test.ts). It runs `npx skills add` against this repo into a temp directory and asserts every skill installs, has a `SKILL.md`, and the `--skill <name>` filter works.

```bash
npm install        # one-time, installs vitest + tsx
npm run test:sanity
```

CI runs the same suite on every PR via `.github/workflows/sanity.yml`. The full validation chain in CI is:

- `validate.yml` — JSON schema + frontmatter checks + `claude plugin validate .` + [`skills-ref validate`](https://agentskills.io/specification) (the canonical cross-vendor agent-skills spec validator)
- `sanity.yml` — install-flow behavior (this file)
- `ggshield.yml` — scans the repo itself for any accidental secret

## License

MIT
