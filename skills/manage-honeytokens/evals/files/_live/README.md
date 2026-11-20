# manage-honeytokens — live-sandbox eval procedure

These evals run against a **real GitGuardian sandbox workspace and a real test Slack channel**.
There are no mocks: the skill's whole point is keeping a decoy in a source and a record on the
server in step, and only a live run proves that. The price is that every run costs honeytoken
quota, needs credentials, and must clean up after itself — which is what the scripts here do.

Two eval layers, both from Anthropic's `skill-creator` (see `docs/maintainers/evals.md`):

| Layer | File | What it measures | Needs the sandbox? |
|---|---|---|---|
| Trigger | `evals/trigger-eval.json` | does the description fire on the right prompts and stay silent on the neighbours' (`create-honeytokens`, `triage-incidents`, endpoint `plant`, `scan-secrets`)? | no — `claude -p` only |
| Behavioral | `evals/evals.json` + this folder | does the agent, with the skill loaded, do the right thing end to end? | yes |

## Prerequisites

- A **dedicated sandbox workspace** on GitGuardian (SaaS or self-hosted) with honeytokens
  enabled and quota for ~10 active honeytokens. Never run against a production workspace: the
  evals create, trigger, reset and revoke tokens.
- A **dedicated Personal Access Token** on that workspace (API → Personal access tokens) with
  `honeytokens:read`, `honeytokens:write`, `sources:read`, held by a Manager. Dedicated matters:
  `teardown.py` revokes everything *this token* created (`creator_api_token_id`), nothing else.
- A **test Slack channel** (for example `#eval-honeytokens`) in a workspace the executor's Slack
  connector can read and write, containing one resolved thread whose root message is a realistic
  **Nightly backups runbook** (schedule, procedure, troubleshooting) with no AWS keys in it at
  the start of a run. The thread is the planting surface for every eval: messages and
  attachments are elements the GitGuardian Slack integration indexes, a canvas is not, so only a
  thread placement can pass the scanner-visibility test. Rotation and removal evals need a
  connector that can edit and delete messages; with a read-and-post-only connector those steps
  become handoffs the grader checks for. A Confluence page or a Jira ticket works the same way
  if that connector is the one available — set `EVAL_SURFACE` / `EVAL_LOCATION` accordingly and
  replace `<EVAL_SOURCE>` in the prompts.
- Ideally the test Slack workspace is **integrated as a source in the sandbox GitGuardian
  workspace**: then `/sources` lists the thread after the next scan and the scanner-visibility
  expectation can be graded from the API rather than argued from the transcript.
- The executor (the agent that runs each eval prompt) must have: the skill loaded (`--plugin-dir`
  on the repo, or the skill installed), the GitGuardian Developer MCP server **or**
  `GITGUARDIAN_API_KEY` in its environment, and the Slack connector. The orchestrator (you, or
  the `skill-creator` loop) needs the Slack connector too, to seed and inspect the thread.
- `python3` (standard library only) for the scripts, plus network access to the API and to
  `sts.amazonaws.com` (used once per run to trigger a seeded honeytoken).

```bash
export GITGUARDIAN_API_KEY=...                 # sandbox PAT, never a production one
export GITGUARDIAN_API_URL=https://api.gitguardian.com   # or https://api.eu1.gitguardian.com, or https://<instance>/exposed
export EVAL_SURFACE=slack
export EVAL_LOCATION=eval-honeytokens/nightly-backups-thread
export EVAL_SOURCE_URL=https://<workspace>.slack.com/archives/<channel>/p<thread_ts>
```

## Per-eval cycle

Every behavioral eval follows the same five steps. State lives in
`skills/manage-honeytokens-workspace/live-state/<eval>.json` (gitignored via `*-workspace/`).

1. **Seed the server side** — `python3 seed.py <eval-name>`. Creates the fixture honeytokens with
   their registry (tags + `GG-DEPLOYMENT` note), fires the one that must be `triggered` with a
   single `sts:GetCallerIdentity` call from the seeding machine, waits for the status to flip,
   and prints the credential blocks to post in the thread.
2. **Seed the source side** — with the Slack connector, post each printed block as one reply in
   the runbook thread, exactly as printed. The drifted fixture
   (`B_drifted`) is deliberately **not** written: its note claims `planted`, the thread never had
   it. For `plant-slack-thread`, make sure the thread has no credentials in it yet.
3. **Execute** — run the eval prompt from `evals.json` with the skill loaded, replacing
   `<EVAL_SOURCE>` with the channel and thread (for example `#eval-honeytokens / the "Nightly
   backups runbook" thread`) and `<SEEDED_TOKEN_NAME>` with the name `seed.py` printed. Approve the plan when
   the agent asks (the eval is about *what* it proposes and *when* it asks; a run that writes
   without asking fails the expectation regardless of the result). Save the transcript.
