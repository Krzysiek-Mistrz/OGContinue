import childProcess from "node:child_process";
import util from "node:util";

import { fileURLToPath } from "node:url";
import { ToolImpl } from ".";
import { resolveRelativePathInDir, resolveWorkspacePath } from "../../util/ideUtils";
import { isProcessBackgrounded, removeBackgroundedProcess } from "../../util/processTerminalBackgroundStates";
import { findUriInDirs } from "../../util/uri";

// Commands run from the workspace root, but the model writes paths relative
// to whatever file it was last reading - on failure, say where it actually ran.
const MAX_PATH_HINTS = 3;

// A path-looking token in a command: either something with a slash, or a bare
// filename with an extension.
const TOKEN_PATTERN = /[\w.-]*\/[\w./-]+|\b[\w-]+\.[A-Za-z0-9]+\b/g;

async function describeWrongPaths(
  command: string,
  extras: Parameters<ToolImpl>[1],
): Promise<string> {
  const tokens = command.match(TOKEN_PATTERN);
  if (!tokens) {
    return "";
  }

  const dirs = await extras.ide.getWorkspaceDirs();
  const hints: string[] = [];

  for (const token of new Set(tokens)) {
    if (hints.length >= MAX_PATH_HINTS) {
      break;
    }
    if (await resolveRelativePathInDir(token, extras.ide, dirs)) {
      continue;
    }
    const resolved = await resolveWorkspacePath(token, extras.ide);
    if (!resolved) {
      continue;
    }
    const { relativePathOrBasename } = findUriInDirs(resolved, dirs);
    if (relativePathOrBasename && relativePathOrBasename !== token) {
      hints.push(
        `"${token}" does not exist relative to the working directory, but "${relativePathOrBasename}" does.`,
      );
    }
  }

  return hints.join("\n");
}

/** Corrected command, or undefined - telling the model the right path wasn't enough, it just reissued the wrong one. */
async function correctedCommand(
  command: string,
  extras: Parameters<ToolImpl>[1],
): Promise<{ command: string; note: string } | undefined> {
  const tokens = command.match(TOKEN_PATTERN);
  if (!tokens) {
    return undefined;
  }

  const dirs = await extras.ide.getWorkspaceDirs();
  let corrected = command;
  const fixed: string[] = [];

  for (const token of new Set(tokens)) {
    if (await resolveRelativePathInDir(token, extras.ide, dirs)) {
      continue;
    }
    const resolved = await resolveWorkspacePath(token, extras.ide);
    if (!resolved) {
      continue;
    }
    const { relativePathOrBasename } = findUriInDirs(resolved, dirs);
    if (!relativePathOrBasename || relativePathOrBasename === token) {
      continue;
    }
    corrected = corrected.split(token).join(relativePathOrBasename);
    fixed.push(`${token} -> ${relativePathOrBasename}`);
  }

  return fixed.length
    ? {
        command: corrected,
        note: `The command failed because of a wrong path, so it was retried with the path corrected (${fixed.join(", ")}). Use the corrected path from now on.`,
      }
    : undefined;
}

// Retrying is only safe when nothing ran - a command that got partway through
// may have done half its work, and retrying would compound that.
const NOTHING_RAN =
  /no such file or directory|can'?t open file|cannot find the (?:path|file)|not found|No such file/i;

// retrying reruns an approved command with args the user never saw - fine for
// running something, not fine for anything destructive
const NEVER_RETRY = /(^|[|&;\s])(rm|rmdir|mv|dd|truncate|shred|mkfs)(\s|$)|>/;

async function withPathHints(
  output: string,
  command: string,
  cwd: string,
  extras: Parameters<ToolImpl>[1],
): Promise<string> {
  const hints = await describeWrongPaths(command, extras);
  return [
    output,
    `\nThe command ran in ${cwd}. Paths in a command are relative to that directory.`,
    hints,
  ]
    .filter(Boolean)
    .join("\n");
}

const asyncExec = util.promisify(childProcess.exec);

