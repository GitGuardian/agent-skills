# Running evals

We evaluate skills using Anthropic's [`skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator), the reference implementation of the [agent-skills eval loop](https://agentskills.io/skill-creation/evaluating-skills). We do not vendor its code — we install it on demand and author only the test content.

## One-time setup

```bash
npx --yes skills add anthropics/skills --skill skill-creator
```

## Per-skill workflow

Test cases live in `skills/<skill>/evals/evals.json`. Test fixtures (small projects the agent operates on during a run) live under `skills/<skill>/evals/files/<eval-name>/`. Workspace results (per-iteration outputs, timing, grading, benchmarks) go to a sibling directory `<skill>-workspace/` that is gitignored — never commit it.

Run the loop against a skill (from the repo root):

```bash
claude --dangerously-skip-permissions --plugin-dir . --model claude-sonnet-4-6 \
  "Run the skill-creator eval loop against skills/scan-secrets"
```

`--plugin-dir .` makes Claude evaluate the in-tree skill on this branch, not whichever version is globally installed. `--dangerously-skip-permissions` lets skill-creator's subagents run `ggshield` and the fixture builds without prompting. `--model` picks the model that drives skill-creator; to evaluate against a different model, swap the flag value (the models we promise to test against are listed in `evals/targets.json`).

The loop produces `iteration-N/` directories under `<skill>-workspace/` with `outputs/`, `timing.json`, `grading.json`, and a per-iteration `benchmark.json`.

### Fixtures that need to ship detectable secrets

`scan-secrets` evals need fixtures that ggshield will actually flag — otherwise the assertions can't grade real behavior. But committing real-shape secret values straight into the repo lights up CI on every PR. The pattern we settled on for that skill: a single committed `evals/files/_shared/secrets.env` holds the synthetic values *with `# ggignore` comments* (so repo-wide ggshield scans stay clean), and each per-eval `setup.sh` sources that file and writes the values into a `_built/` target dir *without* the ggignore comments (so the runtime fixture triggers detections as intended). See `skills/scan-secrets/evals/files/README.md`.

CI sanity check that the committed fixtures don't accidentally ship a live secret:

```bash
ggshield secret scan path -r -y skills/scan-secrets/evals/files
```

Expected: `No secrets have been found`.

### Subagent harness quirk: `git` is denied, `ggshield` isn't

Eval-loop subagents (the `Agent` tool, even with `mode: bypassPermissions`) cannot invoke `git` directly from Bash — `git --version`, `git status`, `git log`, `git init` all return *"Permission to use Bash has been denied."* The denial is at the **harness permission layer**, not macOS `sandbox-exec`. Two consequences:

- **`dangerouslyDisableSandbox: true` does not help.** Wrong knob — that flag controls the downstream `sandbox-exec` wrapper, not the upstream harness allowlist.
- **`ggshield secret scan pre-commit` / `secret scan repo` still work.** The harness allowlists `ggshield` at the top-level argv and does not introspect what `ggshield` spawns internally — so any `git` plumbing ggshield does for you is fine. This is why eval-2 (`aws-key-history-hunt`) scans correctly: the subagent runs `ggshield secret scan repo .`, ggshield walks history internally.

**Practical rule:** subagents cannot bootstrap a git-repo fixture themselves. Build fixtures in the **parent session** (or via a one-shot shell setup script that ran before the agent spawned), then point the subagent at the pre-built dir. The `evals/files/<eval-name>/setup.sh` pattern documented above is designed around this constraint — the setup runs once, the subagent only ever reads or hands the fixture to `ggshield`.

## Headless runs — local on demand and CI

