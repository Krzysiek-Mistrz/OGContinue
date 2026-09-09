# Changes from upstream Continue

OGContinue is forked from [continuedev/continue](https://github.com/continuedev/continue) at tag `v1.0.10-vscode`, as required by the Apache 2.0 license (Section 4b: "You must cause any modified files to carry prominent notices stating that You changed the files").

## Why this fork exists

Upstream Continue stopped. Cursor (Anysphere)
acquired the Continue team in June 2026, shipped a final `v2.0.0-vscode` release,
and set the `continuedev/continue` repository to read-only; the hosted product
was shut down and its cloud data deleted shortly after. This fork was started
from a snapshot taken well before that (`v1.0.10-vscode`), for a separate
reason: in practice, upstream Continue never worked reliably with local models -
Agent mode in particular assumed a frontier-class hosted model behind every tool
call, and fell over on the small (7B-class) models people actually run locally.
This fork exists to fix that specifically, not to keep the whole project alive
in general.

## Changes

- Agent mode reworked end to end for small (7B-class) local models, which routinely
  fail at things a frontier hosted model just does. This is the bulk of the fork's
  work; see [docs/LOCAL_SETUP.md](./docs/LOCAL_SETUP.md#agent-mode-reliability-with-small-local-models)
  for the full breakdown of what's involved. In short:
  - Tool calls are recovered even when a model prints them as plain text instead of
    using the tool-calling API - measured to be the *only* path some models use.
  - An `set_task_plan` tool lets the model state its own steps, and progress is
    recited against them every turn, so a long task doesn't drift.
  - An explicit `task_complete` tool ends a turn, checked against that progress
    before it's accepted - a model can't declare victory with work still undone.
  - A response that only describes an edit or a next step, instead of making the
    tool call, is reconstructed and carried out rather than asked for again.
  - The terminal tool corrects a wrong path and retries once, instead of only
    reporting where the file really is.
  - File paths resolve tolerantly everywhere a model might get one slightly wrong.
- In-file accept/reject controls for Agent-mode edits, matching Edit mode, instead of
  relying only on the chat "Apply" button - which itself is fixed to work without
  needing the target file open first.
- Live status of what the agent is doing (reading a file, running a command, editing)
  shown in chat as it works.
- A local `manual-testing-sandbox/agent-eval` harness measures Agent-mode changes
  against real Ollama models instead of by reading transcripts - see its README.
- Web search backed by a keyless DuckDuckGo scrape - no hosted proxy, no API key.
- Anonymous telemetry off by default; sign-in/hosted-account UI removed (no hosted
  backend to sign into).
- README and docs reframed around local-model usage, with a dedicated local setup
  guide, recommended Ollama models by VRAM, and results measured against the eval
  harness above.
- VS Code only — the JetBrains/IntelliJ and CLI variants inherited from upstream have
  been removed.

See [CHANGELOG.md](./extensions/vscode/CHANGELOG.md) for the full, version-by-version list.
This summary is updated as changes land. Individual commits and PRs remain the authoritative record.
