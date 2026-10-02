# Agent-mode evaluation fixture: scaffolding a project from scratch

A second scenario alongside [`agent-eval`](../agent-eval/README.md) and
[`agent-eval-feature`](../agent-eval-feature/README.md). That first one
starts from a broken-but-existing project and measures whether the agent can
*fix* it. This one starts from an **empty** workspace and measures whether
the agent can *create* one - every file in the request has to be scaffolded
from nothing, in a directory that doesn't exist yet.

This distinction matters because a decent chunk of the extension's Agent-mode
machinery (plan-target extraction, the pending-file tracker, the described-
action recovery, the nudge) was originally built and tuned against the
fix-an-existing-file case. Several of it turned out to quietly assume a file
already exists - see "Bugs this scenario found" below.

## Running one evaluation

```bash
cd manual-testing-sandbox/agent-eval-scaffold
./reset.sh
```

Open the workspace in VS Code, switch the chat to Agent mode, and paste:

> Set up a new Python todo-list project with this structure: todo_cli/storage.py
> (functions load_tasks(path) that returns a list, reading a JSON file and
> returning an empty list if it doesn't exist yet, and save_tasks(path, tasks)
> that writes the list to that path as JSON, creating the file if it doesn't
> exist), todo_cli/cli.py (a function add_task(tasks, text) that returns a new
> list with {"text": text, "done": False} appended), and main.py at the
> workspace root that loads the tasks, adds 'buy milk' with add_task, saves
> them, reloads them, and prints the reloaded list so it runs without errors.

When the agent stops - however it stops - accept any pending diffs, then:

```bash
python3 verify.py
```

## What it checks

Seven behavioural assertions against the code the agent created. None of them
look at how anything is written, so any layout that actually works passes and
one that merely looks plausible fails:

| # | Check |
|---|-------|
| 1-3 | `todo_cli/storage.py`, `todo_cli/cli.py` and `main.py` all exist |
| 4 | `storage.load_tasks` survives a missing `tasks.json` instead of raising |
| 5 | `cli.add_task` + `storage.save_tasks`/`load_tasks` round-trip a task through disk |
| 6 | `main.py` runs to completion |
| 7 | `main.py`'s output actually contains the task it added |

An empty workspace scores 0/7. A correct scaffold scores 7/7.

## Bugs this scenario found

Every one of these was invisible on the fix-an-existing-file scenario, since
it never asked the model to create anything. All fixed as of this scenario's
first clean run:

- **`extractFilePathMentions` required a directory in the path.** `main.py`
  at the workspace root (no `/`) never matched the regex used to build the
  task plan, the pending-target tracker, and the nudge - so a top-level file
  was invisible to all of them. The plan showed 2 targets instead of 3, and
  the run ended (`plan complete`) the moment those 2 existed, `main.py` never
  created. Fixed by additionally matching a bare filename against a known
  code/doc extension allowlist, instead of only `dir/name.ext`.
- **`describedReadPending` reconstructed a doomed read of a file that didn't
  exist yet.** If the model narrated "I will create `X`" instead of emitting
  a real tool call, and `X` was a pending *create* target rather than a
  pending *edit* target, the text was reconstructed as `read_file` anyway
  (the function only checked "is this path pending", not "does the narration
  actually mean read"). Reading a file that was never created just fails,
  and the model repeated the same narration into the same failure until the
  nudge budget ran out. Fixed by skipping the read-reconstruction when the
  text expresses create/write intent without also expressing read intent.
- **`readFile`'s missing-file error didn't mention `create_new_file`.** Once
  the above was fixed for *reconstructed* reads, the same failure mode still
  showed up from the model's own *native* `read_file` calls: it would narrate
  "I will create X", then natively call `read_file` on it first (seemingly to
  check whether it already existed) and get a generic "use list/glob" hint,
  which didn't point it at the actual next step and produced the same loop
  natively instead of via recovery. The error now explicitly says to use
  `create_new_file` if the file doesn't exist yet.
- **An edit of a file that doesn't exist just failed.** Both the real GUI's
  edit path (`gui/src/util/clientTools/editImpl.ts`) and this harness's fake
  IDE now fall back to creating the file instead of throwing "does not
  exist" - the content sent is always the complete file either way (never a
  diff), so there's nothing an edit call needs that a create doesn't already
  have. This mostly protects against a model that hallucinates `write_file`/
  `save_file` for something new, aliased internally to the edit tool.

None of the above are specific to this fixture - they'd misfire on any real
project where the model is asked to add a new top-level file, or narrates its
intent before making the call. This scenario just made them visible.

## Running the whole thing without VS Code

Reuses `agent-eval`'s compiled runner - nothing scenario-specific lives in
the bundle, only the request text and the fixture/checker do:

```bash
cd ../agent-eval && ./build-probe.sh && cd ../agent-eval-scaffold  # after changing harness code
./run-eval.sh                                      # one run, default model
./run-eval.sh qwen2.5-coder-7b-gguf:latest 5        # five runs, local Ollama
```

### Testing against a remote OpenAI-compatible server (llama-swap, vLLM, LM Studio...)

The harness's `ollama`/`llamacpp` backends only talk to a single-model local
server. A multi-model proxy like [llama-swap](https://github.com/mostlygeek/llama-swap)
needs the request to carry a `model` field so it knows which backend to
route to - the same thing the real extension's `openai` provider already
sends. Use `EVAL_BACKEND=openai` to drive the harness through that same
`core/llm/llms/OpenAI` class instead of `LlamaCpp`, pointed at the server:

```bash
EVAL_BACKEND=openai OPENAI_HOST=http://<host>:<port>/v1/ ./run-eval.sh <model-id> 3
```

(`OPENAI_KEY` defaults to `"not-needed"`, matching a typical local server's
`apiKey`.) This is also how the heavy server-hosted models below were tested.

Measured on this fixture:

| Model | Runs scaffolded completely | Notes |
|-------|-----------------------------|-------|
| `qwen2.5-coder-7b-gguf:latest` (local, Ollama) | 3/5 | no more loops after the fixes above - the 2 misses are real content mistakes (an empty-tasks-file edge case), not tooling failures |
| `gemma4-e4b-q4:latest` (local, Ollama) | 5/5 | native tool calls, 4 steps each, no nudges |
| `qwen3-30b` (server, llama-swap via `EVAL_BACKEND=openai`) | 3/3 | uses `set_task_plan` every run, 6 steps, verifies with `python main.py` before finishing |
| `gemma4-26b` (server, llama-swap via `EVAL_BACKEND=openai`) | 3/3 | `set_task_plan` every run, runs `mkdir -p todo_cli` before creating files even though `create_new_file` doesn't need it, 7 steps |
| `nemotron3-nano` (server, llama-swap via `EVAL_BACKEND=openai`) | 3/3 | 1 reconstructed read every run (narrates "create" but the phrasing borderline-triggers read recovery), self-corrects immediately either way |

`workspace/` is gitignored, so a run in progress never shows up as a diff.
