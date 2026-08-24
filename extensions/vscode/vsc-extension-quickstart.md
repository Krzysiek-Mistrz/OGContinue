# Building and running OGContinue from source

This covers running the VS Code extension from a clone of the repo, for development or to install a build you made yourself. For everyday usage (installing from the Marketplace, model setup), see [docs/LOCAL_SETUP.md](../../docs/LOCAL_SETUP.md) instead.

## 1. Install dependencies

From the **repository root** (not `extensions/vscode`):

```bash
bash scripts/install-dependencies.sh
```

This installs dependencies for every workspace in the monorepo (`core`, `gui`, `extensions/vscode`, etc). Alternatively, in VS Code: Command Palette → `Tasks: Run Task` → `install-all-dependencies`.

## 2. Run it in a debug window (recommended for development)

1. Open the repository root in VS Code.
2. Switch to the Run and Debug view, select `Launch extension` from the dropdown, and hit play (or press `F5`).
3. This opens a second VS Code window (the _Host_) with the extension loaded. The extension in that window uses `extensions/.continue-debug` as its configuration folder.
4. After changing code, either relaunch from the debug toolbar or reload the Host window (`Ctrl+R` / `Cmd+R`).

Breakpoints work in `core` and `extensions/vscode`, but not currently in `gui`. `gui` changes hot-reload via Vite; `core`/`extensions/vscode` changes need a Host window reload.

## 3. Build and install a `.vsix` locally

From `extensions/vscode`:

```bash
npm run package
```

This runs `vsce package --out ./build --no-dependencies` under the hood — `--no-dependencies` matters here: this repo is an npm workspace monorepo, and plain `vsce package` tries to follow the `node_modules/core` workspace symlink out to the sibling `core` package (and its own `node_modules`), which `vsce` can't resolve relative paths for and fails on. All runtime dependencies are already bundled into `out/` by esbuild, so `node_modules` doesn't need to ship in the `.vsix` at all.

The output is `extensions/vscode/build/ogcontinue-<version>.vsix`. Install it with:

```bash
code --install-extension build/ogcontinue-<version>.vsix
```

(replace `<version>` with the version in `extensions/vscode/package.json`, e.g. `1.0.10`).
