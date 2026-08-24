# Changes from upstream Continue

OGContinue is forked from [continuedev/continue](https://github.com/continuedev/continue) at tag `v1.0.10-vscode`, as required by the Apache 2.0 license (Section 4b: "You must cause any modified files to carry prominent notices stating that You changed the files").

## Why this fork exists

Upstream development slowed down while this snapshot was already stable and had few outstanding bugs. This fork keeps it maintained and focused specifically on fully local usage.

## Changes

- Working Agent mode, reworked for reliability on small local models: tool calls are
  recovered from plain-text or truncated output, file paths resolve tolerantly, a
  stalled agent is nudged forward, and repeated identical tool calls are blocked.
- In-file accept/reject controls for Agent-mode edits, matching Edit mode, instead of
  relying only on the chat "Apply" button.
- Live status of what the agent is doing (reading a file, running a command, editing)
  shown in chat as it works.
- Anonymous telemetry off by default; sign-in/hosted-account UI removed (no hosted
  backend to sign into).
- README and docs reframed around local-model usage, with a dedicated local setup
  guide and recommended Ollama models by VRAM.
- VS Code only — the JetBrains/IntelliJ and CLI variants inherited from upstream have
  been removed.

See [CHANGELOG.md](./extensions/vscode/CHANGELOG.md) for the full, version-by-version list.
This summary is updated as changes land. Individual commits and PRs remain the authoritative record.
