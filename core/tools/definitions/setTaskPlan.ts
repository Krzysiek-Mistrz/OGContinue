import { Tool } from "../..";

import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

// The model's own plan, declared up front - what its turn is tracked against.
// Before this, "what does the task consist of?" came from regexing file paths
// out of the request, which is nothing for "fix the failing tests". This
// gives the harness a structure for any request, without scripting the model -
// it still decides what to do next; the plan is just what's recited against.
export const setTaskPlanTool: Tool = {
  type: "function",
  displayTitle: "Plan Task",
  wouldLikeTo: "plan the task",
  isCurrently: "planning the task",
  hasAlready: "planned the task",
  readonly: true,
  isInstant: true,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.SetTaskPlan,
    description:
      "Call this FIRST, before any other tool, to state the steps this task breaks down into. One short line per step, in the order you will do them. Name the file each step concerns whenever you already know it - that is what lets your progress be tracked. If you don't know the paths yet, make finding them the first step and call this tool again once you do. Do not call it again for any other reason.",
    parameters: {
      type: "object",
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          items: { type: "string" },
          description:
            "The steps, each a short line such as 'Fix the type errors in src/report/format.py'. Between two and six of them.",
        },
      },
    },
  },
};
