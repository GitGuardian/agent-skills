# install-hooks eval fixtures

These are the throwaway git repos used by `skills/install-hooks/evals/evals.json`.
Each fixture is built at eval time by its `setup.sh` script — the committed
content holds only the build recipe, not a usable repo.

## What these evals test

`install-hooks` is the **prevention** skill: it installs `ggshield` as a git hook
(pre-commit / pre-push) to protect commits or outgoing pushes, **or**
as an AI-assistant hook (claude-code, codex, copilot, cursor, vscode) so an AI
coding tool scans its prompts and actions for secrets in real time. The evals
grade whether the agent routes to the right hook family and installs it correctly
— not whether a secret is detected.

- **`install-precommit-local`** — a clean repo. Grades that the agent treats the
  request as installing a hook (not scanning existing code), installs for *this*
  repo (`-m local`), surfaces the pre-commit/pre-push choice, and verifies by
  installer success + effective executable hook/manager dispatch (no fabricated test-commit).
- **`global-needs-consent`** — grades that a "every repo on my machine" request
  is recognized as a global install (`--mode global`, which changes the user's
  global git config). The request already explicitly authorizes that scope; the
  agent explains the change and reuses that authorization.
- **`already-has-hook`** (edge case) — the repo already has a custom pre-commit
  hook. Grades that the agent preserves its checks and integrates a reachable,
  blocking ggshield command. Blind appending after an unconditional exit fails.
- **`install-claude-code`** — a clean repo where the user says "install Claude
  hooks". Grades that the agent routes to the AI-assistant family
  (`ggshield install -t claude-code`), installs for this project (`-m local`),
  surfaces the local-vs-global choice, and does NOT install a git pre-commit hook.
- **`ambiguous-asks-family`** — a clean repo with a bare "install hooks" request
  (no family keyword). Grades that the agent STOPS and asks which family (git vs
  AI-assistant) rather than silently guessing a hook type.

## Routing scenarios without fixtures

The remaining cases carry setup facts in the prompt and can run as read-only decision checks: recurring pre-push protection, a lint-only pre-commit framework, a scoped user-wide Cursor install, and a shadowed pre-push hook. Record proposed actions without executing installs or scans. These checks evaluate routing and command selection; they do not prove runtime hook behavior.

## Why there is no `_shared/secrets.env`

Unlike `scan-secrets` and `check-hmsl`, these fixtures plant **no** detectable
credential. The skill verifies effective configuration and readiness, not
by firing a test secret, so the evals need no real-shape secret values — and
there is nothing here for a repo-wide CI secret scan to flag.

## The git-fixture constraint

Eval-loop subagents cannot invoke `git` directly (the harness denies it). Each
`setup.sh` therefore builds its repo in the **parent session**, and the subagent
only ever runs `ggshield install` against the pre-built directory. See
`docs/maintainers/evals.md` ("Subagent harness quirk: `git` is denied").

## Layout

```
files/
  README.md                            # this file
  install-precommit-local/setup.sh     # clean repo, one committed file
  global-needs-consent/setup.sh        # clean repo (global-install posture test)
  already-has-hook/setup.sh            # repo with a pre-existing pre-commit hook
  install-claude-code/setup.sh         # clean repo (AI-assistant routing test)
  ambiguous-asks-family/setup.sh       # clean repo (bare request, ask-which-family)
```

## Building a fixture

```bash
# From the repo root, defaults to a sibling _built/ dir under the fixture:
bash skills/install-hooks/evals/files/install-precommit-local/setup.sh

# Or pass an explicit target directory:
bash skills/install-hooks/evals/files/install-precommit-local/setup.sh /tmp/eval-1
```

The `_built/` output is a runtime artifact — never commit it.
