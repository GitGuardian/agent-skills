# scan-secrets eval fixtures

These are the throwaway projects used by `skills/scan-secrets/evals/evals.json`.
Each fixture is built at eval time by its `setup.sh` script — the committed
content holds only the build recipe, not a usable secret-leaking source tree.

## Why

The evals need fixtures that ggshield will detect when the agent scans them
(otherwise the assertions can't grade real behavior). But committing
detectable secrets straight into this repo would make every PR's secret-scan
job light up and would also be a poor hygiene signal.

The compromise: synthetic real-shape secret values live in
`_shared/secrets.env` with `# ggignore` markers, so the repo-wide ggshield
scan in CI stays clean. Each `setup.sh` sources that file and writes the
values into the target fixture *without* the ggignore comments — at which
point ggshield detects them as intended.

## Layout

```
files/
  README.md                                  # this file
  _shared/
    secrets.env                              # synthetic secret values (ggignore-suppressed)
  eval-1-precommit-env-file/setup.sh         # builds a git repo with a staged leaky .env
  eval-2-aws-key-history-hunt/setup.sh       # builds a 4-commit history where commit 2 leaks an AWS key
  eval-3-ambiguous-project-scan/setup.sh     # builds a single-commit project with three secret types
```

## Building a fixture

```bash
# From the repo root, defaults to a sibling _built/ dir under each fixture:
bash skills/scan-secrets/evals/files/eval-1-precommit-env-file/setup.sh

# Or pass an explicit target directory:
bash skills/scan-secrets/evals/files/eval-1-precommit-env-file/setup.sh /tmp/eval-1
```

The target directory is wiped clean and rebuilt each time.

## Per-fixture summary

| Fixture | What it sets up | What ggshield should find |
|---|---|---|
| `eval-1-precommit-env-file` | Git repo, single commit (`app.py`). A `.env` with synthetic AWS keys + GitHub PAT is **staged but not committed** (the user is "about to commit"). | `ggshield secret scan pre-commit` → AWS Keys + GitHub PAT in `.env` |
| `eval-2-aws-key-history-hunt` | Git repo with 4 commits. Commit 2 ("add s3 uploader config", author alice) leaks an AWS key in `config.py`. Commit 4 ("move secrets to env vars") replaces the literal with `REPLACED_USE_ENV_VAR`. HEAD is clean; secret survives only in history. | `ggshield secret scan repo .` → AWS Keys in commit 2's `config.py` |
| `eval-3-ambiguous-project-scan` | Git repo, single commit. Secrets in `src/db.py` (Postgres URL with embedded password), `src/api.py` (Stripe live key), and `.env` (GitHub PAT). | `ggshield secret scan path -r .` → three detections across the working tree |

## CI sanity check

```bash
ggshield secret scan path -r -y skills/scan-secrets/evals/files
```

Should report `No secrets have been found`. If this fires, something landed
in a committed file that wasn't supposed to — investigate before merging.
