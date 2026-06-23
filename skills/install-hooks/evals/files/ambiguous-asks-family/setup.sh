#!/usr/bin/env bash
# Build the `ambiguous-asks-family` fixture: a minimal, clean git repo. The eval
# prompt deliberately says only "install hooks" with no family keyword, so the
# correct behavior is for the agent to STOP and ask which hook family (git vs
# AI-assistant) before installing anything. The repo content is irrelevant — the
# eval grades the clarifying question, not an install.
#
# No secrets are planted.
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-5      # builds into the given target directory
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
def upload(): pass
PY

git add app.py
git commit -q -m "initial"

echo "Built fixture at $TARGET"
