#!/usr/bin/env python3
"""Checks whether an agent run actually added the requested feature.

Every check is a behavioural assertion, never a match on how anything is
written. Two things have to both be true: the new feature works, and the
existing, already-working code wasn't broken along the way.
"""

import importlib
import os
import subprocess
import sys

WORKSPACE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workspace")


def load(dotted_name):
    # real sibling of validation.py in the same package, the same way
    # main.py already imports todo_cli.cli. Loading cli.py as a standalone
    # file breaks that import even though the model wrote perfectly correct code
    
    if WORKSPACE not in sys.path:
        sys.path.insert(0, WORKSPACE)
    for mod in [m for m in sys.modules if m == "todo_cli" or m.startswith("todo_cli.")]:
        del sys.modules[mod]
    return importlib.import_module(dotted_name)


def check(description, fn):
    try:
        fn()
    except Exception as exc:
        print(f"FAIL  {description}\n        {type(exc).__name__}: {exc}")
        return False
    print(f"pass  {description}")
    return True


def main():
    if not os.path.isdir(WORKSPACE):
        print("workspace missing - run ./reset.sh first")
        return 1

    validation_path = os.path.join(WORKSPACE, "todo_cli", "validation.py")
    main_path = os.path.join(WORKSPACE, "main.py")

    results = []
    results.append(
        check("todo_cli/validation.py was created", lambda: _must_exist(validation_path))
    )
    if not results[-1]:
        print("\n0/9 checks passed")
        return 1

    # A bad import style check
    modules = {}

    def _import(dotted):
        modules[dotted] = load(dotted)

    results.append(
        check("todo_cli/validation.py imports cleanly", lambda: _import("todo_cli.validation"))
    )
    results.append(
        check("todo_cli/cli.py imports cleanly", lambda: _import("todo_cli.cli"))
    )
    validation = modules.get("todo_cli.validation")
    cli = modules.get("todo_cli.cli")

    results.append(
        check(
            "is_valid_task_text rejects an empty string",
            lambda: _false(_require(validation, "validation").is_valid_task_text("")),
        )
    )
    results.append(
        check(
            "is_valid_task_text rejects a whitespace-only string",
            lambda: _false(_require(validation, "validation").is_valid_task_text("   ")),
        )
    )
    results.append(
        check(
            "is_valid_task_text accepts real text",
            lambda: _true(_require(validation, "validation").is_valid_task_text("buy milk")),
        )
    )
    results.append(
        check(
            "cli.add_task now rejects invalid text",
            lambda: _raises(_require(cli, "cli").add_task, [], "   "),
        )
    )
    results.append(
        check(
            "cli.add_task still accepts valid text (existing behaviour intact)",
            lambda: _eq(
                _require(cli, "cli").add_task([], "buy milk"),
                [{"text": "buy milk", "done": False}],
            ),
        )
    )

    run = subprocess.run(
        [sys.executable, main_path],
        capture_output=True,
        text=True,
        cwd=WORKSPACE,
    )
    results.append(
        check(
            "main.py still runs to completion and prints the task (regression check)",
            lambda: _zero_and_contains(run, "buy milk"),
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


def _require(module, name):
    if module is None:
        raise AssertionError(f"todo_cli.{name} failed to import - see the import check above")
    return module


def _true(actual):
    if not actual:
        raise AssertionError(f"expected truthy, got {actual!r}")


def _false(actual):
    if actual:
        raise AssertionError(f"expected falsy, got {actual!r}")


def _eq(actual, expected):
    if actual != expected:
        raise AssertionError(f"expected {expected!r}, got {actual!r}")


def _raises(fn, *args):
    try:
        fn(*args)
    except Exception:
        return
    raise AssertionError("expected an exception, none was raised")


def _zero_and_contains(run, needle):
    if run.returncode != 0:
        raise AssertionError(f"exited {run.returncode}")
    if needle not in run.stdout:
        raise AssertionError(f"{needle!r} missing from {run.stdout!r}")


if __name__ == "__main__":
    sys.exit(main())
