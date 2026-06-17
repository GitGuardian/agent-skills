# Changelog

## [0.3.0](https://github.com/GitGuardian/agent-skills/compare/v0.2.0...v0.3.0) (2026-06-17)


### Features

* add triage-incidents skill ([#71](https://github.com/GitGuardian/agent-skills/issues/71)) ([780c404](https://github.com/GitGuardian/agent-skills/commit/780c40459fa26a51ed6c06a53475aab2b0a88093))

## [0.2.0](https://github.com/GitGuardian/agent-skills/compare/v0.1.7...v0.2.0) (2026-06-15)


### Features

* switch all MCP configs to hosted server ([#73](https://github.com/GitGuardian/agent-skills/issues/73)) ([9ce7f0b](https://github.com/GitGuardian/agent-skills/commit/9ce7f0b091046b4d4eb6b187374171667188490b))

## [0.1.7](https://github.com/GitGuardian/agent-skills/compare/v0.1.6...v0.1.7) (2026-05-31)


### Features

* add install-git-hooks skill ([#68](https://github.com/GitGuardian/agent-skills/issues/68)) ([a2e7654](https://github.com/GitGuardian/agent-skills/commit/a2e76542753fc17697d18623d6ae501a1f672203))


### Bug Fixes

* drop redundant security contact_link ([#67](https://github.com/GitGuardian/agent-skills/issues/67)) ([5d01521](https://github.com/GitGuardian/agent-skills/commit/5d015214c1515ba91a163ee1bec142ddb48606bc))
* make blank issues public and surface security policy in chooser ([#66](https://github.com/GitGuardian/agent-skills/issues/66)) ([ba36ed1](https://github.com/GitGuardian/agent-skills/commit/ba36ed10623e2b383a7563542bc4e9c72c780cba))


### Documentation

* add VS Code (GitHub Copilot) install instructions ([#58](https://github.com/GitGuardian/agent-skills/issues/58)) ([f3642a6](https://github.com/GitGuardian/agent-skills/commit/f3642a628dc99328aaec1d48a3a7741a1d98e88b))
* improve README layout ([#63](https://github.com/GitGuardian/agent-skills/issues/63)) ([19f9563](https://github.com/GitGuardian/agent-skills/commit/19f9563f05c71b72604397e302267117ede2ddc1))
* **skills:** add docs.gitguardian.com/llms.txt fallback to every Troubleshooting section ([#48](https://github.com/GitGuardian/agent-skills/issues/48)) ([3c5fd31](https://github.com/GitGuardian/agent-skills/commit/3c5fd318d4188774dfd5b796a97cbb7e210d9156))

## [0.1.6](https://github.com/GitGuardian/agent-skills/compare/v0.1.5...v0.1.6) (2026-05-31)


### Features

* **scan-secrets:** mandate ggshield CLI over the MCP scan_secrets tool ([#59](https://github.com/GitGuardian/agent-skills/issues/59)) ([4791eb2](https://github.com/GitGuardian/agent-skills/commit/4791eb28b31a6345cf7c72957fc93f6d261b48fe))

## [0.1.5](https://github.com/GitGuardian/agent-skills/compare/v0.1.4...v0.1.5) (2026-05-31)


### Features

* **skills:** clean frontmatter descriptions, add command-handoff metadata and When Not to Use sections ([#54](https://github.com/GitGuardian/agent-skills/issues/54)) ([6813385](https://github.com/GitGuardian/agent-skills/commit/6813385128abe0d42d719ed19117d7a605654b29))

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
