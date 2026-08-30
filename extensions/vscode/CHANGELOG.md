All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

OGContinue is forked from [continuedev/continue](https://github.com/continuedev/continue)
at tag `v1.0.10-vscode`. This file starts fresh from the fork point — see
[CHANGES.md](https://github.com/Krzysiek-Mistrz/OGContinue/blob/main/CHANGES.md)
for what's different from upstream, and upstream's own changelog for history
before this point.

## 1.2.0 - 2026-08-25
### Added
* Web search tool is back, now running against a keyless DuckDuckGo scrape
  instead of Continue Dev's hosted proxy — no API key or hosted account
  needed, works fully locally like everything else in this fork
* A context-usage indicator next to the chat input shows how full the
  model's context window is; clicking it compacts the conversation by
  having the model summarize it, replacing the full history to free up
  room for a long Agent session to keep going
### Fixed
* A codebase-indexing run could fail outright with
  `SQLITE_CONSTRAINT: UNIQUE constraint failed: chunk_tags.tag, chunk_tags.chunkId`
  if a chunk got tagged twice in the same pass; that insert is now a no-op
  instead of aborting the whole index
* `read_file`/`read_currently_open_file` had no cap on how much of a file
  they reported back, so one or two ordinary file reads could exhaust a
  small local model's context window (as little as 8192 tokens by default)
  and permanently fail the next request with no way to recover. Both now
  truncate past 8000 characters with a note telling the model to grep or
  read further
* A tool call printed as a bare `tool_name {"arg": "value"}` (name before the
  JSON, no `name`/`arguments` wrapper — a format Qwen/Hermes-style models use
  that our text-recovery only partly handled) fell through unrecovered,
  landing in the chat as permanently inert text with no error and no nudge,
  so the model just kept repeating the same dead call. Recovery now matches
  this format too, and the stalled-agent nudge also fires for any leftover
  tool-call-shaped text that still fails to parse, instead of only for a
  response that verbally announces its next step
### Removed
* Scheduled `vscode-version-bump` workflow, which existed to maintain
  upstream Continue's own `v1.0.y-vscode`/`v1.1.x-vscode` release-branch
  cadence — this fork tags directly on `main` instead, so it could only
  ever fail here
* More confirmed-dead code and infrastructure: `binary/` (leftover
  non-VSCode IDE/CLI server), `sync/` (an unused Rust/NAPI crate),
  `packages/hub`, `packages/continue-sdk` (a generated client for the
  hosted Hub API this fork doesn't have), and the unused `changie`
  changelog tooling

## 1.1.0 - 2026-08-24
### Added
* Agent mode: tool calls are recovered even when a local model prints them as
  plain text or the response cuts off before the JSON closes
* Agent mode: file/folder paths are resolved tolerantly (wrong or missing
  leading folders, absolute paths, the workspace root itself)
* Agent mode: a stalled agent that announces a step without taking it is
  nudged forward once, both after a tool result and after a plain reply
* Agent mode: a tool call repeated with identical (or, past a higher
  threshold, merely near-identical) arguments is nudged to re-check its work
  and move on instead of looping indefinitely; only a much higher absolute
  cap on tool calls per turn ends the turn outright, purely as a runaway-cost
  safety net
* Agent-mode edits now show the same in-file accept/reject diff UI as Edit
  mode, instead of only a chat Apply button
* Chat shows what the agent is doing as it works (reading a file, running a
  command, editing), similar to other AI coding assistants
* Retry button on chat messages
* A ready-to-use local `config.yaml` (Qwen2.5-Coder for chat/edit/agent and
  autocomplete, Nomic Embed for RAG) is now the default for every new install
* Local-first setup docs ([docs/LOCAL_SETUP.md](https://github.com/Krzysiek-Mistrz/OGContinue/blob/main/docs/LOCAL_SETUP.md)) with recommended Ollama models by VRAM for chat, autocomplete, and embeddings
### Changed
* Rebranded to OGContinue; targets VS Code only (JetBrains and CLI variants removed)
* Anonymous telemetry is off by default
* Agent mode sends a lower sampling temperature so small local models format tool calls reliably
### Fixed
* Agent-mode edits no longer wait on a human accept/reject click to report
  back to the model, which used to leave the model blind to its own change,
  reading the file mid-diff, and editing again — silently discarding its own
  still-pending previous edit and reverting the file, which drove it into an
  infinite "fix the same bug" loop
* Accept/reject CodeLens buttons no longer persist after a config reload
* The bundled embeddings model no longer shadows one explicitly configured
* Various path-resolution and terminal-command failures that left the agent stuck in a loop
### Removed
* Sign-in button and hosted-account UI (this fork has no hosted backend to sign into)
* `web_search` tool (called a hosted proxy this fork doesn't ship)
* "Create Your Own Assistant" onboarding dialog (pointed at a hosted hub this fork doesn't have)
* Browser-driven e2e test suite (required a full VS Code + Xvfb environment that kept failing for reasons unrelated to the code under test)
