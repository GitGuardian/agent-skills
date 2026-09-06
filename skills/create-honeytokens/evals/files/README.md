# create-honeytokens eval fixtures

Throwaway repos used by `skills/create-honeytokens/evals/evals.json`. Each
fixture is built at eval time by its `setup.sh` — the committed content holds
only the build recipe, not a usable repo.

## What these evals test

`create-honeytokens` generates AWS decoy credentials and guides placement.
The evals grade the *judgment* around generation — confirming the planting
surface, avoiding the self-triggering import-graph foot-gun, declining
unsupported token types — more than the CLI call itself.

- **`env-example-surface`** — a repo about to be open-sourced, with an
  `.env.example` of placeholders. The one eval that actually creates a
  honeytoken. Because a real `ggshield honeytoken create` registers a real
  token on the workspace dashboard, this eval is skipped in headless runs
  (see `scripts/evals.config.json`) and meant for interactive sessions.
- **`importable-path-footgun`** — a repo whose `src/index.ts` imports
  `./services/payments`. Grades that the agent notices the requested planting
  file is in the production import graph and proposes a non-importable spot
  instead of silently planting there.

The `vague-ask-confirms-surface` and `non-aws-declined` evals need no
fixture — they run in a bare workspace.

## Why there is no `_shared/secrets.env`

These fixtures plant **no** detectable credential: `.env.example` holds only
`your-key-here` placeholders, and the footgun repo holds only code. Nothing
here can trip the repo-wide CI ggshield scan.
