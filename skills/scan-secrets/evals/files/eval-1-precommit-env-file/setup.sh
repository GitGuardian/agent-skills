#!/usr/bin/env bash
# Build the `precommit-env-file` fixture: a git repo with one committed file
# (app.py) and a staged-but-uncommitted `.env` containing synthetic AWS keys
# and a GitHub PAT — the situation a user faces just before running
# `git commit` with a `.env` they didn't realize was staged.
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-1      # builds into the given target directory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/_built}"

# shellcheck source=../_shared/secrets.env
source "$SCRIPT_DIR/../_shared/secrets.env"

rm -rf "$TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

git init -q
git config user.email "dev@example.com"
git config user.name "dev"

cat > app.py <<'PY'
import os
AWS_KEY = os.environ["AWS_ACCESS_KEY_ID"]
def upload(): pass
PY

git add app.py
git commit -q -m "initial"

# Write the leaky .env — values come from _shared/secrets.env, but the file
# we write here does NOT carry the ggignore comments, so ggshield will flag
# both secrets when the agent scans the fixture.
cat > .env <<EOF
# local dev secrets — about to add to repo
AWS_ACCESS_KEY_ID=$LEAKY_AWS_KEY
AWS_SECRET_ACCESS_KEY=$LEAKY_AWS_SECRET
GITHUB_TOKEN=$LEAKY_GITHUB_PAT
EOF

# Force-add to bypass the user's global gitignore (which often excludes .env).
git add -f .env

echo "Built fixture at $TARGET"
echo "Staged for commit:"
git status --short
