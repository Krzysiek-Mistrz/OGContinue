/**
 * A filesystem-backed IDE, enough for the real tool implementations to run
 * outside VS Code. It mirrors VsCodeIde where that matters: file search goes
 * through ripgrep with the same ignore handling, so a file the extension
 * cannot see is invisible here too.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveWorkspacePath } from "../../core/util/ideUtils";

const LAZY_MARKER = /\.{3}\s*(.+?)\s*\.{3}/;

export function createFsIde(root: string): any {
  const rootUri = pathToFileURL(root).toString();
  const toPath = (uri: string) =>
    uri.startsWith("file://") ? fileURLToPath(uri) : path.resolve(root, uri);

  const ide: any = {
    getWorkspaceDirs: async () => [rootUri],
    getIdeInfo: async () => ({
      ideType: "vscode",
      name: "runner",
      version: "0",
      remoteName: "local",
      extensionVersion: "0",
      isPrerelease: false,
    }),

    getFileResults: async (pattern: string) => {
      try {
        const out = execFileSync("rg", ["--files", "--iglob", pattern], {
          cwd: root,
          encoding: "utf8",
        });
        return out.split("\n").map((line) => line.trim()).filter(Boolean);
      } catch {
        return [];
      }
    },

    getSearchResults: async (query: string) => {
      try {
        return execFileSync("rg", ["-i", "-C", "2", "--", query], {
          cwd: root,
          encoding: "utf8",
        });
      } catch {
        return "";
      }
    },

    fileExists: async (uri: string) => fs.existsSync(toPath(uri)),
    readFile: async (uri: string) => fs.readFileSync(toPath(uri), "utf8"),
    writeFile: async (uri: string, contents: string) => {
      const target = toPath(uri);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    },
    listDir: async (uri: string) =>
      fs
        .readdirSync(toPath(uri), { withFileTypes: true })
        .map((entry) => [entry.name, entry.isDirectory() ? 2 : 1]),
    openFile: async () => {},
    getCurrentFile: async () => undefined,
    getDiff: async () => [],
    runCommand: async () => {},
    showToast: async () => {},
  };

  ide.applyEdit = async (filepath: string, changes: string) => {
    const resolved = await resolveWorkspacePath(filepath, ide);
    if (!resolved) {
      return {
        ok: false,
        message: `Could not find file ${filepath}. Use the list or glob tools to find the correct path.`,
      };
    }
    if (LAZY_MARKER.test(changes)) {
      return {
        ok: false,
        message:
          "This edit uses '... existing code ...' placeholders. Send the file's complete new content instead.",
      };
    }
    await ide.writeFile(resolved, changes.endsWith("\n") ? changes : `${changes}\n`);
    return {
      ok: true,
      message: `Edit applied. ${filepath} now contains:\n\n${changes}`,
    };
  };

  return ide;
}
