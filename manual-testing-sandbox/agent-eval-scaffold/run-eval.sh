#!/usr/bin/env bash
# One full evaluation: reset, run the agent headlessly, check the result.
#   ./run-eval.sh [model] [runs]
#
# Reuses agent-eval/'s compiled runner.cjs instead of duplicating the
# ~22MB bundle for a second scenario

set -uo pipefail
cd "$(dirname "$0")"
MODEL="${1:-qwen2.5-coder:7b-instruct-q4_K_M}"
RUNS="${2:-1}"
DEFAULT_REQUEST="Set up a new Python todo-list project with this structure: todo_cli/storage.py (functions load_tasks(path) that returns a list, reading a JSON file and returning an empty list if it doesn't exist yet, and save_tasks(path, tasks) that writes the list to that path as JSON, creating the file if it doesn't exist), todo_cli/cli.py (a function add_task(tasks, text) that returns a new list with {\"text\": text, \"done\": False} appended), and main.py at the workspace root that loads the tasks, adds 'buy milk' with add_task, saves them, reloads them, and prints the reloaded list so it runs without errors."
REQUEST="${3:-$DEFAULT_REQUEST}"

pass=0
for i in $(seq 1 "$RUNS"); do
  echo "================ run $i/$RUNS  $MODEL ================"
  ./reset.sh > /dev/null
  node -r ../agent-eval/sqlite-stub.cjs ../agent-eval/runner.cjs "$MODEL" "$PWD/workspace" "$REQUEST"
  ended=$?
  score=$(python3 verify.py | grep "checks passed")
  echo "verify: $score | ended by task_complete: $([ $ended -eq 0 ] && echo yes || echo no)"
  [ "$score" = "7/7 checks passed" ] && pass=$((pass + 1))
done
echo
echo "$pass/$RUNS runs scaffolded the project completely"
