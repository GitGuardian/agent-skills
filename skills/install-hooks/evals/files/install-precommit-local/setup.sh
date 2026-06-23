#!/usr/bin/env bash
# Build the `install-precommit-local` fixture: a minimal, clean git repo with a
# single committed file. It is the situation a user faces when they want to add
# secret-blocking to a repo from day one — there is nothing to remediate yet,
# the task is purely to install a pre-commit hook.
#
# No secrets are planted: this skill verifies a hook by exit-code + hook-file
# presence, not by firing a test secret, so the fixture needs no detectable
# credential and no _shared/secrets.env.
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-1      # builds into the given target directory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/_built}"

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

echo "Built fixture at $TARGET"
echo "Hooks present (expect none beyond git samples):"
ls "$TARGET/.git/hooks/" | grep -v '\.sample$' || echo "(no active hooks)"
