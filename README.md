# GitGuardian Agent Skills

Catch secrets before they ship. This repo packages GitGuardian's [`ggshield`](https://github.com/GitGuardian/ggshield) CLI as ready-to-use skills for AI coding agents — so your agent runs a scan after every change, explains what it found, and walks you through remediation without you ever leaving the editor.

| Agent | What to install |
|---|---|
| [Claude Code](https://claude.ai/code) | `/plugin marketplace add GitGuardian/agent-skills` then `/plugin install ggshield` |
| [Kiro](https://kiro.dev) | Copy `kiro/ggshield-secret-scanner/` into your project |

## What the skill does

- Scans files, directories, full git history, specific commits, commit ranges, Docker images, and PyPI packages for 500+ secret types — AWS keys, GitHub tokens, database URLs, JWTs, Stripe keys, private keys, and more.
- Runs proactively whenever the agent is writing or modifying code that handles credentials, `.env` files, CI/CD pipelines, Dockerfiles, or deployment scripts.
- Guides remediation: removal vs. rotation, history rewriting, false-positive handling via `# ggignore` and `.gitguardian.yaml`.
- Handles first-time setup: detects the user's package manager, installs `ggshield`, and walks through OAuth or token authentication.

The Claude Code plugin also ships a `/scan` slash command for explicit scans — `/scan` (current files), `/scan history` (full git history), `/scan staged` (pre-commit), or `/scan <path>`.

## Repository layout

```
.claude-plugin/marketplace.json     # Claude Code marketplace manifest
plugins/
  ggshield/
    .claude-plugin/plugin.json      # plugin metadata
    skills/ggshield-secret-scanner/ # the Claude skill
    commands/scan.md                # /scan slash command
kiro/
  ggshield-secret-scanner/          # the Kiro power
```

## Requirements

A [GitGuardian account](https://dashboard.gitguardian.com/signup) — the free tier is enough to get started. The skill handles installing the CLI and authenticating it on first use.

## License

MIT
