#!/usr/bin/env bash
# Build the `aws-key-history-hunt` fixture: a git repo with a 4-commit
# history where commit 2 introduced an AWS key in config.py and commit 4
# replaced it with a placeholder. HEAD is clean; the secret is only
# reachable via `ggshield secret scan repo`.
#
# Usage:
#   bash setup.sh                  # builds into ./_built/ next to this script
#   bash setup.sh /tmp/eval-2      # builds into the given target directory
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$SCRIPT_DIR/_built}"

# shellcheck source=../_shared/secrets.env
source "$SCRIPT_DIR/../_shared/secrets.env"

rm -rf "$TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

git init -q

# Commit 1 — initial (clean).
cat > README.md <<'MD'
# my-service
MD
git add README.md
git -c user.email=t@example.com -c user.name=t commit -q -m "initial commit"

# Commit 2 — alice leaks the AWS key. Values come from _shared/secrets.env;
# the file written here does not carry ggignore, so the secret will be
# detected when the agent scans history.
cat > config.py <<EOF
# legacy config
AWS_ACCESS_KEY = "$LEAKY_AWS_KEY"
AWS_SECRET = "$LEAKY_AWS_SECRET"
S3_BUCKET = "prod-uploads"
EOF
git add config.py
git -c user.email=alice@example.com -c user.name=alice commit -q -m "add s3 uploader config"

# Commit 3 — unrelated change by bob (provides realistic "last sprint" noise
# the user has to scan past to find the leak).
cat > app.py <<'PY'
def upload(): pass
PY
git add app.py
git -c user.email=bob@example.com -c user.name=bob commit -q -m "wire up upload handler"

# Commit 4 — alice "fixes" by replacing literals with placeholders. HEAD is
# now clean; the secret survives only in git history.
cat > config.py <<'PY'
# legacy config
AWS_ACCESS_KEY = "REPLACED_USE_ENV_VAR"
AWS_SECRET = "REPLACED_USE_ENV_VAR"
S3_BUCKET = "prod-uploads"
PY
git add config.py
git -c user.email=alice@example.com -c user.name=alice commit -q -m "move secrets to env vars"

echo "Built fixture at $TARGET"
echo "History:"
git log --oneline
