# GitGuardian Agent Skills

Catch secrets before they ship. This repo packages GitGuardian's [`ggshield`](https://github.com/GitGuardian/ggshield) CLI as ready-to-use skills for AI coding agents — so your agent runs a scan after every change, explains what it found, and walks you through remediation without you ever leaving the editor.

Supported agents: [Claude Code](https://claude.ai/code), [Kiro](https://kiro.dev). Install instructions below.

## Installation

### Claude Code

Add this repo as a plugin marketplace, then install the `ggshield` plugin:

```
/plugin marketplace add GitGuardian/agent-skills
/plugin install ggshield
```

That's it. The skill auto-triggers when you write or edit code that handles credentials. You can also run scans explicitly with the `/ggshield:scan` slash command:

- `/ggshield:scan` — scan the working tree
- `/ggshield:scan history` — audit the full git history
- `/ggshield:scan staged` — scan staged changes (pre-commit)
- `/ggshield:scan <path>` — scan a specific file or directory

**Defense in depth (recommended).** Once `ggshield` is installed and authenticated, install the agent hook so `ggshield` scans prompts, tool calls, and tool outputs from inside Claude Code:

```bash
ggshield install -t claude-code -m global
```

Requires ggshield 1.49.0+. The hook is merged into `~/.claude/settings.json` (global) or `.claude/settings.json` (local) — uninstall by removing the `ggshield` entries from that file.

### Kiro

1. Open Kiro and go to **Powers → Add Power**.
2. Choose **Add power from GitHub URL** and enter:

   ```
   https://github.com/GitGuardian/agent-skills/tree/main/kiro
   ```

   The `kiro/` subdirectory holds `POWER.md` and the steering files.
3. If the GitHub install does not accept a subdirectory in your version of Kiro, fall back to **Add power from local path**: clone this repo and point Kiro at the `kiro/` folder.

Once installed, Kiro will activate the power based on its keywords (`ggshield`, `secrets`, `credentials`, etc.) and load the steering files in `kiro/steering/` contextually as you work.

## What the skill does

- Scans files, directories, full git history, specific commits, commit ranges, Docker images, and PyPI packages for 700+ secret types — AWS keys, GitHub tokens, database URLs, JWTs, Stripe keys, private keys, and more.
- Runs proactively whenever the agent is writing or modifying code that handles credentials, `.env` files, CI/CD pipelines, Dockerfiles, or deployment scripts.
- Guides remediation: removal vs. rotation, history rewriting, false-positive handling via `# ggignore` and `.gitguardian.yaml`.
- Handles first-time setup: detects the user's package manager, installs `ggshield`, and walks through OAuth or token authentication.

## Repository layout

```
.claude-plugin/marketplace.json     # Claude Code marketplace manifest
plugins/
  ggshield/
    .claude-plugin/plugin.json      # plugin metadata
    skills/ggshield-secret-scanner/ # the Claude skill
    commands/scan.md                # /scan slash command
kiro/                               # the Kiro power
  POWER.md
  steering/                         # contextually-loaded guidance
```

## Requirements

A [GitGuardian account](https://dashboard.gitguardian.com/signup) — the free tier is enough to get started. The skill handles installing the CLI and authenticating it on first use.

## License

MIT
