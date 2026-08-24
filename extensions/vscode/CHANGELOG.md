All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

OGContinue is forked from [continuedev/continue](https://github.com/continuedev/continue)
at tag `v1.0.10-vscode`. This file starts fresh from the fork point — see
[CHANGES.md](https://github.com/Krzysiek-Mistrz/OGContinue/blob/main/CHANGES.md)
for what's different from upstream, and upstream's own changelog for history
before this point.

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
