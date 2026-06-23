#!/usr/bin/env bash
# Build the `install-claude-code` fixture: a minimal, clean git repo standing in
# for a project where the user wants their AI coding tool (Claude Code) to scan
# for secrets. The task is purely to install the claude-code AI-assistant hook —
# there is nothing to remediate and no git hook is wanted.
#
# No secrets are planted: this skill verifies a hook by exit-code + config-entry
# presence, not by firing a test secret.
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-4      # builds into the given target directory
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
echo "No .claude/settings.json yet (expect the agent to create/modify it):"
ls "$TARGET/.claude/settings.json" 2>/dev/null || echo "(none)"