const runTerminalCommandOnce: ToolImpl = async (args, extras) => {
  // Default to waiting for completion if not specified
  const waitForCompletion = args.waitForCompletion !== false;
  const ideInfo = await extras.ide.getIdeInfo();
  const toolCallId = extras.toolCallId || "";

  if (ideInfo.remoteName === "local" || ideInfo.remoteName === "") {
    // For streaming output
    if (extras.onPartialOutput) {
      return new Promise((resolve, reject) => {
        try {
          const getWorkspaceDirsPromise = extras.ide.getWorkspaceDirs();
          getWorkspaceDirsPromise
            .then((workspaceDirs) => {
              const cwd = fileURLToPath(workspaceDirs[0]);
              let terminalOutput = "";

              if (!waitForCompletion) {
                const status = "Command is running in the background...";
                if (extras.onPartialOutput) {
                  extras.onPartialOutput({
                    toolCallId,
                    contextItems: [
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: "",
                        status: status,
                      },
                    ],
                  });
                }
              }

              // Use spawn instead of exec to get streaming output
              const childProc = childProcess.spawn(args.command, {
                cwd,
                shell: true,
              });

              childProc.stdout?.on("data", (data) => {
                // Skip if this process has been backgrounded
                if (isProcessBackgrounded(toolCallId)) return;

                const newOutput = data.toString();
                terminalOutput += newOutput;

                // Send partial output to UI
                if (extras.onPartialOutput) {
                  const status = waitForCompletion ? "" : "Command is running in the background...";
                  extras.onPartialOutput({
                    toolCallId,
                    contextItems: [
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                        status: status,
                      },
                    ],
                  });
                }
              });

              childProc.stderr?.on("data", (data) => {
                // Skip if this process has been backgrounded
                if (isProcessBackgrounded(toolCallId)) return;

                const newOutput = data.toString();
                terminalOutput += newOutput;

                // Send partial output to UI, status is not required
                if (extras.onPartialOutput) {
                  extras.onPartialOutput({
                    toolCallId,
                    contextItems: [
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                      },
                    ],
                  });
                }
              });

              // If we don't need to wait for completion, resolve immediately
              if (!waitForCompletion) {
                const status = "Command is running in the background...";
                resolve([
                  {
                    name: "Terminal",
                    description: "Terminal command output",
                    content: terminalOutput,
                    status: status,
                  },
                ]);
              }

              childProc.on("close", (code) => {
                // If this process has been backgrounded, clean it up from the map and return
                if (isProcessBackgrounded(toolCallId)) {
                  removeBackgroundedProcess(toolCallId);
                  return;
                }

                if (!waitForCompletion) {
                  // Already resolved, just update the UI with final output
                  if (extras.onPartialOutput) {
                    const status = (code === 0 || !code
                      ? "\nBackground command completed"
                      : `\nBackground command failed with exit code ${code}`)
                    extras.onPartialOutput({
                      toolCallId,
                      contextItems: [
                        {
                          name: "Terminal",
                          description: "Terminal command output",
                          content: terminalOutput,
                          status: status,
                        },
                      ],
                    });
                  }
                } else {
                  // Normal completion, resolve now
                  if (code === 0) {
                    const status = "Command completed";
                    resolve([
                      {
                        name: "Terminal",
                        description: "Terminal command output",
                        content: terminalOutput,
                        status: status
                      },
                    ]);
                  } else {
                    const status = `Command failed with exit code ${code}`;
                    void withPathHints(
                      terminalOutput,
                      args.command,
                      cwd,
                      extras,
                    ).then((content) =>
                      resolve([
                        {
                          name: "Terminal",
                          description: "Terminal command output",
                          content,
                          status,
                        },
                      ]),
                    );
                  }
                }
              });

              childProc.on("error", (error) => {
                // If this process has been backgrounded, clean it up from the map and return
                if (isProcessBackgrounded(toolCallId)) {
                  removeBackgroundedProcess(toolCallId);
                  return;
                }

                reject(error);
              });
            })
            .catch((error) => {
              reject(error);
            });
        } catch (error: any) {
          reject(error);
        }
      });
    } else {
      // Fallback to non-streaming for older clients
      const workspaceDirs = await extras.ide.getWorkspaceDirs();
      const cwd = fileURLToPath(workspaceDirs[0]);

      if (!waitForCompletion) {
        // For non-streaming but also not waiting for completion, use spawn
        // but don't attach any listeners other than error
        try {
          // Use spawn instead of exec but don't wait
          const childProc = childProcess.spawn(args.command, {
            cwd,
            shell: true,
            // Detach the process so it's not tied to the parent
            detached: true,
            // Redirect to /dev/null equivalent (works cross-platform)
            stdio: 'ignore',
          });

          // Even for detached processes, add event handlers to clean up the background process map
          childProc.on("close", () => {
            if (isProcessBackgrounded(toolCallId)) {
              removeBackgroundedProcess(toolCallId);
            }
          });

          childProc.on("error", () => {
            if (isProcessBackgrounded(toolCallId)) {
              removeBackgroundedProcess(toolCallId);
            }
          });

          // Unref the child to allow the Node.js process to exit
          childProc.unref();
          const status = "Command is running in the background...";
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: status,
              status: status,
            },
          ];
        } catch (error: any) {
          const status = `Command failed with: ${error.message || error.toString()}`;
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: status,
              status: status
            },
          ];
        }
      } else {
        // Standard execution, waiting for completion
        try {
          const output = await asyncExec(args.command, { cwd });
          const status = "Command completed";
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: output.stdout ?? "",
              status: status,
            },
          ];
        } catch (error: any) {
          const status = `Command failed with: ${error.message || error.toString()}`;
          return [
            {
              name: "Terminal",
              description: "Terminal command output",
              content: await withPathHints(
                error.stderr ?? error.toString(),
                args.command,
                cwd,
                extras,
              ),
              status: status,
            },
          ];
        }
      }
    }
  }

  // For remote environments, just run the command
  // Note: waitForCompletion is not supported in remote environments yet
  await extras.ide.runCommand(args.command);
  return [
    {
      name: "Terminal",
      description: "Terminal command output",
      content:
        "Terminal output not available. This is only available in local development environments and not in SSH environments for example.",
      status: "Command failed",
    },
  ];
}

function failed(items: Awaited<ReturnType<ToolImpl>>): boolean {
  return items.some((item) => item.status?.startsWith("Command failed"));
}

/** Runs the command; if it failed only on a wrong path, corrects it and retries once. */
export const runTerminalCommandImpl: ToolImpl = async (args, extras) => {
  const result = await runTerminalCommandOnce(args, extras);
  if (!failed(result)) {
    return result;
  }

  const output = result.map((item) => item.content).join("\n");
  if (!NOTHING_RAN.test(output) || NEVER_RETRY.test(args.command)) {
    return result;
  }

  const correction = await correctedCommand(args.command, extras);
  if (!correction) {
    return result;
  }

  const retried = await runTerminalCommandOnce(
    { ...args, command: correction.command },
    extras,
  );
  return retried.map((item) => ({
    ...item,
    content: `${correction.note}\n\n$ ${correction.command}\n${item.content}`,
  }));
};
