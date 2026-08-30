# Fully local setup

This guide covers running OGContinue entirely against local models via [Ollama](https://ollama.com), no API keys or cloud calls required.

## Recommended models by GPU VRAM

| VRAM   | Chat / Edit / Agent model             | Embeddings (RAG)     |
| ------ | ------------------------------------- | -------------------- |
| 6 GB   | `qwen2.5-coder:7b-instruct-q4_K_M`    | `nomic-embed-text`   |
| 8-12 GB| `qwen2.5-coder:14b-instruct-q4_K_M`   | `nomic-embed-text`   |
| 16+ GB | `qwen2.5-coder:32b-instruct-q4_K_M`   | `nomic-embed-text`   |

Qwen2.5-Coder was chosen over general-purpose models because it has strong function-calling support, which Agent mode depends on.

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

## Example `config.yaml`

Agent mode isn't a separate role — it's enabled automatically once a model with tool-calling support is assigned the `chat` role. Embeddings for RAG/codebase search are just another model entry with the `embed` role, not a separate top-level key.

3 local models config:
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

4 paid models config:
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

- **Tool calls printed as plain text are recovered.** If the model prints `{"name": "...", "arguments": {...}}` as a message instead of a real tool call - including when the response is cut off before the closing `}` - it's parsed back into a real call rather than shown as raw JSON. A bare `tool_name {"arg": "value"}` form (name printed before the arguments object, with no `name`/`arguments` wrapper - common with Qwen/Hermes-style models) is recognized the same way.
- **Paths are resolved tolerantly.** Small models frequently get a path slightly wrong (missing a leading folder, an extra one, an absolute path copied from a terminal error). Read, edit, list, and create-file all fall back to a workspace-wide search for the file or folder before giving up, and a failed read/edit tells the model the real path instead of just failing.
- **A stalled agent is nudged forward once.** If the model announces the next step ("Let's now update...") without calling the tool to do it, it's prompted once to actually call it. This is invisible in the chat - it isn't added to the conversation history.
- **A failed terminal command says where it ran.** Commands run from the workspace root, not from the folder of whatever file the model was just reading. On failure the output now names the working directory and, for any path in the command that exists elsewhere in the workspace, where it actually is.
- **The file-edit tool reports back what the file now contains.** It used to return nothing at all, which left the model with no evidence its edit had landed - and small models answer that by making the same edit again, forever.
- **A tool call repeated verbatim is blocked after the second attempt**, since a third identical call cannot produce a different result. The model is told why and given a couple of chances to do something else; if it keeps reissuing the same call, the turn ends rather than looping. Note this only catches *byte-identical* repeats - a model that varies its arguments slightly each time isn't caught by it, which is why the edit-result fix above matters more.

None of this changes what the model can do - it only keeps small models from getting stuck on formatting or path mistakes that a larger model would rarely make.
