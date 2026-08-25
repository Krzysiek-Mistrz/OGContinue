<h1 align="center">OGContinue</h1>

<div align="center">

**OGContinue is a community-maintained fork of [Continue](https://docs.continue.dev) (based on the `v1.0.10-vscode` tag), focused on running fully locally with local models — no cloud, no accounts, no telemetry required. It is not affiliated with or endorsed by Continue Dev, Inc.**

</div>

> **About this fork**
> OGContinue was created because upstream Continue development had slowed down while this snapshot of the project still worked well and had few outstanding bugs. This fork exists to keep it alive, fix issues, and add functionality (working Agent mode, in-file Keep/Undo for edits, and better defaults for local-model workflows) for people who want a genuinely local AI coding assistant.
> Distributed under the same [Apache 2.0](./LICENSE) license as the original project. See [CHANGES.md](./CHANGES.md) for a summary of what's different from upstream.
>
> "Continue" and the Continue logo are trademarks of Continue Dev, Inc. This is an independent, unofficial fork; no trademark rights are claimed or implied.
>
> **Platform focus:** OGContinue targets **VS Code only**. The JetBrains/IntelliJ and CLI variants inherited from upstream have been removed from this repo — all effort goes into making the VS Code extension work well.

<div align="center">

<a target="_blank" href="https://opensource.org/licenses/Apache-2.0" style="background:none">
    <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" style="height: 22px;" />
</a>
<a target="_blank" href="https://github.com/Krzysiek-Mistrz/OGContinue" style="background:none">
    <img src="https://img.shields.io/badge/fork_of-continuedev%2Fcontinue-%23BE1B55" style="height: 22px;" />
</a>

<p></p>

## Why OGContinue?

Upstream Continue treats local models as a secondary path — most of its polish targets hosted, API-key models. OGContinue flips that: **local models via [Ollama](https://ollama.com) are the primary target**, not an afterthought, because they were the most neglected part of the original project.

Concretely, that means Chat, Autocomplete, Edit, and Agent are all made to work reliably with local models — including small (7B-class and below) ones that struggle with tool-calling and instruction-following compared to hosted frontier models. Agent mode in particular gets extra recovery logic (tolerant path resolution, stuck-loop detection with a nudge back on track, tool-call output that actually confirms a change landed) specifically because small local models trip on things large hosted models rarely do. Larger local models and hosted API-key models still work exactly as before — this is about not leaving the smaller end of the range broken.

## Chat

Ask questions about your code, get explanations, or brainstorm — without leaving the IDE.

<img src="./extensions/vscode/media/chat.png" alt="Chat mode" width="800" />

## Autocomplete

Inline code suggestions as you type, powered by a local autocomplete model.

<img src="./extensions/vscode/media/autocomplete.png" alt="Autocomplete" width="800" />

## Edit

Modify code in place, right in your current file, without switching to chat.

<img src="./extensions/vscode/media/edit.png" alt="Edit mode" width="800" />

## Agent

Let the model use tools (read files, run commands, apply edits) to make larger changes across your codebase.

<img src="./extensions/vscode/media/agent.png" alt="Agent mode" width="800" />

</div>

## How the modes work together

Everything happens inside one continuous session — there's no separate "start a new chat" step for each mode:

- **`Ctrl+L`** — adds the current context (selection/file) to your **active session** and switches it to **Chat** mode. If no session is open yet, it starts one.
- **`Ctrl+I`** — adds the current context to your **active session** and switches it to **Edit** mode, so the model edits the file in place instead of just replying in chat. If no session is open yet, it starts one.
- **Agent** is a manual toggle inside the session — turn it on when you want the model to use tools (read files, run terminal commands, apply multi-file edits) instead of just chatting or doing a single edit.

In short: `Ctrl+L`/`Ctrl+I` never throw away your current conversation — they just switch what the *next* message does with it. A brand-new session only starts if you don't already have one open.

## Getting Started

OGContinue is built from the upstream Continue codebase, so most general usage docs at [continue.dev/docs](https://continue.dev/docs) still apply.

**To run it fully locally (recommended):** install [Ollama](https://ollama.com), pull a model, and paste a ready-to-use `config.yaml` — see [docs/LOCAL_SETUP.md](./docs/LOCAL_SETUP.md) for copy-paste instructions (Ollama install, model picks, local `config.yaml` for chat/autocomplete/embed, and an optional example for BYO-API-key cloud models — Anthropic/OpenAI/Google — if you'd rather use those instead of local models).

**Building from source / installing your own build:** see [extensions/vscode/vsc-extension-quickstart.md](./extensions/vscode/vsc-extension-quickstart.md).

## Contributing

This is a small community fork — issues and PRs are welcome on [this repository](https://github.com/Krzysiek-Mistrz/OGContinue). See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development setup. For contributing to upstream Continue itself, see the [original project](https://github.com/continuedev/continue).

## License

Apache 2.0. Original work © 2023-2024 Continue Dev, Inc. Modifications © 2026 Krzysiek-Mistrz. See [LICENSE](./LICENSE) and [CHANGES.md](./CHANGES.md).
