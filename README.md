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

## Chat

Chat makes it easy to ask for help from an LLM without needing to leave the IDE.

## Autocomplete

Autocomplete provides inline code suggestions as you type.

## Edit

Edit is a convenient way to modify code without leaving your current file.

## Agent

Agent enables you to make more substantial changes to your codebase.

</div>

## Getting Started

OGContinue is built from the upstream Continue codebase, so most general usage docs at [continue.dev/docs](https://continue.dev/docs) still apply. For local-only setup (recommended Ollama models, RAG config, Agent mode), see [docs/LOCAL_SETUP.md](./docs/LOCAL_SETUP.md) in this repo.

## Contributing

This is a small community fork — issues and PRs are welcome on [this repository](https://github.com/Krzysiek-Mistrz/OGContinue). For contributing to upstream Continue itself, see the [original project](https://github.com/continuedev/continue).

## License

Apache 2.0. Original work © 2023-2024 Continue Dev, Inc. Modifications © 2026 Krzysiek-Mistrz. See [LICENSE](./LICENSE) and [CHANGES.md](./CHANGES.md).
