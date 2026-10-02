# Agent-mode evaluation fixture: adding a feature to a working project

A third scenario alongside [`agent-eval`](../agent-eval/README.md) (fix an
existing, broken project) and [`agent-eval-scaffold`](../agent-eval-scaffold/README.md)
(create a project from nothing). This one starts from a small project that
already **works correctly**, and asks for a feature that needs both a new
file and a change to an existing one in the same request - closer to the
most common real Agent-mode task than either of the other two.

That mix matters specifically because it's untested by the other two: the
bugfix scenario only ever edits files that already exist, the scaffold
scenario only ever creates files that don't. This is the first scenario
where a single plan has one target of each kind, so it's the first place a
bug that confuses "pending to create" with "pending to edit" (or vice versa)
would actually show up.

It also adds a regression dimension neither sibling has: since the baseline
already works, `main.py` running correctly isn't just "did it run" (scaffold)
or "does it still run after the fix" (bugfix) - it's "does it still do
exactly what it did before, on top of the new behaviour."

## Running one evaluation

```bash
cd manual-testing-sandbox/agent-eval-feature
./reset.sh
```

Open the workspace in VS Code, switch the chat to Agent mode, and paste:

> Add input validation to the todo app: create todo_cli/validation.py with a
> function is_valid_task_text(text) that returns False for an empty or
> whitespace-only string and True otherwise, then update add_task in
> todo_cli/cli.py to call it and raise a ValueError if the text is invalid,
> before adding the task.

When the agent stops - however it stops - accept any pending diffs, then:

```bash
python3 verify.py
```

## What it checks

Nine behavioural assertions. None of them look at how anything is written,
so any implementation that actually works passes and one that merely looks
plausible fails:

| # | Check |
|---|-------|
| 1 | `todo_cli/validation.py` was created |
| 2-3 | `todo_cli/validation.py` and the edited `todo_cli/cli.py` both import without error |
| 4-6 | `is_valid_task_text` rejects empty/whitespace-only text, accepts real text |
| 7 | `cli.add_task` now raises on invalid text |
| 8 | `cli.add_task` still accepts valid text - the pre-existing behaviour wasn't broken |
| 9 | `main.py` still runs to completion and still prints the task it adds (regression check) |

A baseline with nothing done scores 0/9. A correct implementation scores 9/9.

## Running the whole thing without VS Code

Reuses `agent-eval`'s compiled runner, same as `agent-eval-scaffold`:

```bash
cd ../agent-eval && ./build-probe.sh && cd ../agent-eval-feature  # after changing harness code
./run-eval.sh                                      # one run, default model
./run-eval.sh qwen2.5-coder-7b-gguf:latest 5        # five runs, local Ollama
```

Against a remote OpenAI-compatible server (see `agent-eval-scaffold`'s
README for why `EVAL_BACKEND=openai` is the right backend for a multi-model
proxy like llama-swap):

```bash
EVAL_BACKEND=openai OPENAI_HOST=http://<host>:<port>/v1/ ./run-eval.sh <model-id> 3
```

To match a specific model's own `defaultCompletionOptions` from
`config.yaml` instead of the harness's default (`temperature: 0.2`, no
`topP`), set `EVAL_TEMPERATURE`/`EVAL_TOP_P`:

```bash
EVAL_BACKEND=openai OPENAI_HOST=http://<host>:<port>/v1/ \
  EVAL_TEMPERATURE=1.0 EVAL_TOP_P=0.95 ./run-eval.sh gemma4-26b 3
```

(These two env vars work for every scenario's `run-eval.sh`, not just this
one - they were added to `runner-entry.ts` itself.)

## Bugs this scenario found

Unlike the other two scenarios, this one didn't turn up new bugs in the
*extension* - by the time this scenario existed, the fixes from
`agent-eval-scaffold` already covered mixed create/edit tracking correctly.
What it did find were bugs in **`verify.py` itself**, all now fixed:

- **Package-relative imports failed even when the model's code was
  correct.** The first version loaded `cli.py` with
  `importlib.util.spec_from_file_location`, outside any package context. A
  model that correctly wrote `from todo_cli.validation import
  is_valid_task_text` (exactly how `main.py` already imports `todo_cli.cli`)
  got `ModuleNotFoundError: No module named 'todo_cli'` - the checker was
  rejecting genuinely correct code. Fixed by putting the workspace root on
  `sys.path` and loading through `importlib.import_module("todo_cli.cli")`
  instead, so the module sees the same package context `main.py` would give
  it.
- **A bad import crashed the whole script instead of scoring as a
  failure.** Once the above was fixed, a model that wrote a genuinely broken
  import (a bare `import validation` instead of a package-relative one -
  which really would fail if `main.py` ever imported `todo_cli.cli` for
  real) crashed `verify.py` with an unhandled traceback and no score at all,
  instead of a clean, countable FAIL. Fixed by wrapping the import itself in
  the same `check()` framework as every other assertion.
- **A missing module produced a false PASS.** `cli.add_task now rejects
  invalid text` was checked with a `_raises()` helper that treats *any*
  exception as "correctly raised, pass" - including the `AttributeError`
  from calling `.add_task` on a module that was `None` because it failed to
  import. That scored a completely broken `cli.py` as having correctly
  implemented validation. Fixed by resolving the module through a
  `_require()` guard *before* entering `_raises`'s try/except, so a missing
  module fails loudly and specifically instead of being misread as the
  behaviour under test.

Measured on this fixture:

| Model | Runs adding the feature completely | Notes |
|-------|--------------------------------------|-------|
| `qwen2.5-coder-7b-gguf:latest` (local, Ollama) | 1/5 | no tooling failures - the misses are real content mistakes (validation not actually wired into `add_task`, or not used correctly) |
| `gemma4-e4b-q4:latest` (local, Ollama) | 5/5 | native tool calls, 4-5 steps each, no nudges |
| `qwen3-30b` (server, `EVAL_BACKEND=openai`) | 3/3 | `set_task_plan` every run, reads both files back to confirm before finishing |
| `gemma4-26b` (server, `EVAL_BACKEND=openai`, `EVAL_TEMPERATURE=1.0 EVAL_TOP_P=0.95`) | 2/3 | 1 run hit `ERR_STREAM_PREMATURE_CLOSE` mid-stream - a transient network disconnect against the server, not a tooling or extension failure |
| `nemotron3-nano` (server, `EVAL_BACKEND=openai`) | 3/3 | one run re-read `cli.py` 12 times in a row before editing it - wasteful but harmless (reads are idempotent), got there every time |

`workspace/` is gitignored - see `.gitignore` in this directory.
