#!/usr/bin/env bash
# One full evaluation: reset, run the agent headlessly, check the result.
#   ./run-eval.sh [model] [runs]
#
# Reuses agent-eval/'s compiled runner.cjs, same as agent-eval-scaffold/.

set -uo pipefail
cd "$(dirname "$0")"
MODEL="${1:-qwen2.5-coder:7b-instruct-q4_K_M}"
RUNS="${2:-1}"
DEFAULT_REQUEST="Add input validation to the todo app: create todo_cli/validation.py with a function is_valid_task_text(text) that returns False for an empty or whitespace-only string and True otherwise, then update add_task in todo_cli/cli.py to call it and raise a ValueError if the text is invalid, before adding the task."
REQUEST="${3:-$DEFAULT_REQUEST}"

pass=0
for i in $(seq 1 "$RUNS"); do
  echo "================ run $i/$RUNS  $MODEL ================"
  ./reset.sh > /dev/null
  node -r ../agent-eval/sqlite-stub.cjs ../agent-eval/runner.cjs "$MODEL" "$PWD/workspace" "$REQUEST"
  ended=$?
  score=$(python3 verify.py | grep "checks passed")
  echo "verify: $score | ended by task_complete: $([ $ended -eq 0 ] && echo yes || echo no)"
  [ "$score" = "9/9 checks passed" ] && pass=$((pass + 1))
done
echo
echo "$pass/$RUNS runs added the feature completely"
