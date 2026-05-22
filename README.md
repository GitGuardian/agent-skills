# GitGuardian Agent Skills

Catch secrets before they ship, and plant decoys to catch the ones that already did. This repo ships skill files that teach AI coding agents how to use [`ggshield`](https://github.com/GitGuardian/ggshield), GitGuardian's open-source CLI — when to scan, which flags to use, how to interpret findings, how to walk the user through removal and rotation, and when and where to plant honeytokens to detect future leaks. The agent invokes `ggshield` directly.

Supported agents: [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), [Kiro](https://kiro.dev). Install instructions below.

## Installation

### Claude Code

Add this repo as a plugin marketplace, then install the `gitguardian` plugin:

```
/plugin marketplace add GitGuardian/agent-skills
/plugin install gitguardian
```

That's it. The skills auto-trigger when you write or edit code that handles credentials, or when you're about to publish something where a decoy would help. You can also invoke them explicitly:

- `/gitguardian:scan-secrets` — scan code for hardcoded secrets (working tree, full git history, staged changes, a specific path, a commit, a Docker image, or a PyPI package; just say which in the prompt)
- `/gitguardian:create-honeytokens` — generate a honeytoken (decoy AWS credential) to plant in an attractive location

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

Both skills handle first-time setup — they detect the user's package manager, install `ggshield`, and walk through OAuth or token authentication. Honeytokens additionally need Manager access on the GitGuardian workspace and a PAT with the `honeytokens:write` scope; the agent can drive the scope upgrade on the user's behalf via `ggshield auth logout` + `ggshield auth login --scopes honeytokens:write` — see [references/gitguardian-platform.md](references/gitguardian-platform.md).

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
