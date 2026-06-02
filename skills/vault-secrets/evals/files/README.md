# vault-secrets eval fixtures

Throwaway projects used by `skills/vault-secrets/evals/evals.json`. Each fixture is
built at eval time by its `setup.sh` — the committed content holds only the build
recipe, not a usable secret-leaking source tree.

Synthetic real-shape secret values live in `_shared/secrets.env` with `# ggignore`
markers, so the repo-wide ggshield scan in CI stays clean. Each `setup.sh` sources that
file and writes the values into the target fixture WITHOUT the ggignore comments — at
which point ggshield detects them as intended.

- `eval-1-env-at-rest/` — `.env` present but never committed; leaked-first gate passes.
- `eval-2-leaked-first-gate/` — `.env` committed to history; gate must fire.
- `eval-3-multiline-deferred/` — a single-line DB URL plus a multiline private key that
  is out of scope this version; the agent should vault the URL and decline the key.
