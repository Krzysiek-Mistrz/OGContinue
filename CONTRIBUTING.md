# Contributing to OGContinue

## Table of Contents

- [Contributing to OGContinue](#contributing-to-ogcontinue)
  - [Table of Contents](#table-of-contents)
- [Ways to Contribute](#ways-to-contribute)
  - [Report Bugs](#report-bugs)
  - [Suggest Enhancements](#suggest-enhancements)
  - [Updating Documentation](#updating-documentation)
  - [Contributing Code](#contributing-code)
    - [Environment Setup](#environment-setup)
      - [Pre-requisites](#pre-requisites)
      - [Fork the Repository](#fork-the-repository)
      - [VS Code Debugging](#vs-code-debugging)
    - [Pull Request Workflow](#pull-request-workflow)
    - [Formatting](#formatting)
    - [Testing](#testing)
    - [Review Process](#review-process)
  - [Contributing New LLM Providers/Models](#contributing-new-llm-providersmodels)
    - [Adding an LLM Provider](#adding-an-llm-provider)
    - [Adding Models](#adding-models)
  - [Architecture](#architecture)

# Ways to Contribute

## Report Bugs

If you find a bug, please [open an issue](https://github.com/Krzysiek-Mistrz/OGContinue/issues) to report it. A good bug report includes:

- A description of the bug
- Steps to reproduce
- What you expected to happen
- What actually happened
- Screenshots or videos, if relevant

## Suggest Enhancements

- First, check whether a similar proposal already exists among the [issues](https://github.com/Krzysiek-Mistrz/OGContinue/issues).
- If not, open a new issue describing the enhancement in as much detail as you can, and why it would be useful.

## Updating Documentation

Documentation lives directly in this repository as plain Markdown files (README.md, CHANGES.md, docs/) rather than a separate hosted site. If you see something out of date or missing, open a PR editing the relevant `.md` file directly.

## Contributing Code

We welcome contributions from developers of all experience levels. The goal is to keep the process simple and predictable.

### Environment Setup

#### Pre-requisites

You should have Node.js version 20.19.0 (LTS) or higher installed. You can get it from [nodejs.org](https://nodejs.org/en/download), or if you use NVM, run the following in the root of the project:

```bash
nvm use
```

#### Fork the Repository

1. Fork [Krzysiek-Mistrz/OGContinue](https://github.com/Krzysiek-Mistrz/OGContinue) to your own GitHub account.
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/OGContinue.git`
3. Create a feature/fix branch from `main`: `git checkout -b my-feature-branch`
4. Open a pull request against `main` when ready.

#### VS Code Debugging

1. Open the VS Code command palette (`cmd/ctrl+shift+p`), select `Tasks: Run Task`, then `install-all-dependencies`.
2. Start debugging:
   1. Switch to the Run and Debug view.
   2. Select `Launch extension` from the dropdown.
   3. Hit play.
   4. This opens a new VS Code window with the extension installed (the _Host VS Code_), separate from the window you're debugging from (the _Main VS Code_).
3. To package the extension: run `npm run package` in `extensions/vscode`, or select `Tasks: Run Task` then `vscode-extension:package`. This generates `extensions/vscode/build/ogcontinue-{VERSION}.vsix`, installable by right-clicking and selecting "Install Extension VSIX".

**Breakpoints** work in both `core` and `extensions/vscode` while debugging, but are not currently supported inside `gui` code.

**Hot-reloading** is enabled via Vite for `gui` changes — they should appear without a rebuild, though the _Host VS Code_ window may need a manual reload in some cases. Changes to `core` or `extensions/vscode` require reloading the _Host VS Code_ window (`cmd/ctrl+shift+p` → "Reload Window").

### Pull Request Workflow

This project keeps a single permanent branch, `main`. The workflow is intentionally simple:

1. Open an issue (or comment on an existing one) before starting non-trivial work, so effort isn't wasted on something that won't be merged.
2. Branch from `main`, keep the change focused — unrelated fixes go in separate PRs.
3. Write or update tests for new functionality.
4. Open a PR against `main`, describing what changed and why.
5. Address review feedback.
6. Once approved, the PR is merged into `main`.

### Formatting

This project uses [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) for JavaScript/TypeScript. Install the Prettier extension in VS Code and enable "Format on Save".

### Testing

There's a mix of unit, functional, and e2e tests, run on each pull request. If a PR causes a test to fail, that needs to be resolved before merging. Please add or update tests to cover what you changed.

### Review Process

- A maintainer reviews the PR.
- Changes may be requested — the goal is code that's correct and maintainable, not just working.
- Once approved, it's merged into `main`.

## Contributing New LLM Providers/Models

### Adding an LLM Provider

OGContinue supports many different LLM "providers" — OpenAI-compatible APIs, Ollama, Together, LM Studio, and more. Existing providers live in [`core/llm/llms`](./core/llm/llms). To add one:

1. Create a new file in `core/llm/llms`, named after the provider, exporting a class that extends `BaseLLM`. The [LlamaCpp provider](./core/llm/llms/LlamaCpp.ts) is a good simple example. At minimum, implement:
   - `providerName` — the identifier for your provider.
   - At least one of `_streamComplete` or `_streamChat` — the function that makes the API request and returns the streamed response. Only one is needed since the codebase converts automatically between "chat" and "raw completion".
2. Add your provider to the `LLMs` array in [core/llm/llms/index.ts](./core/llm/llms/index.ts).
3. If your provider supports images, add it to `PROVIDER_SUPPORTS_IMAGES` in [core/llm/autodetect.ts](./core/llm/autodetect.ts).
4. Add the necessary JSON Schema types to [`config_schema.json`](./extensions/vscode/config_schema.json), so IntelliSense shows the available options when editing `config.json`.
5. Add a short note about your provider in [`docs/`](./docs) — an example `config.json` entry and what options are available.

### Adding Models

Any model that works with a supported provider can be used, but a curated list of recommended models can be auto-configured from the UI or `config.json`. When adding a model, update:

- [config_schema.json](./extensions/vscode/config_schema.json) — the JSON Schema used to validate `config.json`. See `definitions.ModelDescription.allOf` for provider-to-model rules.
- [AddNewModel page](./gui/src/pages/AddNewModel) — controls which model options appear in the sidebar model selection UI:
  1. Add a `ModelPackage` entry in [configs/models.ts](./gui/src/pages/AddNewModel/configs/models.ts).
  2. Add the model to its provider's array in [AddNewModel.tsx](./gui/src/pages/AddNewModel/AddNewModel.tsx) (add the provider too, if needed).
- [index.d.ts](./core/index.d.ts) — add the model name to the `ModelName` type.
- Provider-specific model string translation, where relevant: [Ollama](./core/llm/llms/Ollama.ts), [Together](./core/llm/llms/Together.ts), [Replicate](./core/llm/llms/Replicate.ts).
- [Prompt Templates](./core/llm/index.ts) — check `autodetectTemplateType` returns the correct template type for the new model; add a new template if the model isn't already supported.

## Architecture

The extension is split into two parts:

1. **GUI** — a React application (in `gui/`) that renders chat history, handles user input, slash commands, and context providers. Most state and logic lives here so it stays IDE-independent.
2. **Extension** — the VS Code extension (in `extensions/vscode/`), which implements the [IDE Interface](./core/index.d.ts#L229) so the GUI can request information from, or trigger actions in, the editor. The entry point is [activate.ts](./extensions/vscode/src/activation/activate.ts) — `activateExtension` registers commands and loads the GUI into the sidebar as a webview.
