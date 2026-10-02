#!/usr/bin/env python3
"""Checks whether an agent run actually scaffolded the requested project.

Every check is a behavioural assertion against the code the agent created,
never a match on file names or how it phrased anything, so any layout that
actually works passes and one that merely looks plausible fails.
"""

import importlib.util
import os
import subprocess
import sys

WORKSPACE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workspace")
APP = WORKSPACE


def load(module_path, name):
    spec = importlib.util.spec_from_file_location(name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check(description, fn):
    try:
        fn()
    except Exception as exc:
        print(f"FAIL  {description}\n        {type(exc).__name__}: {exc}")
        return False
    print(f"pass  {description}")
    return True


def main():
    if not os.path.isdir(APP):
        print("workspace missing - run ./reset.sh first")
        return 1

    results = []
    storage_path = os.path.join(APP, "todo_cli", "storage.py")
    cli_path = os.path.join(APP, "todo_cli", "cli.py")
    main_path = os.path.join(APP, "main.py")

    results.append(
        check("todo_cli/storage.py was created", lambda: _must_exist(storage_path))
    )
    results.append(
        check("todo_cli/cli.py was created", lambda: _must_exist(cli_path))
    )
    results.append(check("main.py was created", lambda: _must_exist(main_path)))

    TOTAL_CHECKS = 7
    if not all(results):
        passed = sum(1 for r in results if r)
        print(f"\n{passed}/{TOTAL_CHECKS} checks passed")
        return 1

    storage = load(storage_path, "storage")
    cli = load(cli_path, "cli")

    tasks_file = os.path.join(APP, "tasks.json")

    def round_trip():
        tasks = storage.load_tasks(tasks_file)
        tasks = cli.add_task(tasks, "buy milk")
        storage.save_tasks(tasks_file, tasks)
        reloaded = storage.load_tasks(tasks_file)
        if not any(t.get("text") == "buy milk" for t in reloaded):
            raise AssertionError(f"'buy milk' missing from reloaded tasks: {reloaded}")

    results.append(
        check(
            "storage.load_tasks survives a missing tasks.json",
            lambda: storage.load_tasks(os.path.join(APP, "does-not-exist.json")),
        )
    )
    results.append(
        check("cli.add_task + storage round-trip through disk", round_trip)
    )

    run = subprocess.run(
        [sys.executable, main_path],
        capture_output=True,
        text=True,
        cwd=APP,
    )
    results.append(check("main.py runs to completion", lambda: _zero(run)))
    results.append(
        check(
            "main.py prints the task it added",
            lambda: _contains(run.stdout, "buy milk"),
        )
    )

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} checks passed")
    if run.returncode != 0:
        print("\n--- main.py stderr ---")
        print(run.stderr.strip())
    return 0 if passed == len(results) else 1


def _must_exist(path):
    if not os.path.isfile(path):
        raise AssertionError(f"{path} was not created")


def _contains(actual, needle):
    if needle not in str(actual):
        raise AssertionError(f"{needle!r} missing from {actual!r}")


def _zero(run):
    if run.returncode != 0:
        raise AssertionError(f"exited {run.returncode}")


if __name__ == "__main__":
    sys.exit(main())
