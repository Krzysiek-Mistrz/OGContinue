 via [Ollama](https://ollama.com), no API keys or cloud calls required.

## Recommended models by GPU VRAM

| VRAM   | Chat / Edit / Agent model             | Embeddings (RAG)     |
| ------ | ------------------------------------- | -------------------- |
| 6 GB   | `gemma4-e4b-q4` or `qwen2.5-coder:7b-instruct-q4_K_M` | `nomic-embed-text` |
| 8-12 GB| `qwen2.5-coder:14b-instruct-q4_K_M`   | `nomic-embed-text`   |
| 16+ GB | `qwen2.5-coder:32b-instruct-q4_K_M`   | `nomic-embed-text`   |

## Which models are actually tested

Agent mode is the demanding role, so models are measured on it rather than
judged by reputation. Three fixtures check three different shapes of task,
each behaviourally and each scored only if every check passes with no human help at any point:
[`agent-eval`](https://github.com/Krzysiek-Mistrz/OGContinue/tree/main/manual-testing-sandbox/agent-eval)
(fix a small broken project), [`agent-eval-scaffold`](https://github.com/Krzysiek-Mistrz/OGContinue/tree/main/manual-testing-sandbox/agent-eval-scaffold)
(build a project from an empty workspace), and
[`agent-eval-feature`](https://github.com/Krzysiek-Mistrz/OGContinue/tree/main/manual-testing-sandbox/agent-eval-feature)
(add a feature - one new file, one existing file changed - to a project that
already works, checked for regressions too). The table below is the
bugfix fixture specifically; see each scenario's own README for its results.

| Model | Backend | Size | Runs fixed completely | Steps | Native tool calls | Verdict |
| ----- | ------- | ---- | --------------------- | ----- | ----------------- | ------- |
| `gemma4-e4b-q4` | Ollama | 7.5B | 5/5 | 6 | yes | **Recommended.** No nudges, no repeated reads, ends by handing back cleanly |
| `qwen2.5-coder-7b-gguf` | Ollama | 7.6B | 3/5 | 5-9 | mixed | Reliable most of the time, mostly recovered from text; the 2 misses narrated an edit's intent ("I will fix...") with no code fence yet, which the recovery layer can't reconstruct without real content to work from |
| `qwen2.5-coder:1.5b-base-q8_0` | Ollama | 1.5B | n/a | - | n/a | Autocomplete only — a base model, not for chat or agent |
| `Qwen3-4B-Instruct-2507-Q4_K_M` | llama.cpp | 4B | 1/5 | 11-30 | yes | Native tool calls work cleanly over llama.cpp, but the model itself loops - hits the repeat guard and burns steps re-running the same failed command instead of reading the error. Not recommended for Agent mode |
| `Phi-4-mini-instruct-Q4_K_M` | llama.cpp | 3.8B | 0/5 | 5-6 | **no** | Never emits a native tool call even with `--jinja`, and narrates or prints Python-call-style pseudo-syntax (`builtin_task_complete(...)`) that this fork's JSON-shaped recovery layer isn't built to catch. Stalls out on nudges almost immediately. Not recommended |

gemma4-e4b-q4 finished by calling the completion tool in every run; the two
heavier models below (and the two stuck ones here) did not always manage
that. The 3 heavier server-hosted models further down are measured against
this same fixture too, alongside the scaffold and feature ones.

qwen2.5-coder-7b's recovery-layer dependence is still the notable part: a
good chunk of its calls arrive as plain text rather than through the
tool-calling API, so Agent mode on it leans on `tryRecoverToolCallFromText`
working correctly (see [Agent mode
reliability](#agent-mode-reliability-with-small-local-models) below), which
makes it more sensitive to changes in the harness than gemma4 is.

Qwen3-4B and Phi-4-mini were tried specifically as smaller, VRAM-friendlier
alternatives on the theory that a newer, purpose-tuned small model might do
better than the two above - neither did. Qwen3-4B's native tool-calling
worked fine mechanically (llama.cpp + `--jinja`, zero parsing issues), it's
the model's own judgment that gets stuck. Phi-4-mini's failure is different
and more fundamental: its plain-text tool-call style doesn't match the
JSON-object shape `tryRecoverToolCallFromText` looks for, so unlike
qwen2.5-coder:7b it gets no benefit from the recovery layer at all. Recovering
Phi-4-mini's style would need a second, differently-shaped recovery path - not
attempted here, since qwen2.5-coder:7b and gemma4-e4b-q4 already cover the
6 GB tier reliably.

The 14B and 32B rows in the VRAM table are extrapolations from the 7B result,
not measurements — nothing that large has been run against the fixture here.

### Heavier, server-hosted models (behind llama-swap)

Measured on all three fixtures against a remote `llama-swap` instance - see
the config example further down for how to point the extension at one:

| Model | Bugfix (fix a broken project) | Scaffold (create from scratch) | Feature (create + edit a working project) | Notes |
| ----- | ------------------------------- | ------------------------------- | ------------------------------------------- | ----- |
| `qwen3-30b` (Qwen3-30B-A3B) | **0/3** | 3/3 | 3/3 | Solid on the other two, but trips on the bugfix fixture's empty-list edge case: its fix for `calc/stats.py` raises instead of handling it, and rather than going back to re-fix it, it patches `main.py` instead and repeats `task_complete` with a reworded summary each time until the step budget runs out |
| `gemma4-26b` (Gemma4-26B-A4B, `temperature: 1.0`, `topP: 0.95`) | 3/3 | 3/3 | 2/3 | 1 feature-scenario run hit a transient network disconnect to the server mid-stream, unrelated to the extension; the bugfix fixture's repeat guard correctly caught a redundant terminal command in one run |
| `nemotron3-nano` (Nemotron-3-Nano-30B-A3B) | 3/3 | 3/3 | 3/3 | Occasionally re-reads a file several times before editing it, or recovers a call from narration instead of calling natively - wasteful but harmless, still finishes correctly every run |

All three are MoE models most 6-12 GB consumer cards can't run at full
precision, hence testing them server-hosted rather than listing them in the
VRAM table above.

To measure a model yourself, against Ollama:

```bash
cd manual-testing-sandbox/agent-eval
./build-probe.sh          # once, and after changing harness code
./run-eval.sh <your-ollama-model> 5
```

Or against a `llama-server` instance (start it first, see the llama.cpp
config above):

```bash
EVAL_BACKEND=llamacpp LLAMACPP_HOST=http://127.0.0.1:8080 \
  ./run-eval.sh <a-label-for-your-logs> 5
```

## Autocomplete

Autocomplete needs a different kind of model than chat: it fills in the middle of a line as you type, so it must be a small **base** (FIM-trained) model, not an instruct one, and it must respond in well under a second. Running a large instruct model for this role will feel laggy no matter how fast your GPU is.

| VRAM   | Autocomplete model                    |
| ------ | -------------------------------------- |
| 6 GB   | `qwen2.5-coder:1.5b-base-q8_0`         |
| 8-12 GB| `qwen2.5-coder:3b-base-q4_K_M`         |
| 16+ GB | `qwen2.5-coder:7b-base-q4_K_M`         |

On a 6 GB card such as an RTX 3060 Mobile, `qwen2.5-coder:1.5b-base-q8_0` runs alongside a chat model without contending much for VRAM and stays fast enough to keep up while typing. Add it with the `autocomplete` role:

```yaml
  - name: Qwen2.5 Coder 1.5B Base (local)
    provider: ollama
    model: qwen2.5-coder:1.5b-base-q8_0
    roles:
      - autocomplete
```

### If autocomplete doesn't trigger

Autocomplete is controlled by the OGContinue status bar item in the bottom-right
of the VS Code window. If suggestions aren't appearing even though a model is
configured for the `autocomplete` role, click it and toggle **Disable
Autocomplete** then **Enable Autocomplete** — this forces it to re-read the
current config and reliably fixes it.

## Suggested `config.yaml` 4 OLLAMA

Agent mode isn't a separate role — it's enabled automatically once a model with tool-calling support is assigned the `chat` role. Embeddings for RAG/codebase search are just another model entry with the `embed` role, not a separate top-level key.

3 local models config — gemma4 for chat/edit/agent, a small Qwen base model
for autocomplete, Nomic for embeddings. Scored 3/3 on the agent fixture:

```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Gemma4 E4B (local)
    provider: ollama
    model: gemma4-e4b-q4
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply

  - name: Qwen2.5 Coder 1.5B Base (local)
    provider: ollama
    model: qwen2.5-coder:1.5b-base-q8_0
    roles:
      - autocomplete

  - name: Nomic Embed (local)
    provider: ollama
    model: nomic-embed-text
    roles:
      - embed
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

Use the tag your own `ollama list` shows for the gemma4 build you pulled —
model tags differ between registries, and the `model:` field has to match it
exactly.

3 local models config, Qwen2.5-Coder throughout — scored 5/5 on the same
fixture, so it is an equally good choice:

```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Qwen2.5 Coder 7B (local)
    provider: ollama
    model: qwen2.5-coder:7b-instruct-q4_K_M
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply

  - name: Qwen2.5 Coder 1.5B Base (local)
    provider: ollama
    model: qwen2.5-coder:1.5b-base-q8_0
    roles:
      - autocomplete

  - name: Nomic Embed (local)
    provider: ollama
    model: nomic-embed-text
    roles:
      - embed
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

## Suggested `config.yaml` for llama.cpp

The `llama.cpp` provider talks to `llama-server`'s OpenAI-compatible API and
supports native + text-recovered tool calling in Agent mode, same as Ollama.
Unlike Ollama, one `llama-server` process serves exactly one loaded GGUF, so
running chat and autocomplete models at the same time means one `llama-server`
per role, each on its own port. `~/models/` below is just a placeholder -
point `-m` at wherever you actually downloaded your GGUFs:

```bash
llama-server -m ~/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf \
  -ngl 99 -c 8192 --host 127.0.0.1 --port 8080 --jinja

llama-server -m ~/models/qwen2.5-coder-1.5b-base-q8_0.gguf \
  -ngl 99 -c 4096 --host 127.0.0.1 --port 8081

llama-server -m ~/models/nomic-embed-text-v1.5.f16.gguf \
  --embedding --pooling mean -ub 2048 --host 127.0.0.1 --port 8082

llama-server -m ~/models/gemma-4-E4B_q4_0-it.gguf \
  -ngl 99 -c 8192 --host 127.0.0.1 --port 8080 --jinja
```

```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Qwen2.5 Coder 7B (llama.cpp)
    provider: llama.cpp
    model: qwen2.5-coder-7b
    apiBase: http://127.0.0.1:8080/
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply

  - name: Qwen2.5 Coder 1.5B Base (llama.cpp)
    provider: llama.cpp
    model: qwen2.5-coder-1.5b-base
    apiBase: http://127.0.0.1:8081/
    roles:
      - autocomplete

  - name: Nomic Embed (llama.cpp)
    provider: llama.cpp
    model: nomic-embed-text
    apiBase: http://127.0.0.1:8082/
    roles:
      - embed
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

Same setup with gemma4 instead of Qwen2.5-Coder for chat/edit/apply:

```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Gemma4 E4B (llama.cpp)
    provider: llama.cpp
    model: gemma4-e4b-q4
    apiBase: http://127.0.0.1:8080/
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply

  - name: Qwen2.5 Coder 1.5B Base (llama.cpp)
    provider: llama.cpp
    model: qwen2.5-coder-1.5b-base
    apiBase: http://127.0.0.1:8081/
    roles:
      - autocomplete

  - name: Nomic Embed (llama.cpp)
    provider: llama.cpp
    model: nomic-embed-text
    apiBase: http://127.0.0.1:8082/
    roles:
      - embed
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```


Full parity with Ollama, `embed` included: `LlamaCpp` in this fork implements
chat/edit/apply/autocomplete and `_embed`, the last one hitting `llama-server`'s
`/v1/embeddings`. The only structural difference from Ollama is that one
`llama-server` process serves exactly one loaded GGUF, so each role needing a
different model needs its own server on its own port - the embedding model is
tiny, so a third instance alongside the other two costs little VRAM. `model:`
under `llama.cpp` is just a label for the UI; the server only ever serves
whatever GGUF it was started with, so it doesn't need to match anything.


## Suggested `config.yaml` for a remote server (llama-swap / any OpenAI-compatible proxy)

If your models run on a separate machine behind a multi-model proxy like
[llama-swap](https://github.com/mostlygeek/llama-swap) rather than a bare
`llama-server`, use `provider: openai` with that proxy's address as
`apiBase` - it's the same wire protocol `llama-server` speaks, but a proxy
like llama-swap needs the `model` field in the request to route to the
right backend, which is exactly what the `openai` provider sends (`llama.cpp`
as a provider here is built for a single-model server and never sends it).
Swap in your own host - `ai-server.example.com` below is a placeholder:

```yaml
name: Remote Local Server
version: 1.0.0
schema: v1
models:
  - name: Qwen3 30B-A3B (server)
    provider: openai
    model: qwen3-30b
    apiBase: http://ai-server.example.com:11434/v1
    apiKey: "not-needed"
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply

  - name: Gemma4 26B-A4B (server)
    provider: openai
    model: gemma4-26b
    apiBase: http://ai-server.example.com:11434/v1
    apiKey: "not-needed"
    defaultCompletionOptions:
      temperature: 1.0
      topP: 0.95
    roles:
      - chat
      - edit
      - apply

  - name: Nemotron 3 Nano 30B-A3B (server)
    provider: openai
    model: nemotron3-nano
    apiBase: http://ai-server.example.com:11434/v1
    apiKey: "not-needed"
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply

  - name: Nomic Embed
    provider: ollama
    model: nomic-embed-text-v1.5.f16-gguf:latest
    roles:
      - embed

context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

`apiKey: "not-needed"` is only a placeholder value - llama-swap doesn't check
it by default, but the field has to be present and non-empty or some clients
refuse to send the request at all. Mixing providers in one config (an
`openai` endpoint for chat/edit/apply, `ollama` for embeddings) works fine;
each role is resolved independently.

To measure a model behind a proxy like this yourself, without opening VS
Code at all, point the eval harness at it with `EVAL_BACKEND=openai` (see
"Which models are actually tested" above and each scenario's own README for
details):

```bash
cd manual-testing-sandbox/agent-eval-scaffold
EVAL_BACKEND=openai OPENAI_HOST=http://ai-server.example.com:11434/v1/ \
  ./run-eval.sh qwen3-30b 3
```

Add `EVAL_TEMPERATURE`/`EVAL_TOP_P` to match a specific model's own
`defaultCompletionOptions` instead of the harness's flat default (useful for
a model tuned away from the usual `temperature: 0.2`, like Gemma above):

```bash
EVAL_BACKEND=openai OPENAI_HOST=http://ai-server.example.com:11434/v1/ \
  EVAL_TEMPERATURE=1.0 EVAL_TOP_P=0.95 ./run-eval.sh gemma4-26b 3
```

## Using a GGUF model with Ollama instead of llama.cpp

Ollama doesn't read `.gguf` files directly - it needs a `Modelfile` pointing
at one, then an `ollama create` step to register it under a name you can use
in `config.yaml` like any other Ollama model:

```bash
cat > Modelfile <<'EOF'
FROM ./Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf
EOF

ollama create qwen2.5-coder-7b-gguf -f Modelfile
ollama list   # confirm it shows up
```

Then reference it exactly like any pulled model:

```yaml
  - name: Qwen2.5 Coder 7B (from GGUF)
    provider: ollama
    model: qwen2.5-coder-7b-gguf
    roles:
      - chat
      - edit
      - apply
```

This is the reverse direction of the llama.cpp setup above - useful if you'd
rather keep a single Ollama daemon running everything instead of one
`llama-server` process per role. A `Modelfile` can also set `PARAMETER` and
`TEMPLATE` values (see `ollama create --help`), but a bare `FROM` line is
enough for most GGUFs that already have their chat template baked in.

## 4 paid models suggested config:

```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Claude Sonnet (Anthropic)
    provider: anthropic
    model: claude-sonnet-4-5
    apiKey: sk-ant-...
    roles:
      - chat
      - edit
      - apply

  - name: GPT-5 (OpenAI)
    provider: openai
    model: gpt-5
    apiKey: sk-...
    roles:
      - chat

  - name: Gemini (Google)
    provider: gemini
    model: gemini-2.5-pro
    apiKey: AIza...
    roles:
      - chat
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

## Notes for 6 GB cards (e.g. RTX 3060 Mobile)

- Keep context window at 8k-16k; larger contexts spill into system RAM and slow generation significantly.
- Close other GPU-heavy applications before starting a long Agent session.
- Q4_K_M quantization is the right balance of quality/speed at this VRAM tier — avoid Q8 or fp16 variants of the 7B model here.

### "Not enough context available to include the system message..."

This means the conversation - system message, tool definitions, and the
last message - no longer fits in the model's context window. It's most
likely to happen in a long Agent session that has read several files or
done a web search, since those results all stay in the conversation.

If your `config.yaml` doesn't set a `contextLength`, OGContinue defaults to
8192 tokens, which is on the small side for Agent mode. Raise it explicitly
on the model entry, matching what your Ollama model actually supports (check
with `ollama show <model>`; Qwen2.5-Coder supports up to 32768):

```yaml
  - name: Qwen2.5 Coder 7B (local)
    provider: ollama
    model: qwen2.5-coder:7b-instruct-q4_K_M
    contextLength: 32768
    defaultCompletionOptions:
      temperature: 0.2
    roles:
      - chat
      - edit
      - apply
```

A larger context window uses more VRAM/RAM, so on a 6 GB card stay closer to
16k than 32k. A context-usage indicator next to the chat input (e.g. `42%
context`) shows how full the window is as the conversation grows, so you can
see this coming before it turns into a hard failure. Click it to compact:
the model condenses the whole conversation into a summary that replaces the
full history, freeing up most of the window so a long Agent session can keep
going. This is manual - it doesn't happen automatically - and older turns
aren't visible afterward, only the summary. If you're already past the point
where a request fails outright, compacting can't help retroactively; raise
`contextLength` instead and start a new session.

## Which embeddings model is actually used?

Embeddings power codebase search (the `codebase` context provider and `@` codebase queries).

- If your `config.yaml` declares a model with `roles: [embed]`, that model is used.
- If it declares none, OGContinue falls back to a small bundled model (Transformers.js `all-MiniLM-L6-v2`) that runs in the extension, with no Ollama call.

To use the bundled one deliberately, declare it explicitly instead of leaving `embed` empty:

```yaml
  - name: Built-in embeddings
    provider: transformers.js
    roles:
      - embed
```

You can confirm which one is live under **Settings → Models → Embed**. Changing the embeddings model invalidates the existing index, so the codebase is re-indexed on the next run.

### "error when indexing: SQLITE_CONSTRAINT: UNIQUE constraint failed: chunk_tags..."

This can show up in the extension's dev console on the very first index of a
workspace and is not a sign of a corrupted index or a broken install - it
just means one chunk got tagged twice in the same pass. Run **OGContinue:
Codebase Force Re-Index** from the command palette and it resolves itself.

## Modes: Chat, Edit, Agent

Everything happens inside one continuous session — switching modes never throws away your conversation, it just changes what the next message does with it:

- **Chat** (`Ctrl+L`): ask questions and get answers in the side panel. By default it never touches your files.
- **Edit** (`Ctrl+I`): the model edits your current file in place; each change appears as an inline diff you accept or reject per block.
- **Agent** (toggle inside the session): the model can use tools — read files, search the codebase, run terminal commands, and edit files across your project. File edits made this way go through the same inline diff/accept-reject UI as Edit mode.

Agent mode sends a low sampling temperature (0.2) so small local models format their tool calls reliably. If you set `temperature` yourself under a model's `defaultCompletionOptions`, your value is used instead.

### The "Apply" button

Any code block the model prints in chat gets an **Apply** button next to it. Clicking it sends that snippet through the same diff engine as Edit/Agent mode, so you can review and accept/reject it like any other change.

This is a **manual fallback**, mainly relevant to Agent mode: if the model describes a change as a plain code block in its reply instead of actually calling the file-edit tool (some local models occasionally do this instead of using the tool-calling mechanism), Apply lets you apply that snippet yourself without asking the model to redo it. In Chat mode nothing is ever applied automatically anyway, so Apply there is just a convenience, not a safety net.

### Agent mode reliability with small local models

Ollama's native tool-calling depends on the model's chat template emitting a specific token sequence, which small quantized models (7B-class and below) don't always trigger reliably. To keep Agent mode usable on hardware that can only run those models, OGContinue adds several layers of recovery on top of Ollama, all transparent to you:

- **Tool calls printed as plain text are recovered.** If the model prints `{"name": "...", "arguments": {...}}` as a message instead of a real tool call - including when the response is cut off before the closing `}` - it's parsed back into a real call rather than shown as raw JSON. A bare `tool_name {"arg": "value"}` form (name printed before the arguments object, with no `name`/`arguments` wrapper - common with Qwen/Hermes-style models) is recognized the same way. A model that instead narrates the call as Python-style syntax - `builtin_edit_existing_file("path", "new content")`, sometimes inside a ```python fence - is also recovered, by mapping its positional arguments onto the tool's declared parameter order.
- **Paths are resolved tolerantly.** Small models frequently get a path slightly wrong (missing a leading folder, an extra one, an absolute path copied from a terminal error). Read, edit, list, and create-file all fall back to a workspace-wide search for the file or folder before giving up, and a failed read/edit tells the model the real path instead of just failing.
- **A turn ends by calling an explicit `task_complete` tool.** Otherwise "finished" has to be guessed at - from whether the model happened to call another tool, or from whether its prose sounds like a conclusion - and a finished turn looks exactly like a stalled one. The call is checked before it's accepted: if a file the request named hasn't been edited, or something it asked to be verified hasn't been, the tool answers with what's left instead of ending the turn.
- **A file with a pending diff reads back as it will look once accepted.** While a change waits for your accept/reject, the removed lines aren't deleted from the document - they're replaced by blank lines, with the old text held in a decoration. So an agent that read a file it had just edited got back something matching neither its edit nor the original, couldn't confirm its own change, and would re-edit or stall until you clicked accept. Reads now skip those placeholders, so you no longer have to accept a diff quickly to keep the agent moving.
- **The task state is restated to the model every turn.** The most reliable cause of a small model looping is that it forgets: each turn it attends mostly to the newest tool result, while earlier ones drift into the middle of a growing context where attention is weakest, so it re-reads a file it read three turns ago and never converges. So a short block is appended at the end of every agent request saying what has been read, what has been changed, and what the request still needs. It's built from the tool calls the extension actually executed, never from the model's own account of its progress, so it stays right exactly when the model's self-report doesn't, and it always refers to a file by the path those calls proved it resolves to - naming one file two ways is itself enough to send a model off to re-read something it was just told it already had. This is the single most model-independent part of the harness - it makes no assumption about how a given model phrases anything.
- **A file the request names as the outcome becomes a verification step.** In "fix A and B so that `src/main.py` runs", `main.py` isn't something to edit, but the request does ask that it works. Once every file to change has been changed, the remaining step is to run it and report the result, rather than declaring the task finished untested.
- **Repeating a read is answered, not refused.** A read-only tool is idempotent, so repeating it is wasteful but never harmful, and refusing it takes away the only way the model has to recover something it forgot - if it also can't list the directory, it has no way forward at all and the turn deadlocks. A repeated read now runs and returns its result, with an explicit note that it is a repeat and nothing has changed. Only a tool that *changes* something is blocked outright after the second identical call.
- **An action the agent only described is carried out for it.** The most common way a small model stalls is to say what it's about to do instead of doing it - printing the fixed code as a block, or announcing "let's read `math_utils/stats.py`" and stopping. In both cases the description already names everything the tool call needs, so it's reconstructed and run rather than asked for again: a code block preceded by a file path becomes a real file edit, and a file the task still needs but that got no tool call becomes a read. The reconstructed call behaves exactly like one the model made itself - it still respects your per-tool permission settings, still shows up as an accept/reject diff for an edit, and is still subject to the repeated-call guard.
- **Agent mode tracks a task plan and nudges a stalled agent toward it, up to twice.** The file paths your own request asks to be *changed* are extracted up front - one named only as the outcome to check ("fix A and B so that `src/main.py` runs") is left out, since nothing will ever edit it - and checked against which ones a successful *file-changing* tool call has covered - not against what the model says about its own progress, since a small model's account of "what's left" is exactly what's unreliable here, and not against reads either, since reading a file up front is how it starts work on it rather than how it finishes. If the model ends a turn without calling a tool while a plan target is still unedited - whether it announced a next step and didn't take it, or just stopped with no explanation at all - it's nudged to call the tool on that specific file, retrying once more if that doesn't land either, and a premature "the task is done" claim is not taken at face value while a target remains untouched. The nudge prompts themselves are invisible in the chat. If both attempts fail, a visible notice is posted naming what's still unfinished, rather than the turn just ending silently - this is a best-effort mitigation for a real model limitation, not a guarantee it will always finish a multi-file task unattended.
- **A failed terminal command says where it ran.** Commands run from the workspace root, not from the folder of whatever file the model was just reading. On failure the output now names the working directory and, for any path in the command that exists elsewhere in the workspace, where it actually is.
- **The file-edit tool reports back what the file now contains.** It used to return nothing at all, which left the model with no evidence its edit had landed - and small models answer that by making the same edit again, forever.
- **The edit tool asks for the complete new file content, not an abbreviated diff.** A full-file edit is applied instantly and deterministically; a `// ... existing code ...`-style partial edit has to be merged back in by a *second, invisible LLM call* that never shows up as part of the conversation - if that call is slow or stalls, the agent looks like it silently hung right after the tool call. Asking for the whole file skips that second call for the common case.
- **A tool call repeated verbatim is blocked after the second attempt**, since a third identical call cannot produce a different result. The model is told why and given a couple of chances to do something else; if it keeps reissuing the same call, the turn ends rather than looping. Note this only catches *byte-identical* repeats - a model that varies its arguments slightly each time isn't caught by it, which is why the edit-result fix above matters more.

None of this changes what the model can do - it only keeps small models from getting stuck on formatting or path mistakes that a larger model would rarely make.
