#!/usr/bin/env bash
# One full evaluation: reset, run the agent headlessly, check the result.
#   ./run-eval.sh [model] [runs]
set -uo pipefail
cd "$(dirname "$0")"
MODEL="${1:-qwen2.5-coder:7b-instruct-q4_K_M}"
RUNS="${2:-1}"
DEFAULT_REQUEST="Fix the type errors in report/format.py and the division-by-zero crashes in calc/stats.py so that src/main.py runs without errors. All the files are inside the inventory-app directory."
REQUEST="${3:-$DEFAULT_REQUEST}"

pass=0
for i in $(seq 1 "$RUNS"); do
  echo "================ run $i/$RUNS  $MODEL ================"
  ./reset.sh > /dev/null
  node -r ./sqlite-stub.cjs runner.cjs "$MODEL" "$PWD/workspace" "$REQUEST"
  ended=$?
  score=$(python3 verify.py | grep "checks passed")
  echo "verify: $score | ended by task_complete: $([ $ended -eq 0 ] && echo yes || echo no)"
  [ "$score" = "8/8 checks passed" ] && pass=$((pass + 1))
done
echo
echo "$pass/$RUNS runs fixed the fixture completely"
