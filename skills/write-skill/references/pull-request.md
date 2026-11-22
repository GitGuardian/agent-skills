# Local checks and the pull request

The maintainer version is "Opening the pull request" in
`docs/maintainers/contributing.md`; it wins if they disagree.

## Local checks

Run these from the repository root. They are the commands CI runs
(`.github/workflows/validate.yml`, `sanity.yml`, `ggshield.yml`). Fix every failure
before you push.

```bash
# JSON syntax
for f in $(find . -type f -name '*.json' -not -path './node_modules/*'); do jq empty "$f"; done

# Invisible characters and base64 runs in skill markdown
node scripts/check-skill-markdown.mjs

# Agent-skills spec (frontmatter, name rules)
for d in skills/*/; do skills-ref validate "$d"; done

# Install-flow sanity and unit tests
npm ci && npm test

# Plugin manifests
claude plugin validate .

# Secrets
ggshield secret scan path -r -y .
```

For an MCP-backed skill, also run the tool-contract check from `mcp-backed-skills.md`
(once the `mcp-contracts` check is in CI, it also runs there).

Duplicated references must keep one checksum per file name:

```bash
for f in skills/*/references/gitguardian-platform.md; do shasum "$f"; done
```

## Commit and branch

- Branch from `origin/main`: `git fetch origin && git switch -c <type>/<name> origin/main`.
- Conventional Commit messages. End each AI-authored commit with the model byline the
  repository requires (see "Commit attribution" in `AGENTS.md`).
- Ask the user before every `git push`. Consent for one push does not cover the next.

## Where the branch lives

Push to `GitGuardian/agent-skills`, not to a fork. The required `secret-scan` check runs
ggshield with the repository's API key, and GitHub does not pass repository secrets to
workflows that run on a fork. A fork pull request cannot pass it. Without write access,
ask a maintainer for it or ask them to push the branch.

GitHub holds the first workflow run of a first-time contributor until a maintainer
approves it.

## Title

We squash-merge, so the pull request title becomes the commit on `main`. Release Please
reads it to choose the version bump:

| Change | Title prefix | Bump before 1.0 |
|---|---|---|
| New skill, or a meaningful change to a skill's content | `feat:` | minor |
| Bug fix in a skill or tooling | `fix:` | patch |
| Breaking change (rename, removed surface) | `feat!:` | minor |
| Maintainer docs, CI, chores | `docs:`, `ci:`, `chore:` | none |

Skill content (`SKILL.md`, `references/`) is `feat:` or `fix:`, never `docs:`.

## Description

Use `.github/PULL_REQUEST_TEMPLATE.md`. Tick only what is true. It must report:

- the evals you ran, the model, the number of runs, the results per assertion, and
  precision and recall for the trigger eval;
- the local checks you ran, with any failure pasted;
- live tests, if any: environment, flows, result;
- what you could not verify, and why.

Keep it short. The repository is public: no internal links, ticket IDs or chat threads.

## After opening

```bash
gh pr checks <number> --watch
gh pr view <number> --comments
```

Fix failing checks and address each review comment, then push again with the user's
consent. The pull request is done when the checks are green and the review is addressed.
A maintainer merges; do not merge it yourself.
