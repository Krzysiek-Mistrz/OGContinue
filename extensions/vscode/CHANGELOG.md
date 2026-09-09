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
* Agent mode extracts a task plan (the concrete file paths named in your
  own request) up front and tracks which of them a successful file-changing
  tool call has covered, instead of trusting the model's own account of its
  progress. A file named only as the outcome to check ("fix A and B so that
  `src/main.py` runs") isn't taken as something to change, since nothing
  would ever edit it and the task could then never be reported as finished.
  Reads, greps and directory listings deliberately don't count -
  the model reads the files it's about to work on before it works on them,
  so counting those marked the whole plan finished the moment it looked at
  them, leaving the nudge with no target exactly when it needed one.
  This drives the stalled-agent nudge with a correct, specific target even
  when the model says nothing at all about what's next, and stops a
  premature "task complete" claim from being taken at face value when the
  plan shows an untouched file
* The task state is restated to the model at the end of every agent request:
  what has been read, what has been changed, and what the request still
  needs. A small model loops mostly because it forgets - it attends to the
  newest tool result while earlier ones drift into the middle of a growing
  context - so it re-reads a file it read three turns ago and never
  converges. The block is derived from the tool calls actually executed,
  never from the model's own account of its progress, and involves no
  phrase matching, so it doesn't depend on how any particular model writes
* A `set_task_plan` tool lets the model state the steps a task breaks down
  into before starting, and its progress is recited against that plan every
  turn. Until now the task was inferred by pulling file paths out of the
  user's message with a regex, which works for "fix a.py and b.py" and gives
  nothing at all for "fix the failing tests". Measured against the eval
  fixture, both tested models skip the tool when the request already names
  the files - reasonably, since nothing needs planning - and call it when the
  request is vague, which is the case it exists for
* An explicit `task_complete` tool now ends an agent turn. Without a terminal
  state, "is the task finished?" could only be inferred - from whether the
  model happened to call another tool, or from whether its prose sounded like
  a conclusion - so ending a turn was indistinguishable from stalling in the
  middle of one. Calling it is checked against the task plan first: if a file
  the request named is still unedited, or something it asked to be checked
  wasn't, the call comes back saying so and the model carries on, the way
  Copilot's agent harness sends its autonomous mode back to work
* A file the request names as the outcome rather than the work ("fix A and B
  so that `src/main.py` runs") now becomes a verification step: once every
  file to change has been changed, what's left is to run it and report the
  result, instead of declaring the task finished without ever testing it
* An action the agent only *described* is now carried out instead of being
  asked for again. A response that ends the turn with a code block preceded
  by a file path is turned into a real `edit_existing_file` call, and one
  that names a file the task still needs but makes no call is turned into a
  read - the description already contains everything the call needs, only
  the model's formatting of it was missing. This is the same bet the
  plain-text tool-call recovery makes, one level up: there the JSON was
  present but unparsed, here the intent was never expressed as JSON at all.
  The reconstructed call is indistinguishable from a real one downstream, so
  per-tool permission prompts, the repeated-call guard and the accept/reject
  diff UI all still apply
### Fixed
* The edit tool's own description told the model to abbreviate large edits
  with placeholders like `// ... existing code ...`, which is a completely
  different, much slower code path: a full-file edit is applied instantly
  and deterministically, but an abbreviated one has to be merged back into
  the file by a *second, invisible LLM call* that isn't shown as part of
  the conversation - if that call is slow or stalls, the agent looks like
  it's hung after the tool call with no explanation at all. The tool now
  asks for the complete new file content instead, which skips that second
  call entirely for the common case; the stall-timeout fix above still
  covers it for the cases where a partial edit slips through anyway
* The task-state block and the stalled-agent nudge told the model not to
  reply with text, which was aimed at it describing a step *instead of*
  taking one - but it also suppressed the running commentary that makes
  agent mode readable, leaving bare tool calls scrolling past with no
  explanation. Both now ask for one short sentence *and* the tool call in
  the same reply
* The task-state block named the same file two ways - the user's wording
  ("math_utils/stats.py") under "still to change" and the real path
  ("agent-test-app/lib/math_utils/stats.py") under "already read". Read as
  two different files, that sent the model off to re-read the one it had
  just been told it already had. Every path in the block is now the one the
  tool calls proved it resolves to
* The Apply button on a code block only worked if you had already opened the
  target file yourself. It opened a file only when it had just *created* one,
  so an existing file was left alone and the change landed in whatever editor
  happened to be focused - or failed with "No active editor" when none was.
  It also used the path raw, and the path comes from a code block's info
  string, which is routinely partial (`report/format.py` for
  `inventory-app/src/report/format.py`); that failed the existence check, so
  an empty file was written at the made-up path. Apply now resolves paths the
  same tolerant way every tool does, and always opens the file it is applying
  to
* An edit the model printed as a code block instead of making was only
  converted into a real edit when the turn then stalled. The commonest shape
  of this doesn't stall: the model prints the fixed code and carries straight
  on to the next file, leaving the change behind an Apply button the user has
  to notice and click. Printed edits are now applied however the turn ended
* Reading a file that had a diff waiting for accept/reject gave back the new
  content shot through with runs of blank lines: a pending diff doesn't
  delete the removed lines, it replaces them with blanks and holds the old
  text in a decoration. An agent reading back a file it had just edited saw
  something matching neither its edit nor the original, so it couldn't
  confirm its own change and would edit again or stall - which is why the
  agent only kept moving if you accepted the diff quickly. Reads now drop
  those placeholders and return the file as it will be once accepted
* The stalled-agent nudge fired even when the task plan showed every file
  already changed, so a run that had done the whole job correctly got
  prodded twice and was then reported to the user as having stopped without
  finishing. A fully covered plan now ends the turn
* A terminal command that ran but exited non-zero was counted as having
  verified the thing it ran. The failure is recorded in the result's status
  rather than as a tool error, so the call still looked successful - which
  let a model run the very program it was asked to fix, watch it crash, and
  report the task complete on the strength of it
* The terminal tool now corrects a wrong path and retries, instead of only
  reporting where the file really is. Commands run from the workspace root
  while the model writes paths relative to whatever file it was last reading,
  and being told the right path did not help - it reissued the same wrong
  command and the run ended there. The retry is deliberately narrow: only
  when the failure means nothing actually ran, never for a command containing
  `rm`, `mv`, `dd`, `truncate` or a redirect, and only once
* "New Assistant" in the model picker silently did nothing when clicked. It
  opened a hosted-hub URL to create a synced assistant config there - a flow
  this fork removed along with the rest of the hosted-account system, and
  its fallback (a hosted sign-in prompt) is stubbed out here to always report
  "not signed in" without visibly failing. It now opens the local
  `config.yaml` for editing, the same as the existing "Edit config" action
* A repeated read-only tool call was blocked outright, which could deadlock
  a turn: the block message told the model to re-read the file to check its
  work, but that re-read was itself the blocked call, so two read-only calls
  could alternate as permanently blocked forever. A read is idempotent, so a
  repeat is wasteful but never harmful - it now runs and returns its result
  with an explicit note that nothing has changed since last time. Blocking
  is reserved for tools that actually change something
* Opening a new chat left the previous session's tool-call apply/diff state
  behind, since `newSession` reset the conversation but not that state
* After a tool call finished, the agent could cleanly end its turn without
  moving on to the rest of a multi-step task - either silently (no
  explanation at all) or by announcing the next step and then not taking
  it, and a generic "continue" nudge often didn't land either. Nudges
  following a tool result retry up to twice, targeted at the plan's next
  unfinished file (see Added above) rather than a generic prompt, and if
  the model still won't call a tool, a visible notice names what's
  unfinished instead of the turn just ending with nothing further. This
  remains a best-effort mitigation, not a guarantee: no amount of prompt
  wording or bookkeeping can force a model to comply on its own - it can
  only make the retry attempt correct and make failure visible instead of
  silent
* A streaming response that goes completely silent mid-request (a stalled
  model server, a dropped connection) used to hang forever with no error
  and no way to tell it apart from the model still thinking - Agent mode in
  particular could look like it simply stopped after a tool call with no
  explanation. Any provider streaming through `core/llm/stream.ts` now
  errors out visibly if 3 minutes pass with no data at all, rather than
  hanging indefinitely
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
