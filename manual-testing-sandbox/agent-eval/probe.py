#!/usr/bin/env python3
"""Asks a local model, over Ollama, whether it does what the harness expects.

The harness can be unit-tested; whether a small model actually plays along
cannot. This sends the real system message and the real tool definitions,
dumped from the extension's own source, at the exact points in a task where
the harness depends on a particular decision, and reports what came back.

Usage:  ./probe.py [model ...]
"""
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_MODELS = ["qwen2.5-coder:7b-instruct-q4_K_M", "gemma4-e4b-q4:latest"]

TOOLS = json.load(open(os.path.join(HERE, "tools.json")))
RECOVER = os.path.join(HERE, "recover.cjs")
SQLITE_STUB = os.path.join(HERE, "sqlite-stub.cjs")
SYSTEM = open(os.path.join(HERE, "agent-system-message.txt")).read()

REQUEST = (
    "Fix the type errors in report/format.py and the division-by-zero crashes "
    "in calc/stats.py so that src/main.py runs without errors. All the files "
    "are inside the inventory-app directory."
)


def tool_result(call_id, name, content):
    return {"role": "tool", "tool_name": name, "content": content}


def assistant_call(name, args):
    return {
        "role": "assistant",
        "content": "",
        "tool_calls": [{"function": {"name": name, "arguments": args}}],
    }


EDITED_FORMAT = [
    assistant_call(
        "builtin_edit_existing_file",
        {"filepath": "inventory-app/src/report/format.py", "changes": "..."},
    ),
    tool_result("1", "builtin_edit_existing_file", "Edit applied to inventory-app/src/report/format.py"),
]

EDITED_STATS = [
    assistant_call(
        "builtin_edit_existing_file",
        {"filepath": "inventory-app/lib/calc/stats.py", "changes": "..."},
    ),
    tool_result("2", "builtin_edit_existing_file", "Edit applied to inventory-app/lib/calc/stats.py"),
]

RAN_MAIN = [
    assistant_call(
        "builtin_run_terminal_command",
        {"command": "python inventory-app/src/main.py"},
    ),
    tool_result("3", "builtin_run_terminal_command", "Item: widget x3 @ 4.5\nAverage: 9.08\nSpread: 28.33\n"),
]

RECITE_DONE = {
    "role": "user",
    "content": (
        "[Task state - maintained automatically, not written by you]\n"
        "Already changed: inventory-app/src/report/format.py, inventory-app/lib/calc/stats.py\n"
        "Nothing is left from the original request. Summarize what you changed and stop, "
        "unless you can point to something concrete that is still wrong."
    ),
}

RECITE_HALF = {
    "role": "user",
    "content": (
        "[Task state - maintained automatically, not written by you]\n"
        "Already changed: inventory-app/src/report/format.py\n"
        "Still to change: calc/stats.py\n"
        "Next action: calc/stats.py. Say in one short sentence what you are about to "
        "change, and make the tool call in that same reply - a reply that only "
        "describes the step does not count as taking it."
    ),
}

SCENARIOS = [
    {
        "name": "ends the turn when the work is done",
        "messages": [{"role": "user", "content": REQUEST}]
        + EDITED_FORMAT + EDITED_STATS + RAN_MAIN + [RECITE_DONE],
        "expect": {"builtin_task_complete"},
    },
    {
        "name": "keeps working when half the work remains",
        "messages": [{"role": "user", "content": REQUEST}]
        + EDITED_FORMAT + [RECITE_HALF],
        "expect": {
            "builtin_edit_existing_file",
            "builtin_read_file",
            "builtin_grep_search",
            "builtin_ls",
            "builtin_file_glob_search",
        },
        "forbid": {"builtin_task_complete"},
    },
    {
        "name": "does not declare victory before doing anything",
        "messages": [{"role": "user", "content": REQUEST}],
        "expect": {
            "builtin_read_file",
            "builtin_grep_search",
            "builtin_ls",
            "builtin_file_glob_search",
        },
        "forbid": {"builtin_task_complete"},
    },
]


def recovered_call(text):
    """What the extension would make of a tool call the model printed as text.

    Small models routinely emit a perfectly correct call as prose instead of
    through the tool-calling API, and the extension parses those back. Judging
    the model on Ollama's raw output alone would therefore score behaviour the
    user never sees. This runs the extension's own recovery function, so the
    verdict matches what actually reaches the agent loop.
    """
    if not text or not os.path.exists(RECOVER):
        return None
    try:
        result = subprocess.run(
            ["node", "-r", SQLITE_STUB, RECOVER],
            input=text,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return json.loads(result.stdout or "null")
    except Exception:
        return None


def ask(model, messages):
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM}] + messages,
            "tools": TOOLS,
            "stream": False,
            "options": {"temperature": 0.2},
        }
    ).encode()
    request = urllib.request.Request(
        f"{OLLAMA}/api/chat", body, {"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        message = json.load(response)["message"]
    calls = [c["function"]["name"] for c in message.get("tool_calls") or []]
    text = (message.get("content") or "").strip()
    if calls:
        return calls, text, "native"
    recovered = recovered_call(text)
    if recovered:
        return [recovered], text, "recovered from text"
    return [], text, "none"


def main():
    models = sys.argv[1:] or DEFAULT_MODELS
    overall = 0
    for model in models:
        print(f"\n=== {model} ===")
        for scenario in SCENARIOS:
            try:
                calls, text, how = ask(model, scenario["messages"])
            except Exception as exc:
                print(f"ERROR {scenario['name']}: {exc}")
                overall = 1
                continue

            forbidden = set(calls) & scenario.get("forbid", set())
            ok = bool(set(calls) & scenario["expect"]) and not forbidden

            called = ", ".join(calls) if calls else "no tool call"
            print(f"{'pass' if ok else 'FAIL'}  {scenario['name']}")
            print(f"        called: {called} ({how})")
            if not calls and text:
                print(f'        said: "{text[:120]}"')
            if not ok:
                overall = 1
    return overall


if __name__ == "__main__":
    sys.exit(main())
