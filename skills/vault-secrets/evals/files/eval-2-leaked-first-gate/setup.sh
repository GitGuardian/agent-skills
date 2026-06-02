#!/usr/bin/env bash
# Build the leaked-first-gate fixture: a git repo where .env WAS committed
# (and thus is in history). `git log --all -- .env` returns commits, so the
# leaked-first gate must fire: rotate before vaulting.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/_built}"
# shellcheck source=../_shared/secrets.env
source "$SCRIPT_DIR/../_shared/secrets.env"
rm -rf "$TARGET"; mkdir -p "$TARGET"; cd "$TARGET"
git init -q; git config user.email "dev@example.com"; git config user.name "dev"
cat > .env <<EOF
GITHUB_TOKEN=$LEAKY_GITHUB_PAT
EOF
git add .env; git commit -q -m "add env (the mistake this fixture models)"
echo "Built fixture at $TARGET"
echo "Leaked-first gate (should list a commit — .env was committed):"
git log --all --oneline -- .env
