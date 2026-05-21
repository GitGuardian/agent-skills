# GitGuardian Agent Skills

Catch secrets before they ship, and plant decoys to catch the ones that already did. This repo ships skill files that teach AI coding agents how to use [`ggshield`](https://github.com/GitGuardian/ggshield), GitGuardian's open-source CLI — when to scan, which flags to use, how to interpret findings, how to walk the user through removal and rotation, and when and where to plant honeytokens to detect future leaks. The agent invokes `ggshield` directly.

Supported agents: [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), [Kiro](https://kiro.dev). Install instructions below.

## Installation

### Claude Code

Add this repo as a plugin marketplace, then install the `ggshield` plugin:

```
/plugin marketplace add GitGuardian/agent-skills
/plugin install ggshield
```

That's it. The skills auto-trigger when you write or edit code that handles credentials, or when you're about to publish something where a decoy would help. You can also invoke them explicitly:

- `/ggshield:scan` — scan the working tree
- `/ggshield:scan history` — audit the full git history
- `/ggshield:scan staged` — scan staged changes (pre-commit)
- `/ggshield:scan <path>` — scan a specific file or directory
- `/ggshield:honeytoken` — generate a honeytoken (decoy AWS credential) to plant in an attractive location

**Defense in depth (recommended).** Once `ggshield` is installed and authenticated, install the agent hook so `ggshield` scans prompts, tool calls, and tool outputs from inside Claude Code:

```bash
ggshield install -t claude-code -m global
```

Requires ggshield 1.49.0+. The hook is merged into `~/.claude/settings.json` (global) or `.claude/settings.json` (local) — uninstall by removing the `ggshield` entries from that file.

### Cursor, Codex, Copilot, and 50+ other agents

Install with the [skills.sh](https://skills.sh) CLI — auto-detects which agents you have on your machine:

```bash
npx skills add gitguardian/agent-skills
```

Works with Cursor, Codex, GitHub Copilot, OpenCode, Cline, Windsurf, Gemini CLI, Kiro CLI, and [50+ other agents](https://github.com/vercel-labs/skills#supported-agents).

### Kiro

1. Open Kiro and go to **Powers → Add Power**.
2. Choose **Add power from GitHub URL** and enter:

   ```
   https://github.com/GitGuardian/agent-skills/tree/main/kiro
   ```

   The `kiro/` subdirectory holds `POWER.md` and the steering files.
3. If the GitHub install does not accept a subdirectory in your version of Kiro, fall back to **Add power from local path**: clone this repo and point Kiro at the `kiro/` folder.

Once installed, Kiro will activate the power based on its keywords (`ggshield`, `secrets`, `credentials`, etc.) and load the steering files in `kiro/steering/` contextually as you work.

## What the skills do

**`scan-secrets`** (auto-triggers when writing code that handles credentials, or on request)

- Scans files, directories, full git history, specific commits, commit ranges, Docker images, and PyPI packages for 700+ secret types — AWS keys, GitHub tokens, database URLs, JWTs, Stripe keys, private keys, and more.
- Runs proactively whenever the agent is writing or modifying code that handles credentials, `.env` files, CI/CD pipelines, Dockerfiles, or deployment scripts.
- Guides remediation: removal vs. rotation, when (and when not) to rewrite git history, false-positive handling via `# ggignore` and `.gitguardian.yaml`.

**`create-honeytokens`** (auto-triggers when creating example configs, preparing to publish, or planting decoys)

- Generates AWS honeytokens — bare credentials or wrapped in realistic-looking code — via `ggshield honeytoken create` / `create-with-context`.
- Suggests planting surfaces for highest signal: `.env.example`, pre-publication repos, internal wikis, deploy scripts, abandoned repos, public artifacts.
- Walks the user through naming, description conventions, and alert response when a honeytoken fires.

**Shared setup** — both skills handle first-time install: detect the user's package manager, install `ggshield`, and walk through OAuth or token authentication. Honeytokens additionally require Manager access on the GitGuardian workspace and a PAT with the `honeytokens:write` scope.

## Repository layout

```
.claude-plugin/                       # Claude Code plugin manifest
  marketplace.json
  plugin.json
.cursor-plugin/                       # Cursor plugin manifest
  marketplace.json
  plugin.json
skills/                               # one folder per skill — shared by Claude Code & Cursor
  scan-secrets/
    SKILL.md
    references/                       # heavy reference, loaded on demand
      workflows.md
      remediation.md
  create-honeytokens/
    SKILL.md
    references/
      planting-strategy.md
commands/                             # slash commands
  scan.md                             # /ggshield:scan
  honeytoken.md                       # /ggshield:honeytoken
kiro/                                 # Kiro power (separate format)
  POWER.md
  steering/                           # contextually-loaded guidance
    scan-workflows.md
    scan-remediation.md
    honeytoken-planting.md
```

## Requirements

A [GitGuardian account](https://dashboard.gitguardian.com/signup) — the free tier is enough to get started. The skill handles installing the CLI and authenticating it on first use.

## License

MIT
