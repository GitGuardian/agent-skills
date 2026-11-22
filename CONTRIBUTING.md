# Contributing

This repository ships skills that teach AI coding agents to use GitGuardian through the
[`ggshield`](https://github.com/GitGuardian/ggshield) CLI and the
[GitGuardian Developer MCP server](https://github.com/GitGuardian/ggmcp) (gg-mcp).
Contributions from GitGuardian teams and from outside the company are welcome: new
skills, fixes to existing skills, evals, and tooling.

## Before you start

- [`AGENTS.md`](AGENTS.md) is the contract for anyone working on this repository, human or
  agent. Read it first. Its rules are not optional.
- For a new skill or a large change, open an issue first so a maintainer can confirm the
  scope.
- If you work with an AI agent, point it at the
  [`write-skill`](skills/write-skill/SKILL.md) skill. It walks the agent through these
  rules, the evals, the local checks and the pull request.

## The shape of a skill

A skill is one folder, `skills/<verb-noun>/`, that works on its own. `SKILL.md` holds the
frontmatter (`name`, `description` as a trigger statement, `license`, `compatibility`,
`metadata.version`) and a short body in a fixed section order. Long detail goes in
`references/`, inside the skill: no links to other skills, no shared files at the
repository root. `evals/` holds the test prompts and their assertions. A skill drives
either the `ggshield` CLI or gg-mcp tools, and every command, tool name and argument it
names must exist in the version it declares.

## Where the procedure lives

| You need to... | Read |
|---|---|
| Add or change a skill, write an MCP-backed skill, open the pull request | [`docs/maintainers/contributing.md`](docs/maintainers/contributing.md) |
| Write and run evals | [`docs/maintainers/evals.md`](docs/maintainers/evals.md) |
| Choose the commit type and understand the release | [`docs/maintainers/releasing.md`](docs/maintainers/releasing.md) |
| Touch manifests or plugin surfaces | [`docs/maintainers/distribution.md`](docs/maintainers/distribution.md) |

## Pull requests must come from a branch in this repository

The required `secret-scan` check runs ggshield with the repository's GitGuardian API key.
GitHub does not give repository secrets to workflows that run on a fork, so a pull request
from a fork fails that check and cannot merge. Ask a maintainer for write access, or ask
one to push your branch to `GitGuardian/agent-skills`, then open the pull request from
that branch.

The first CI run of a first-time contributor also waits for a maintainer's approval.

## What a mergeable pull request has

- A Conventional Commit title (`feat:`, `fix:`, `docs:`, ...). The title becomes the
  squashed commit, and Release Please reads it to choose the version bump.
- The pull request template filled in, including the evals you ran with their results,
  the local checks you ran, and what you could not verify.
- One skill per pull request.
- Green checks. You own the pull request until it is green and the review is addressed.

## Security

Do not report vulnerabilities in issues or pull requests. See [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
