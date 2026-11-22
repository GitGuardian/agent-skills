---
name: write-skill
description: Use when asked to create, write, extend, or review a skill for the GitGuardian agent-skills repository, to add evals or a reference to one of its skills, to check a skill's ggshield or gg-mcp tool names, or to open a pull request on GitGuardian/agent-skills. For contributors to this repository, not for end users of the GitGuardian skills.
license: MIT
compatibility: For contributors working in a clone of GitGuardian/agent-skills. Needs git, gh, jq, Node.js with npm, Python 3 with skills-ref, and ggshield. MCP-backed skills also need Python 3 to install the pinned gg-mcp, or a connected gg-mcp of the declared version.
metadata:
  internal: "true"
  version: "0.9.0" # x-release-please-version
---

# GitGuardian — Write a Skill

## Overview

This skill walks an agent through writing or changing a skill in
`GitGuardian/agent-skills` and opening a pull request that can merge. It applies the
repository's own rules; it does not replace them. When this skill and the repository
disagree, the repository wins: `AGENTS.md` first, then `docs/maintainers/`.

It is a contributor tool. It is marked `metadata.internal: "true"`, so the skills.sh
installer skips it unless asked for it by name.

## When to Use

- The user asks to create a new GitGuardian skill, or to extend, fix or review one in `skills/`.
- The user asks to add evals, a trigger eval, or a reference file to a skill here.
- The user asks whether the ggshield commands or gg-mcp tool names in a skill are right.
- The user asks to open or finish a pull request on `GitGuardian/agent-skills`.

Do not use it to run a GitGuardian skill (scan, triage, honeytokens): use that skill.

## Onboarding (first use)

### Prerequisites

- A clone of `GitGuardian/agent-skills` and a branch pushed to that repository, not to a
  fork. The required `secret-scan` check needs the repository's API key, which GitHub does
  not give to fork pull requests. Without write access, ask a maintainer for it or ask
  them to push the branch.
- `git`, `gh` (authenticated), `jq`, Node.js and npm, Python 3, `ggshield`.
- `skills-ref`: `pip install "skills-ref @ git+https://github.com/agentskills/agentskills.git#subdirectory=skills-ref"`.
- `claude` (Claude Code CLI) for `claude plugin validate .`.

### Setup

```bash
git fetch origin
git switch -c <type>/<short-name> origin/main   # branch from origin/main, not a stale local main
npm ci
```

## Workflow

Do the steps in order. Load a reference only when its step needs it.

1. **Read the contract.** Read `AGENTS.md` end to end, then
   `docs/maintainers/contributing.md`. Read `docs/maintainers/evals.md` before step 5 and
   `docs/maintainers/releasing.md` before step 8. Do not restate their rules from memory.
2. **Check the scope.** Confirm the capability is reachable through `ggshield` or gg-mcp
   and is not already covered by an existing skill. Read the existing skill closest to it.
   If the scope is unclear or overlaps an existing skill, ask the user before writing.
3. **Choose the backend.** CLI-backed (drives `ggshield`), MCP-backed (drives gg-mcp
   tools) or both. Run `ggshield <subcommand> --help` for every CLI command you plan to
   name. For MCP-backed work, read
   [`references/mcp-backed-skills.md`](references/mcp-backed-skills.md) now.
4. **Build the folder.** Follow
   [`references/skill-anatomy.md`](references/skill-anatomy.md): name, frontmatter,
   section order, `references/`, copied shared references, no `kiro/` copy.
5. **Write the evals.** Follow [`references/evals.md`](references/evals.md):
   `evals.json`, `trigger-eval.json`, `targets.json`, fixtures, and where a live harness
   goes. Run them and keep the results for the pull request.
6. **Verify every tool contract.** Every `ggshield` subcommand and flag against `--help`
   of the declared version. Every gg-mcp tool, argument, enum value and output field
   against the pinned gg-mcp schema, never against the REST API docs. See
   [`references/mcp-backed-skills.md`](references/mcp-backed-skills.md).
7. **Register the skill.** Index rows in `AGENTS.md` (Skills index, Slash commands) and
   `README.md` (Skills and Commands, Project Structure), and a `generic` extra-file entry
   in `release-please-config.json`.
8. **Run the local checks** and fix every failure. The commands are in
   [`references/pull-request.md`](references/pull-request.md).
9. **Open the pull request** from a branch in `GitGuardian/agent-skills`, with a
   Conventional Commit title and the filled `.github/PULL_REQUEST_TEMPLATE.md`. Ask the
   user before `git push` and before opening it. See
   [`references/pull-request.md`](references/pull-request.md).
10. **Own it until it is green.** Watch the checks and the review, fix what fails or is
    asked, push again with the user's consent, and report the pull request URL.

## Best Practices

- **Verify, do not recall.** Product capabilities from `gitguardian.com` or
  `docs.gitguardian.com`, CLI flags from `--help`, MCP tools from the server schema.
  Training data is out of date for all three.
- **One skill per pull request.** Fixes to another skill or to shared references go in a
  separate pull request.
- **Keep SKILL.md short.** It routes; `references/` holds the detail.
- **Skill content is `feat:` or `fix:`,** never `docs:`. `docs:` is for maintainer files
  only.
- **The repository is public.** No internal links, ticket IDs, chat threads, local paths
  or real credentials in any committed file or in the pull request description.
- **Report what you did not verify.** The pull request has a section for it. Leave it
  empty only if that is true.

## Troubleshooting

**`skills-ref validate` reports unexpected fields.** Only `name`, `description`,
`license`, `compatibility`, `allowed-tools` and `metadata` are allowed at the top of the
frontmatter. Put other keys under `metadata` as strings.

**`skills-ref validate` reports a YAML error in `description` or `compatibility`.** An
unquoted `: ` breaks the YAML. Rephrase to remove the colon.

**`npm test` fails with "Cannot find package 'vite'".** A global `legacy-peer-deps`
setting skipped the peer dependency vitest needs. Run `npm ci --legacy-peer-deps=false`.

**The `secret-scan` check fails with an authentication error.** The pull request comes
from a fork. Move the branch to `GitGuardian/agent-skills` and open a new pull request.

**Checks show "waiting for approval".** First-time contributors need a maintainer to
approve the first workflow run. Ask on the pull request.

**The tool-contract check reports an unknown argument.** The skill uses a REST name or an
older gg-mcp name. Use the name from the schema of the pinned version. See
[`references/mcp-backed-skills.md`](references/mcp-backed-skills.md).
