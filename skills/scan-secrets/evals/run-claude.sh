#!/usr/bin/env bash
# Run scan-secrets evals against Claude Code.
#
# Reads `targets.json` for the list of Claude models to sweep (or accepts
# an explicit --models override). For each model × each test case in
# evals.json:
#   1. Build the fixture by running its setup.sh into a fresh _built/ dir.
#   2. Run `claude -p --plugin-dir <repo>` inside the fixture with the
#      test prompt and the selected model.
#   3. Capture events.jsonl (stream-json), last_message.txt (the final
#      result text), and timing.json (usage + wall-clock duration).
#
# Output layout:
#   $OUT_DIR/<model>/eval-<id>-<name>/with_skill/
#     _built/              fixture as built by setup.sh
#     events.jsonl         raw claude --output-format stream-json
#     last_message.txt     final result text
#     timing.json          { usage, duration_ms, model, config, exit_code }
#     stderr.log           claude stderr
#
# Scope: this driver captures only the "with_skill" configuration. The
# "without_skill" baseline is harder to produce in Claude Code from a
# script — global plugins, ~/.claude/CLAUDE.md, agent files, and auto-
# memory all influence the agent and aren't toggleable via a single flag.
# Run the baseline manually via skill-creator's harness when needed.
#
# Grading and aggregation are out of scope. This script only captures runs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVALS_JSON="$SCRIPT_DIR/evals.json"
TARGETS_JSON="$SCRIPT_DIR/targets.json"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ONLY_EVAL=""
MODELS_OVERRIDE=""
OUT_DIR="$REPO_ROOT/scan-secrets-workspace/claude/iteration-1"

usage() {
  cat <<EOF
Usage: $0 [--eval <id>] [--models <list>] [--out <dir>]

  --eval <id>      Run only one test case (matches .evals[].id). Default: all.
  --models <list>  Comma-separated model IDs to sweep. Default: read from
                   targets.json's .claude key.
                   Example: --models claude-sonnet-4-6,claude-haiku-4-5-20251001
  --out <dir>      Output directory. Default: \$REPO_ROOT/scan-secrets-workspace/claude/iteration-1.

The driver invokes \`claude -p --plugin-dir <repo>\` so the eval always
runs against the in-tree version of the skill (not the published one).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval)    ONLY_EVAL="$2"; shift 2 ;;
    --models)  MODELS_OVERRIDE="$2"; shift 2 ;;
    --out)     OUT_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v claude >/dev/null || { echo "claude CLI not on PATH" >&2; exit 1; }
command -v jq     >/dev/null || { echo "jq not on PATH" >&2; exit 1; }
[[ -f "$EVALS_JSON" ]]   || { echo "evals.json not found at $EVALS_JSON" >&2; exit 1; }
[[ -f "$TARGETS_JSON" ]] || { echo "targets.json not found at $TARGETS_JSON" >&2; exit 1; }

# Resolve model list — --models flag wins, else targets.json's .claude
if [[ -n "$MODELS_OVERRIDE" ]]; then
  IFS=',' read -ra MODEL_LIST <<<"$MODELS_OVERRIDE"
else
  mapfile -t MODEL_LIST < <(jq -r '.claude[]?' "$TARGETS_JSON")
fi
[[ ${#MODEL_LIST[@]} -ge 1 && -n "${MODEL_LIST[0]}" ]] || {
  echo "no Claude models to sweep — check targets.json's .claude array or pass --models" >&2
  exit 1
}

mkdir -p "$OUT_DIR"

if [[ -n "$ONLY_EVAL" ]]; then
  EVAL_IDS="$ONLY_EVAL"
else
  EVAL_IDS=$(jq -r '.evals[].id' "$EVALS_JSON")
fi

CONFIG_LABEL="with_skill"

for MODEL in "${MODEL_LIST[@]}"; do
  MODEL="${MODEL// /}"
  [[ -n "$MODEL" ]] || continue

  for id in $EVAL_IDS; do
    name=$(jq -r ".evals[] | select(.id==$id) | .name // empty" "$EVALS_JSON")
    prompt=$(jq -r ".evals[] | select(.id==$id) | .prompt // empty" "$EVALS_JSON")
    fixture_rel=$(jq -r ".evals[] | select(.id==$id) | .files[0] // empty" "$EVALS_JSON")

    [[ -n "$name" && -n "$prompt" && -n "$fixture_rel" ]] || {
      echo "eval $id missing name/prompt/files in evals.json" >&2; exit 1; }

    fixture_dir="$SKILL_ROOT/$fixture_rel"
    setup_sh="$fixture_dir/setup.sh"
    [[ -f "$setup_sh" ]] || { echo "setup.sh not found at $setup_sh" >&2; exit 1; }

    work_dir="$OUT_DIR/$MODEL/eval-$id-$name/$CONFIG_LABEL"
    built_dir="$work_dir/_built"
    events="$work_dir/events.jsonl"
    last_msg="$work_dir/last_message.txt"
    stderr_log="$work_dir/stderr.log"
    timing="$work_dir/timing.json"

    echo "[$CONFIG_LABEL] model=$MODEL eval $id ($name)"
    echo "  -> $work_dir"

    mkdir -p "$work_dir"
    bash "$setup_sh" "$built_dir" >/dev/null

    start_ms=$(($(date +%s%N) / 1000000))
    set +e
    ( cd "$built_dir" && claude -p \
        --plugin-dir "$REPO_ROOT" \
        --model "$MODEL" \
        --output-format stream-json \
        --verbose \
        --permission-mode bypassPermissions \
        --no-session-persistence \
        "$prompt" ) \
        >"$events" 2>"$stderr_log"
    rc=$?
    set -e
    end_ms=$(($(date +%s%N) / 1000000))

    # Stream-json emits a terminal `result` event carrying usage + final text.
    usage_json=$(jq -s 'map(select(.type=="result")) | .[-1].usage // null' "$events" 2>/dev/null || echo null)
    result_text=$(jq -rs 'map(select(.type=="result")) | .[-1].result // ""' "$events" 2>/dev/null || true)
    [[ -n "$result_text" ]] && printf '%s\n' "$result_text" > "$last_msg"

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
done
