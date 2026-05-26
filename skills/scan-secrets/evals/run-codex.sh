#!/usr/bin/env bash
# Run scan-secrets evals against Codex.
#
# For each test case in evals.json:
#   1. Build the fixture by running its setup.sh into a fresh _built/ dir.
#   2. Run `codex exec --json` inside the fixture with the eval prompt.
#   3. Capture events.jsonl, the last message, and timing.json (final
#      turn.completed.usage plus wall-clock duration).
#
# Skill toggle:
#   default                  → uses your current $CODEX_HOME (plugin installed)
#   --no-skill               → swaps to $CODEX_HOME_NO_SKILL (must be a
#                              codex home without the gitguardian plugin)
#
# Output layout:
#   $OUT_DIR/eval-<id>-<name>/{with_skill|without_skill}/
#     _built/              fixture as built by setup.sh
#     events.jsonl         raw codex --json stream
#     last_message.txt     final agent reply
#     timing.json          { usage, duration_ms, model, config, exit_code }
#     stderr.log           codex stderr
#
# Grading and aggregation are intentionally out of scope here — this script
# only captures runs. Wire grading on top once we know what the outputs
# actually look like.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVALS_JSON="$SCRIPT_DIR/evals.json"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

MODEL="gpt-5"
NO_SKILL=0
ONLY_EVAL=""
OUT_DIR="$REPO_ROOT/scan-secrets-workspace/codex/iteration-1"

usage() {
  cat <<EOF
Usage: $0 [--eval <id>] [--no-skill] [--model <id>] [--out <dir>]

  --eval <id>    Run only one test case (matches .evals[].id). Default: all.
  --no-skill     Swap CODEX_HOME to \$CODEX_HOME_NO_SKILL (a codex home
                 without the gitguardian plugin). Default: with skill.
  --model <id>   Codex model. Default: $MODEL.
  --out <dir>    Output directory. Default: \$REPO_ROOT/scan-secrets-workspace/codex/iteration-1.

One-time setup of a skill-off codex home:
  CODEX_HOME=~/.codex-skill-off codex plugin marketplace add GitGuardian/agent-skills
  # then do NOT \`codex plugin add\` — leaves the plugin available but uninstalled
  export CODEX_HOME_NO_SKILL=~/.codex-skill-off
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval)     ONLY_EVAL="$2"; shift 2 ;;
    --no-skill) NO_SKILL=1; shift ;;
    --model)    MODEL="$2"; shift 2 ;;
    --out)      OUT_DIR="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v codex >/dev/null || { echo "codex not on PATH" >&2; exit 1; }
command -v jq    >/dev/null || { echo "jq not on PATH" >&2; exit 1; }
[[ -f "$EVALS_JSON" ]] || { echo "evals.json not found at $EVALS_JSON" >&2; exit 1; }

if [[ $NO_SKILL -eq 1 ]]; then
  [[ -n "${CODEX_HOME_NO_SKILL:-}" ]] || {
    echo "--no-skill requires CODEX_HOME_NO_SKILL env var (see --help)" >&2
    exit 1
  }
  export CODEX_HOME="$CODEX_HOME_NO_SKILL"
  CONFIG_LABEL="without_skill"
else
  CONFIG_LABEL="with_skill"
fi

# Sanity-check plugin state matches the toggle. Catches the "forgot to
# CODEX_HOME=" footgun before burning tokens.
if codex plugin list 2>/dev/null \
   | grep -q "gitguardian@gitguardian-agent-skills.*installed, enabled"; then
  PLUGIN_PRESENT=1
else
  PLUGIN_PRESENT=0
fi
if [[ $NO_SKILL -eq 1 && $PLUGIN_PRESENT -eq 1 ]]; then
  echo "ERROR: --no-skill set but gitguardian plugin is installed+enabled in" \
       "CODEX_HOME=$CODEX_HOME" >&2
  exit 1
fi
if [[ $NO_SKILL -eq 0 && $PLUGIN_PRESENT -eq 0 ]]; then
  echo "ERROR: skill expected but gitguardian plugin not installed in" \
       "CODEX_HOME=${CODEX_HOME:-default}" >&2
  echo "       install with: codex plugin add gitguardian@gitguardian-agent-skills" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

if [[ -n "$ONLY_EVAL" ]]; then
  EVAL_IDS="$ONLY_EVAL"
else
  EVAL_IDS=$(jq -r '.evals[].id' "$EVALS_JSON")
fi

for id in $EVAL_IDS; do
  name=$(jq -r ".evals[] | select(.id==$id) | .name // empty" "$EVALS_JSON")
  prompt=$(jq -r ".evals[] | select(.id==$id) | .prompt // empty" "$EVALS_JSON")
  fixture_rel=$(jq -r ".evals[] | select(.id==$id) | .files[0] // empty" "$EVALS_JSON")

  [[ -n "$name" && -n "$prompt" && -n "$fixture_rel" ]] || {
    echo "eval $id missing name/prompt/files in evals.json" >&2; exit 1; }

  # files[0] is relative to the skill root (e.g. evals/files/eval-1-…/)
  fixture_dir="$SKILL_ROOT/$fixture_rel"
  setup_sh="$fixture_dir/setup.sh"
  [[ -f "$setup_sh" ]] || { echo "setup.sh not found at $setup_sh" >&2; exit 1; }

  work_dir="$OUT_DIR/eval-$id-$name/$CONFIG_LABEL"
  built_dir="$work_dir/_built"
  events="$work_dir/events.jsonl"
  last_msg="$work_dir/last_message.txt"
  stderr_log="$work_dir/stderr.log"
  timing="$work_dir/timing.json"

  echo "[$CONFIG_LABEL] eval $id ($name) model=$MODEL"
  echo "  -> $work_dir"

  mkdir -p "$work_dir"
  bash "$setup_sh" "$built_dir" >/dev/null

  start_ms=$(($(date +%s%N) / 1000000))
  set +e
  ( cd "$built_dir" && codex exec --json -m "$MODEL" -s workspace-write \
      --skip-git-repo-check -o "$last_msg" "$prompt" ) \
      >"$events" 2>"$stderr_log"
  rc=$?
  set -e
  end_ms=$(($(date +%s%N) / 1000000))

  usage_json=$(jq -s 'map(select(.type=="turn.completed")) | .[-1].usage // null' "$events" 2>/dev/null || echo null)
  jq -n \
    --argjson usage "$usage_json" \
    --argjson duration_ms $((end_ms - start_ms)) \
    --arg     model "$MODEL" \
    --arg     config "$CONFIG_LABEL" \
    --argjson exit_code $rc \
    '{usage:$usage, duration_ms:$duration_ms, model:$model, config:$config, exit_code:$exit_code}' \
    > "$timing"

  if [[ $rc -ne 0 ]]; then
    echo "  exit code $rc — see $stderr_log"
  fi
done
