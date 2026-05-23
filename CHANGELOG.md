# Changelog

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
