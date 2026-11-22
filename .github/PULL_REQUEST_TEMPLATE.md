<!--
Title: Conventional Commit, e.g. `feat(scan-secrets): ...`, `fix(triage-incidents): ...`, `docs: ...`.
Skill content (SKILL.md, references/) is `feat:` or `fix:`, never `docs:`. See docs/maintainers/releasing.md.
Delete the checklist sections that do not apply (say why in one line).
-->

## Why

<!-- The problem, linked issue, or user request. -->

## What

<!-- What changed, in a few bullets. -->

## Checklist

### Skill layout

- [ ] Folder is `skills/<verb-noun>/` and the folder name equals `name:` in the frontmatter
- [ ] Frontmatter has `name`, `description` (a trigger statement, ~50-60 words, plain prose), `license: MIT`, `compatibility` (matches the Prerequisites section), and `metadata.version` with the `# x-release-please-version` annotation
- [ ] SKILL.md sections follow the order in AGENTS.md: Overview, When to Use, Onboarding (Prerequisites, Setup), Commands, Best Practices, Troubleshooting
- [ ] Long content is in `skills/<name>/references/`; every reference the skill links to lives inside the skill (shared references are copied, and all copies have the same checksum)
- [ ] No emojis in skill content
- [ ] No `kiro/` copy (the `kiro/` folder is legacy and is not edited)

### Evals

- [ ] `evals/evals.json` (behaviour cases with assertions) and `evals/targets.json`
- [ ] `evals/trigger-eval.json` (should-trigger and should-not-trigger prompts)
- [ ] Live harness, if any: only a README in `evals/files/` here; the runnable scripts stay in the internal skill package

### Tool contracts

- [ ] CLI-backed: every `ggshield` subcommand and flag checked against `ggshield <subcommand> --help` (version: ...)
- [ ] MCP-backed: every tool name, argument, enum value and output field checked against the gg-mcp version pinned in `package.json` (`scripts/check-mcp-contracts.mjs` once available), not against the REST API docs
- [ ] MCP-backed: pagination uses `next_arguments`; values read from the API are checked for `<GG>OBFUSCATED</GG>` (privacy mode) before use

### Registration

- [ ] `AGENTS.md`: Skills index row and Slash commands row
- [ ] `README.md`: Skills and Commands entry and Project Structure line
- [ ] `release-please-config.json`: `generic` extra-file entry for `skills/<name>/SKILL.md`

### Pull request

- [ ] Branch lives in `GitGuardian/agent-skills` (not a fork: the `secret-scan` check needs the repository's API key)
- [ ] One skill per pull request

## Local checks

<!-- Tick what you ran. Paste failures, not just "passed". -->

- [ ] `for f in $(find . -type f -name '*.json' -not -path './node_modules/*'); do jq empty "$f"; done`
- [ ] `node scripts/check-skill-markdown.mjs`
- [ ] `for d in skills/*/; do skills-ref validate "$d"; done`
- [ ] `npm ci && npm test`
- [ ] `claude plugin validate .`
- [ ] `ggshield secret scan path -r -y .`
- [ ] MCP-backed: `npm run check:mcp-contracts -- <tool-contracts.json>` (once the `mcp-contracts` check is in CI)

## Evals run

<!-- Which evals, which model (`--model`), how many runs, pass rate per assertion. Trigger eval: precision and recall. -->

## Live tests

<!-- Against which workspace or environment, which flows, and the result. "None" is a valid answer. -->

## What I could not verify

<!-- Commands, tools, plans or environments you could not test, and why. "Nothing" only if true. -->