The skill-creator loop above is interactive. For unattended runs — locally on demand or in CI — we drive the suites through the [`agent-skill-eval`](https://github.com/tardigrde/agent-skill-eval) harness (`pip install agent-skill-eval`), which runs the real `claude` CLI against each prompt (with and without the skill installed), grades per assertion (deterministic state-diff checks first, LLM rubric for the rest), and reports pass rates, deltas, tokens, and cost.

The canonical `evals/evals.json` files stay in skill-creator format. `scripts/run-evals.mjs` adapts them on the fly:

- builds each fixture with its `setup.sh` into `eval-workspace/ase/<skill>/files/<case>/` (parent-session build, same constraint as above), staging the built contents — `.git` included — so the harness workspace root *is* the fixture repo;
- flattens `{id, text}` assertion objects to the plain strings ase expects;
- validates the converted suite (`ase validate`), then runs and reports.

```bash
npm run evals                              # all suites, default model
npm run evals -- --skill install-hooks     # one suite
npm run evals -- --skill scan-secrets --eval-id 2 --model claude-opus-4-8
npm run evals:dry                          # build + convert + validate only, no API calls
node scripts/run-evals.mjs --skill install-hooks --agent fake   # offline pipeline smoke test
```

Anything after `--` that the driver doesn't recognize is passed to `ase run` verbatim (e.g. `-- --runs 3 --no-baseline`). Results land under `eval-workspace/` (gitignored via `*-workspace/`); read them with `ase report --workspace eval-workspace/<skill>-workspace --show-evidence`.

Credentials:

| Env var | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | the `claude-code` agent runs (all suites) |
| `GITGUARDIAN_API_KEY` | the `scan-secrets` suite (real `ggshield` scans); suite is skipped when absent |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | LLM rubric grading; when neither is set the driver routes the grader to Anthropic's OpenAI-compatible endpoint using `ANTHROPIC_API_KEY`. With no grader key at all, rubric assertions are marked *skipped*, never silently failed. |

Per-suite policy lives in `scripts/evals.config.json`: `scan-secrets` requires the GitGuardian key; `triage-incidents` evals 1 and 3 are skipped headlessly (they need a live GitGuardian MCP connection and remain interactive-only).

### CI

`.github/workflows/evals.yml` runs the same driver on a weekly schedule and on demand via `workflow_dispatch` (inputs: skill, model, runs). It is deliberately **not** a per-PR gate — behavioral evals are nondeterministic and cost API money; the per-PR gate stays `validate` + `sanity`. Each run uploads the full `eval-workspace/` as an artifact (30-day retention) and writes the markdown scorecards to the job summary. Required repo secrets: `ANTHROPIC_API_KEY` (mandatory), `GITGUARDIAN_API_KEY` (already present for the ggshield workflow), `OPENROUTER_API_KEY` (optional, dedicated grader).

## What ships in this repo vs lives upstream

| In this repo | In `skill-creator` (external) |
|---|---|
| `evals/evals.json` per skill (prompts, expected outputs, assertions) | `run_loop.py`, `run_eval.py`, `aggregate_benchmark.py`, `generate_report.py` |
| Test-case fixture files under `evals/files/` (when needed) | The `analyzer`, `grader`, `comparator` subagents |
| `.gitignore` entry for `*-workspace/` | Workspace layout convention |

Iteration cadence, raw outputs, and what we keep from each round are local-only and do not ship in this repo.

## Authoring conventions for `evals.json`

- **Start with 2–3 test cases per skill.** The spec is explicit: don't over-invest before the first round of results.
- **Prompts + expected outputs first; assertions later.** Add assertions after the first iteration reveals what "good" looks like in practice.
- **Vary phrasing and formality.** Mix casual ("hey can you check…") and precise ("Run `ggshield secret scan path` on…").
- **Include at least one edge case** — a malformed input, an ambiguous request, or a boundary the skill's instructions might not cover.

## Declaring which models the harness sweeps

The agent-skills spec defines `evals.json` (prompts, expected outputs, assertions) but does not define how to declare a target-model matrix — model selection is treated as a runtime flag. We keep `evals.json` spec-compliant and declare the matrix in a sibling file:

```
skills/<skill>/evals/
  evals.json     # spec-compliant test cases
  targets.json   # local convention: which models each runtime's driver should sweep
```

```json
// targets.json
{
  "claude": ["claude-opus-4-8", "claude-sonnet-4-6"],
  "codex":  ["gpt-5.5"]
}
```

Each runtime's driver reads its own key and runs the eval set once per model. The file is purely declarative — drivers are free to ignore it and accept an explicit `--model` flag for one-off runs. The keys are runtime names (`claude`, `codex`, future `gemini`/`cursor`/…); the values are lists of model IDs valid in that runtime.

Two reasons we keep this out of `evals.json` itself: (1) the spec might tighten its schema later, so adding our own top-level key is fragile; (2) "which models to test" is a deployment concern, not a test-case concern — separating them keeps each file's job clear.
