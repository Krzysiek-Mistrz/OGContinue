#!/usr/bin/env bash
# Regenerates a small but working project, unlike agent-eval's broken one
# or agent-eval-scaffold's empty one. The point here is neither fixing nor
# scaffolding - it's adding a feature to something that already works

set -euo pipefail
cd "$(dirname "$0")"
rm -rf workspace
mkdir -p workspace/todo_cli

cat > workspace/todo_cli/storage.py <<'PY'
import json
import os


def load_tasks(path):
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        return json.load(f)


def save_tasks(path, tasks):
    with open(path, "w") as f:
        json.dump(tasks, f, indent=2)
PY

cat > workspace/todo_cli/cli.py <<'PY'
def add_task(tasks, text):
    tasks.append({"text": text, "done": False})
    return tasks
PY

cat > workspace/main.py <<'PY'
from todo_cli.cli import add_task
from todo_cli.storage import load_tasks, save_tasks

TASKS_PATH = "tasks.json"


def main():
    tasks = load_tasks(TASKS_PATH)
    tasks = add_task(tasks, "buy milk")
    save_tasks(TASKS_PATH, tasks)
    print(load_tasks(TASKS_PATH))


if __name__ == "__main__":
    main()
PY

echo "workspace reset - a working todo_cli project, nothing broken, nothing missing"
