# Evals

The maintainer version is `docs/maintainers/evals.md`; it wins if they disagree.

## Files

| File | Content |
|---|---|
| `evals/evals.json` | Behaviour cases: `{"skill_name", "evals": [{"id", "name", "prompt", "expected_output", "files", "assertions": [{"id", "text"}]}]}` |
| `evals/trigger-eval.json` | A JSON array of `{"query", "should_trigger"}` objects |
| `evals/targets.json` | `{"claude": [...], "codex": [...]}`: the models each runtime's driver sweeps. Copy the current file from another skill |
| `evals/files/` | Fixtures, or a README for a live harness |

## evals.json

- Start with two or three cases. Add more after the first run shows what "good" looks like.
- Mix casual and precise phrasing.
- Include at least one edge case: an ambiguous request, a malformed input, or a request
  the skill must refuse or hand to another skill.
- Each assertion tests one observable behaviour, for example "calls the tool with
  `mine` set", "does not resolve before the user confirms", "asks before pushing".
- For MCP-backed skills, assertions name tools and arguments that exist in the pinned
  gg-mcp version. The tool-contract check reads `evals/` too.

## trigger-eval.json

- About 16 to 24 queries, roughly half `should_trigger: true`.
- Write the negatives as near misses: requests that belong to a sibling skill
  (`scan-secrets` versus `install-hooks`, `create-honeytokens` versus a honeytoken
  lifecycle skill), or requests in the same domain the skill does not cover.
- Write queries the way users type: typos, lowercase, context first, no skill names.

## Fixtures

- Fixtures that must contain detectable secrets follow the `scan-secrets` pattern: values
  with `# ggignore` in a committed file, and a `setup.sh` that writes them without the
  comment into a `_built/` directory at run time. The repository-wide ggshield scan must
  stay clean.
- Eval subagents may not be allowed to run `git`. Build git-repository fixtures with a
  setup script before the agent starts.

## Live harnesses

Evals that need a sandbox workspace, a token or a chat channel keep only a README under
`evals/files/` here. The runnable scripts live in the internal skill package. See
`mcp-backed-skills.md` in this folder.

## Running

```bash
npx --yes skills add anthropics/skills --skill skill-creator   # one time
claude --dangerously-skip-permissions --plugin-dir . --model <model> \
  "Run the skill-creator eval loop against skills/<name>"
```

`--plugin-dir .` evaluates the skill on your branch, not an installed version. Results go
to `<name>-workspace/`, which is gitignored: never commit it. Report the model, the number
of runs and the pass rate per assertion in the pull request, and precision and recall for
the trigger eval.
