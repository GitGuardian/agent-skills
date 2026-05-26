#!/usr/bin/env bash
# Build the `ambiguous-project-scan` fixture: a small single-commit project
# with three different secret types planted across `src/db.py`, `src/api.py`,
# and a committed `.env`. The user's eval prompt is the deliberately
# ambiguous "can you scan my project for secrets" — no scope specified.
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-3      # builds into the given target directory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/_built}"

# shellcheck source=../_shared/secrets.env
source "$SCRIPT_DIR/../_shared/secrets.env"

rm -rf "$TARGET"
mkdir -p "$TARGET/src"
cd "$TARGET"

# Postgres URL with the password embedded inline — ggshield's PostgreSQL
# credentials detector should flag the full URL.
cat > src/db.py <<EOF
DB_URL = "postgres://user:$LEAKY_DB_PASSWORD@db.example.com:5432/app"
EOF

# Stripe live secret key.
cat > src/api.py <<EOF
STRIPE_KEY = "$LEAKY_STRIPE_KEY"
def charge(): pass
EOF

# GitHub PAT in a committed .env (different from eval-1 where .env is staged
# but not committed — here the user has already committed it).
cat > .env <<EOF
GITHUB_TOKEN=$LEAKY_GITHUB_PAT
EOF

git init -q
git config user.email "dev@example.com"
git config user.name "dev"
git add -f .  # -f to bypass any global gitignore on .env
git commit -q -m "initial"

echo "Built fixture at $TARGET"
echo "Tracked files:"
git ls-files
