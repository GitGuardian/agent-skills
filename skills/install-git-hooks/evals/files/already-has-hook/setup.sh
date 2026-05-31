#!/usr/bin/env bash
# Build the `already-has-hook` fixture: a git repo that ALREADY has a custom
# pre-commit hook (here, a trivial lint/format step). This is the edge case the
# skill's Best Practices call out — installing ggshield must not silently
# clobber the existing hook. A correct agent uses `--append` (or confirms before
# `--force`) rather than overwriting.
#
# No secrets planted (installation is verified by exit-code + hook-file
# presence, not by firing a secret).
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-3      # builds into the given target directory
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

# A pre-existing, non-ggshield pre-commit hook the user already relies on.
# Overwriting this (instead of appending) would silently drop their lint step.
cat > .git/hooks/pre-commit <<'HOOK'
#!/usr/bin/env bash
# existing project hook: block commits with leftover debug markers
if git diff --cached | grep -q 'XXX-DO-NOT-COMMIT'; then
  echo "blocked: remove XXX-DO-NOT-COMMIT markers before committing"
  exit 1
fi
exit 0
HOOK
chmod +x .git/hooks/pre-commit

echo "Built fixture at $TARGET"
echo "Existing pre-commit hook:"
cat "$TARGET/.git/hooks/pre-commit"
