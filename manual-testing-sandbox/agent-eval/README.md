# Agent-mode evaluation fixture

A deliberately broken little project plus a checker, so a change to the agent
harness can be judged by whether the agent actually fixes it - not by reading a
transcript and forming an impression.

`manual-testing-sandbox/agent-test-app` is the scratch project for poking at
things by hand. This one is different on purpose: nothing here is edited by
hand, and every run starts from an identical state, so two runs are comparable.

## Running one evaluation

```bash
cd manual-testing-sandbox/agent-eval
./reset.sh
```

Open the workspace in VS Code, switch the chat to Agent mode, and paste:

> Fix the type errors in report/format.py and the division-by-zero crashes in
> calc/stats.py so that src/main.py runs without errors. All the files are
> inside the inventory-app directory.

When the agent stops - however it stops - accept any pending diffs, then:

```bash
python3 verify.py
```

It prints one line per check and exits non-zero unless all of them pass.

## What it checks

Eight behavioural assertions against the code the agent left behind. None of
them look at how the fix is written, so any correct fix passes and a
plausible-looking one that doesn't work fails:

| # | Check |
|---|-------|
| 1-2 | `average_price` still averages, and no longer divides by zero on `[]` |
| 3-4 | `price_spread` still works, and no longer raises on `[]` |
| 5-6 | `format_line` / `format_total` accept numbers instead of concatenating them onto a string |
| 7 | `src/main.py` runs to completion |
| 8 | it still prints every item and both statistics |

Check 8 exists because the cheapest way to make `main.py` exit zero is to
delete the lines that crash it. An agent that does that passes check 7 and
fails this one.

A broken workspace scores 2/8. A correct fix scores 8/8.

## Why the layout is awkward

`format.py` sits in `src/report/`, `stats.py` in `lib/calc/`, and the prompt
names neither full path. Resolving those is a large part of what a small model
gets wrong in agent mode, so the fixture exercises it rather than avoiding it.

## Running the whole thing without VS Code

`run-eval.sh` drives a complete agent run headlessly and checks the result,
so a change can be judged without anyone clicking through the editor:

```bash
./build-probe.sh                                   # after changing harness code
./run-eval.sh                                      # one run, default model
./run-eval.sh qwen2.5-coder:7b-instruct-q4_K_M 5   # five runs
```

Everything that decides behaviour is imported from the extension's own
source - system message, tool definitions, tool implementations, plain-text
tool-call recovery, the described-action reconstruction, the task-state
recitation, the targeted nudge and the `task_complete` gate - so a green run
says those carry a task to completion with that model. The repeat guard and
the "plan complete ends the turn" rule are mirrored too, so the runner cannot
pass a sequence the extension would have interrupted.

**What it cannot catch**, because it is not VS Code: anything in
`ApplyManager`, the accept/reject diff UI (edits are applied directly), and
VS Code's own path resolution. A real run in the editor is still the only
check for those.

Measured on this fixture:

| Model | Runs fixing it completely | Notes |
|-------|---------------------------|-------|
| `qwen2.5-coder:7b-instruct-q4_K_M` | 4/5 | every tool call recovered from text, never native |
| `gemma4-e4b-q4` | 3/3 | native tool calls, 6 steps each, no nudges |

## Checking the harness without a full run

`verify.py` judges the outcome of a real agent run. `probe.py` judges a
single decision, which is faster and pinpoints where a change went wrong:

```bash
./build-probe.sh     # only after changing tools, prompts or recovery
./probe.py           # or ./probe.py <model> [<model> ...]
```

It sends the extension's real system message and real tool definitions -
dumped from the source by `build-probe.sh`, so they cannot drift from what
ships - to Ollama at three points where the harness depends on a specific
decision:

| Scenario | Expected |
|----------|----------|
| every file changed, `main.py` run | calls `task_complete` |
| one of two files changed | calls a tool for the other one, *not* `task_complete` |
| nothing done yet | reads or lists first, *not* `task_complete` |

A tool call the model prints as plain text instead of emitting through the
tool-calling API is run through the extension's own recovery function and
counted, with `(recovered from text)` in the output. Judging the raw Ollama
response alone would score behaviour the user never sees - and it matters
here, because on `qwen2.5-coder:7b` every single one of these arrives as text
rather than as a native tool call.

## Recording a result

Note the score, the model, and the extension version together - a score means
nothing without them:

```
qwen2.5-coder:7b-instruct-q4_K_M | 1.2.0 | 8/8 | no stalls, verified main itself
```

`workspace/` is gitignored, so a run in progress never shows up as a diff.
