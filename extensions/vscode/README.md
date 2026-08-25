<h1 align="center">OGContinue</h1>

<div align="center">

**OGContinue is a community-maintained fork of [Continue](https://docs.continue.dev) (based on the `v1.0.10-vscode` tag), focused on running fully locally with local models — no cloud, no accounts, no telemetry required. It is not affiliated with or endorsed by Continue Dev, Inc.**

</div>

> "Continue" and the Continue logo are trademarks of Continue Dev, Inc. This is an independent, unofficial fork; no trademark rights are claimed or implied.

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

Chat makes it easy to ask for help from an LLM without needing to leave the IDE.

<img src="https://raw.githubusercontent.com/Krzysiek-Mistrz/OGContinue/main/extensions/vscode/media/chat.png" alt="Chat mode" width="800" />

## Autocomplete

Autocomplete provides inline code suggestions as you type.

<img src="https://raw.githubusercontent.com/Krzysiek-Mistrz/OGContinue/main/extensions/vscode/media/autocomplete.png" alt="Autocomplete" width="800" />

## Edit

Edit is a convenient way to modify code without leaving your current file.

<img src="https://raw.githubusercontent.com/Krzysiek-Mistrz/OGContinue/main/extensions/vscode/media/edit.png" alt="Edit mode" width="800" />

## Agent

Agent enables you to make more substantial changes to your codebase.

<img src="https://raw.githubusercontent.com/Krzysiek-Mistrz/OGContinue/main/extensions/vscode/media/agent.png" alt="Agent mode" width="800" />

</div>

## License

Apache 2.0. Original work © 2023-2024 Continue Dev, Inc. Modifications © 2026 Krzysiek-Mistrz. See [LICENSE](./LICENSE) and [CHANGES.md](./CHANGES.md).
