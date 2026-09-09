#!/usr/bin/env python3
"""Checks whether an agent run actually fixed the fixture.

Every check is a behavioural assertion against the code the agent left behind,
never a match on how it phrased the fix, so a correct fix written any way at
all passes and a plausible-looking one that doesn't work fails.
"""
import importlib.util
import os
import subprocess
import sys

WORKSPACE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workspace")
APP = os.path.join(WORKSPACE, "inventory-app")


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

    stats = load(os.path.join(APP, "lib", "calc", "stats.py"), "stats")
    fmt = load(os.path.join(APP, "src", "report", "format.py"), "fmt")

    results = []

    results.append(
        check(
            "average_price still averages a normal list",
            lambda: _eq(stats.average_price([2.0, 4.0]), 3.0),
        )
    )
    results.append(
        check(
            "average_price survives an empty list",
            lambda: stats.average_price([]),
        )
    )
    results.append(
        check(
            "price_spread still works on a normal list",
            lambda: _eq(stats.price_spread([2.0, 4.0]), 1.0),
        )
    )
    results.append(
        check(
            "price_spread survives an empty list",
            lambda: stats.price_spread([]),
        )
    )
    results.append(
        check(
            "format_line accepts a number for quantity and price",
            lambda: _contains(fmt.format_line("widget", 3, 4.5), "widget"),
        )
    )
    results.append(
        check(
            "format_total accepts a number for amount",
            lambda: _contains(fmt.format_total("Average", 9.08), "Average"),
        )
    )

    run = subprocess.run(
        [sys.executable, os.path.join(APP, "src", "main.py")],
        capture_output=True,
        text=True,
    )
    results.append(
        check(
            "main.py runs to completion",
            lambda: _zero(run),
        )
    )
    results.append(
        check(
            "main.py still reports every item and both statistics",
            lambda: _all_in(run.stdout, ["widget", "gasket", "flange", "Average", "Spread"]),
        )
    )

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} checks passed")
    if run.returncode != 0:
        print("\n--- main.py stderr ---")
        print(run.stderr.strip())
    return 0 if passed == len(results) else 1


def _eq(actual, expected):
    if actual != expected:
        raise AssertionError(f"expected {expected}, got {actual}")


def _contains(actual, needle):
    if needle not in str(actual):
        raise AssertionError(f"{needle!r} missing from {actual!r}")


def _zero(run):
    if run.returncode != 0:
        raise AssertionError(f"exited {run.returncode}")


def _all_in(text, needles):
    missing = [n for n in needles if n not in text]
    if missing:
        raise AssertionError(f"output is missing {missing}")


if __name__ == "__main__":
    sys.exit(main())
