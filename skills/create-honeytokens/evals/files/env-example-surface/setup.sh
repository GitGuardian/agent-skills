#!/usr/bin/env bash
# Build the `env-example-surface` fixture: a repo about to be open-sourced,
# with an `.env.example` holding only placeholders. The eval asks the agent to
# add a honeytoken to it — the planting surface is explicit, so a correct
# agent proceeds (scope check, bare `create`, meaningful description) without
# re-asking where to plant.
#
# No secrets planted — the placeholders are inert strings.
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

cat > .env.example <<'ENV'
# Copy to .env and fill in your own values
DATABASE_URL=postgres://user:password@localhost:5432/app
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
SMTP_PASSWORD=your-smtp-password
ENV

cat > app.py <<'PY'
import os

def s3_client():
    key = os.environ["AWS_ACCESS_KEY_ID"]
    secret = os.environ["AWS_SECRET_ACCESS_KEY"]
    return key, secret
PY

git add .env.example app.py
git commit -q -m "prepare repo for open-sourcing"

echo "Built fixture at $TARGET"