4. **Grade** — dump the thread (all replies) to a file through the connector, then
   `python3 check.py <eval-name> --source-text thread.txt`. It prints `grading.json`-shaped
   expectations for everything checkable programmatically (registry completeness, statuses,
   notes, one-token-per-deployment, key presence/absence in the source). The behavioral
   expectations in `evals.json` that are about *process* (asked before writing, explained reset
   vs revoke, grouped output) are graded from the transcript with `skill-creator`'s
   `agents/grader.md`. Merge both into the run's `grading.json`.
5. **Tear down** — `python3 teardown.py --eval <eval-name>` revokes every token the PAT created
   for this run (seeded and executor-minted) with a `REVOKED live-eval teardown` note, then delete
   the replies with the connector (or by hand) so the next run starts clean. `--dry-run` lists
   first. A revoked key left in the test thread is harmless, but it skews the next
   `plant-slack-thread` check.

`plant-github-history-only` (eval 7) needs a throwaway GitHub repository (`EVAL_REPO=owner/name`)
the executor can commit to through the GitHub connector or `gh`. It has no seed or check script:
it is graded from the transcript against its expectations, plus two reads the orchestrator does
by hand after the run — the add commit the agent reported is reachable on the default branch, and
the default branch at HEAD no longer contains the key id. Revoke the token with `teardown.py`
(it is created by the eval PAT like the others); the pair stays in the test repository's history,
which is the point of the placement.

Order of evals in a full run, cheapest first and so that each leaves a clean thread:
`endpoint-out-of-scope` (no fixtures), `plant-slack-thread`, `reconcile-triggered-and-drift`,
`reset-vs-revoke`, `delete-means-revoke-plus-cleanup`, `rotate-slack`, `plant-github-history-only`,
`fast-path-prove-it` (needs a person with the AWS CLI to run the controlled trigger from their own
machine while the executor polls; the grader checks the token ended `active` with a `RESET` note).

## With-skill vs without-skill benchmark

`skill-creator`'s benchmark mode runs each eval with and without the skill loaded. Without the
skill, the agent still has the MCP tools and the API, so the interesting deltas are: did it ask
before writing, did it mint one token per location, did it write any registry at all, did it
revoke before removing, did it reset a token it should have investigated. Expect the
programmatic checks in `check.py` to fail almost entirely without the skill — that is the
skill's value, and it is what the benchmark should show.

## Trigger evals

```bash
npx --yes skills add anthropics/skills --skill skill-creator      # once
cd <any dir with a .claude/ folder>                                # run_eval creates a temp command there
PYTHONPATH=<skill-creator dir> python3 -m scripts.run_eval \
  --eval-set skills/manage-honeytokens/evals/trigger-eval.json \
  --skill-path skills/manage-honeytokens \
  --model claude-sonnet-4-6 --runs-per-query 3 --num-workers 3 --timeout 300 --verbose
```

Two things to know about this harness. It installs the skill under test **alone**, so it
measures the description against an otherwise skill-less agent; competition with the sibling
`create-honeytokens` and `triage-incidents` is not exercised — check the near-miss prompts
manually with `claude --plugin-dir . -p "<prompt>"` and look at which `Skill` call comes first.
And it counts a run as "not triggered" the moment the first tool call is anything other than
`Skill`/`Read` of the skill, or when the run exceeds `--timeout`. **Run it with
`--num-workers 1`.** Concurrent `claude -p` processes in the same project directory interfere
with each other: in our runs the same ten positive prompts scored 0/3 with six workers, exactly
1/2 with two, and 2/2 sequentially. Lower parallelism and raise the timeout before concluding
the description under-triggers. Use `run_loop.py` (same flags plus `--max-iterations`) to let it propose
description rewrites; keep the result only if the should-not-trigger queries stay silent.

## Safety rails

- `seed.py` refuses a PAT without `honeytokens:write`; everything it creates is tagged
  `planted-by=live-eval` and described `live eval: ...`.
- `teardown.py` only ever touches tokens created by the PAT it runs with. Keep that PAT out of
  any other automation.
- The trigger step calls `sts:GetCallerIdentity` once with a seeded honeytoken from the seeding
  machine. That IP will appear in the sandbox workspace's events; it is the "benign origin" the
  `reset-vs-revoke` eval relies on. Do not run `seed.py` from a machine whose egress IP you
  would not want associated with the sandbox.
- Nothing here reads or writes production sources. If the Slack connector in use can reach
  production channels, scope the eval to the test channel in the prompt and in the executor's
  instructions.
