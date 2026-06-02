#!/usr/bin/env bash
# Build the env-at-rest fixture: a git repo where .env is present in the
# working tree but NEVER committed (gitignored, absent from history). The
# leaked-first gate (`git log --all -- .env`) returns nothing, so vaulting
# can proceed. The app reads vars from the environment (direnv-friendly).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/_built}"
# shellcheck source=../_shared/secrets.env
source "$SCRIPT_DIR/../_shared/secrets.env"
rm -rf "$TARGET"; mkdir -p "$TARGET"; cd "$TARGET"
git init -q; git config user.email "dev@example.com"; git config user.name "dev"
printf '.env\n' > .gitignore
cat > app.py <<'PY'
import os
AWS_ACCESS_KEY_ID = os.environ["AWS_ACCESS_KEY_ID"]
AWS_SECRET_ACCESS_KEY = os.environ["AWS_SECRET_ACCESS_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]
def main():
    print("app running")
PY
git add .gitignore app.py; git commit -q -m "initial"
cat > .env <<EOF
# local dev — never committed, but sitting in plaintext on disk
AWS_ACCESS_KEY_ID=$LEAKY_AWS_KEY
AWS_SECRET_ACCESS_KEY=$LEAKY_AWS_SECRET
DATABASE_URL=postgres://appuser:${LEAKY_DB_PASSWORD}@db.example.com:5432/mydb
EOF
echo "Built fixture at $TARGET"
echo "Leaked-first gate (should be empty — .env never committed):"
git log --all -- .env
