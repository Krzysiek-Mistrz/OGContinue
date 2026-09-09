import { describe, expect, test } from "vitest";
import { collectTaskProgress, reasonTaskIncomplete } from "./taskStateRecitation";

function terminal(command: string, status: string) {
  return {
    message: { role: "assistant", content: "", id: command + status },
    contextItems: [],
    toolCallState: {
      toolCallId: command,
      toolCall: {
        id: "1",
        type: "function",
        function: { name: "builtin_run_terminal_command", arguments: "" },
      },
      status: "done",
      parsedArgs: { command },
      output: [{ name: "Terminal", description: "", content: "", status }],
    },
  } as any;
}

function edit(filepath: string) {
  return {
    message: { role: "assistant", content: "", id: filepath },
    contextItems: [],
    toolCallState: {
      toolCallId: filepath,
      toolCall: {
        id: "1",
        type: "function",
        function: { name: "builtin_edit_existing_file", arguments: "" },
      },
      status: "done",
      parsedArgs: { filepath },
      output: [],
    },
  } as any;
}

const PLAN = ["report/format.py", "calc/stats.py"];
const VERIFY = ["src/main.py"];
const EDITS = [
  edit("inventory-app/src/report/format.py"),
  edit("inventory-app/lib/calc/stats.py"),
];

describe("verification clearing", () => {
  test("a successful run clears the verification target", () => {
    const history = [
      ...EDITS,
      terminal("python src/main.py", "Command completed"),
    ];
    expect(collectTaskProgress(history, PLAN, VERIFY).unverified).toEqual([]);
    expect(reasonTaskIncomplete(history, PLAN, VERIFY)).toBeUndefined();
  });

  test("a failed run does not", () => {
    const history = [
      ...EDITS,
      terminal("python src/main.py", "Command failed with: exit 1"),
    ];
    expect(collectTaskProgress(history, PLAN, VERIFY).unverified).toEqual([
      "src/main.py",
    ]);
  });

  test("a later success clears an earlier failure", () => {
    const history = [
      ...EDITS,
      terminal("python src/main.py", "Command failed with: exit 2"),
      terminal("python inventory-app/src/main.py", "Command completed"),
    ];
    expect(collectTaskProgress(history, PLAN, VERIFY).unverified).toEqual([]);
  });
});
