import { Tool } from "../..";

import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

// Explicit terminal state for an agent turn. Without one, "finished?" can only
// be guessed - from another tool call happening, or prose sounding done - and
// a finished turn looks the same as a stalled one. Copilot's harness ends its
// autonomous mode on exactly this signal.
export const taskCompleteTool: Tool = {
  type: "function",
  displayTitle: "Task Complete",
  wouldLikeTo: "finish the task",
  isCurrently: "finishing the task",
  hasAlready: "finished the task",
  readonly: true,
  isInstant: true,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.TaskComplete,
    description:
      "Call this once the user's whole request is finished, to end your turn. Call it ONLY when every file the request named has been dealt with and anything it asked you to check has been checked - not after finishing one step of several. If work remains, call the tool for that work instead. Do not end a turn by describing what is left; either do it, or call this tool to hand back.",
    parameters: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: {
          type: "string",
          description:
            "A short plain-language summary of what you changed and what the result was, for the user to read.",
        },
      },
    },
  },
};
