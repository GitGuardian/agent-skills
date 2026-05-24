# Changelog

## [0.1.4](https://github.com/GitGuardian/agent-skills/compare/v0.1.3...v0.1.4) (2026-05-24)


### Features

* add scan-machine skill for endpoint credential scans ([#21](https://github.com/GitGuardian/agent-skills/issues/21)) ([0d493f8](https://github.com/GitGuardian/agent-skills/commit/0d493f8151b4381946e310d87e017a64c738603b))

## [0.1.3](https://github.com/GitGuardian/agent-skills/compare/v0.1.2...v0.1.3) (2026-05-24)


### Features

* distribute the plugin via Codex's marketplace ([#23](https://github.com/GitGuardian/agent-skills/issues/23)) ([d5bb1b9](https://github.com/GitGuardian/agent-skills/commit/d5bb1b9a188d5dbc1d98a0da21a14dadfc92bcc8))

## [0.1.2](https://github.com/GitGuardian/agent-skills/compare/v0.1.1...v0.1.2) (2026-05-23)


### Features

* extract `references/ggshield-cli-setup.md` so all skills share one CLI install/auth/headless flow instead of duplicating it ([#19](https://github.com/GitGuardian/agent-skills/issues/19)) ([760ef80](https://github.com/GitGuardian/agent-skills/commit/760ef809a1463d3c43c50fe62fc054c547ae265c))
* **scan-secrets:** add a direct-download install tier with `gh release download` plus `curl` / `wget` / PowerShell fallbacks and per-OS artifacts (`.pkg`, `.deb`, `.rpm`, `.msi`, `.tar.gz`) for machines without a usable package manager ([#19](https://github.com/GitGuardian/agent-skills/issues/19)) ([760ef80](https://github.com/GitGuardian/agent-skills/commit/760ef809a1463d3c43c50fe62fc054c547ae265c))

## [0.1.1](https://github.com/GitGuardian/agent-skills/compare/v0.1.0...v0.1.1) (2026-05-23)


### Features

* add check-hmsl skill for looking up known credentials ([#22](https://github.com/GitGuardian/agent-skills/issues/22)) ([7b6443d](https://github.com/GitGuardian/agent-skills/commit/7b6443de521354b6bf7ba9a853281308ed2cbf3d))

## [0.1.0](https://github.com/GitGuardian/agent-skills/releases/tag/v0.1.0) (2026-05-22)

### Features

* add scan-secrets skill for detecting hardcoded secrets with ggshield across files, directories, git history, commits, Docker images, and PyPI packages
* add create-honeytokens skill for generating AWS decoy credentials and guiding safe planting strategies
* bundle GitGuardian Developer MCP server configuration for Claude Code and Cursor
* add Claude Code and Cursor plugin manifests, marketplace metadata, and the GitGuardian logo asset
* add cross-agent installation support through skills.sh

### Documentation

* document installation flows for Claude Code, Cursor, Kiro, and other agents
* add repository-wide contributor guidance in AGENTS.md, with CLAUDE.md as a symlink entry point
* document skill structure, naming conventions, release policy, and plugin distribution rules

### CI

* add validation for plugin manifests, skill frontmatter, the agent-skills spec, install-flow sanity tests, and repository secret scanning
