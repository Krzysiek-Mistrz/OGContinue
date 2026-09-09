import { describe, expect, test } from "vitest";
import {
  buildTaskStateRecitation,
  collectTaskProgress,
  reasonTaskIncomplete,
} from "./taskStateRecitation";

function toolItem(name: string, filepath: string, status = "done") {
  return {
    message: { role: "assistant", content: "", id: filepath + status },
    contextItems: [],
    toolCallState: {
      toolCallId: name + filepath,
      toolCall: { id: "1", type: "function", function: { name, arguments: "" } },
      status,
      parsedArgs: { filepath },
    },
  } as any;
}

function terminalItem(command: string) {
  return {
    message: { role: "assistant", content: "", id: command },
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
    },
  } as any;
}

const PLAN = ["formatters/text.py", "math_utils/stats.py"];

describe("collectTaskProgress", () => {
  test("separates reads from edits and reports what the plan still needs", () => {
    const history = [
      toolItem("builtin_read_file", "agent-test-app/src/formatters/text.py"),
      toolItem("builtin_read_file", "agent-test-app/lib/math_utils/stats.py"),
      toolItem("builtin_edit_existing_file", "agent-test-app/src/formatters/text.py"),
    ];
    const progress = collectTaskProgress(history, PLAN);

    expect(progress.edited).toEqual(["agent-test-app/src/formatters/text.py"]);
    // The edited file is reported as edited, not also as read.
    expect(progress.read).toEqual(["agent-test-app/lib/math_utils/stats.py"]);
    expect(progress.pending).toEqual(["agent-test-app/lib/math_utils/stats.py"]);
  });

  test("a failed or blocked call is not progress", () => {
    const history = [
      toolItem("builtin_read_file", "agent-test-app/formatters/text.py", "errored"),
      toolItem("builtin_edit_existing_file", "agent-test-app/src/formatters/text.py", "errored"),
    ];
    const progress = collectTaskProgress(history, PLAN);

    expect(progress.read).toEqual([]);
    expect(progress.edited).toEqual([]);
    expect(progress.pending).toEqual(PLAN);
  });
});

describe("buildTaskStateRecitation", () => {
  test("nothing to recite at the very start of a task", () => {
    expect(buildTaskStateRecitation([], [])).toBeUndefined();
  });

  test("names the already-read files and the next action", () => {
    const history = [
      toolItem("builtin_read_file", "agent-test-app/src/formatters/text.py"),
      toolItem("builtin_edit_existing_file", "agent-test-app/src/formatters/text.py"),
      toolItem("builtin_read_file", "agent-test-app/lib/math_utils/stats.py"),
    ];
    const content = buildTaskStateRecitation(history, PLAN)!.content as string;

    expect(content).toContain("Already changed: agent-test-app/src/formatters/text.py");
    expect(content).toContain("do not read them again");
    expect(content).toContain("agent-test-app/lib/math_utils/stats.py");
    expect(content).toContain(
      "Still to change: agent-test-app/lib/math_utils/stats.py",
    );
    expect(content).toContain(
      "Next action: agent-test-app/lib/math_utils/stats.py",
    );
  });

  test("says the task is finished once every plan target is edited", () => {
    const history = [
      toolItem("builtin_edit_existing_file", "agent-test-app/src/formatters/text.py"),
      toolItem("builtin_edit_existing_file", "agent-test-app/lib/math_utils/stats.py"),
    ];
    const content = buildTaskStateRecitation(history, PLAN)!.content as string;

    expect(content).not.toContain("Still to change");
    expect(content).toContain("Nothing is left from the original request");
  });
});

describe("naming a file consistently", () => {
  test("a pending target is reported by the path tool calls proved, not the user's wording", () => {
    const history = [
      toolItem("builtin_read_file", "agent-test-app/lib/math_utils/stats.py"),
    ];
    const content = buildTaskStateRecitation(history, ["math_utils/stats.py"])!
      .content as string;

    // The bug this guards: saying "already read agent-test-app/lib/.../stats.py"
    // and "still to change math_utils/stats.py" reads as two different files,
    // so the model re-reads the one it was just told it already had.
    expect(content).toContain(
      "Still to change: agent-test-app/lib/math_utils/stats.py",
    );
    expect(content).not.toContain("Still to change: math_utils/stats.py");
  });

  test("asks for prose and the call together, never for silence", () => {
    const history = [toolItem("builtin_read_file", "lib/stats.py")];
    const content = buildTaskStateRecitation(history, ["lib/stats.py"])!
      .content as string;

    expect(content).toContain("one short sentence");
    expect(content).not.toContain("rather than describing");
  });
});

describe("verification targets", () => {
  const PLAN = ["formatters/text.py"];
  const VERIFY = ["src/main.py"];

  test("an all-edited plan is still unfinished while the outcome is unchecked", () => {
    const history = [
      toolItem("builtin_edit_existing_file", "agent-test-app/src/formatters/text.py"),
    ];
    const progress = collectTaskProgress(history, PLAN, VERIFY);
    expect(progress.pending).toEqual([]);
    expect(progress.unverified).toEqual(["src/main.py"]);

    const content = buildTaskStateRecitation(history, PLAN, VERIFY)!
      .content as string;
    expect(content).toContain("Next action: verify src/main.py");
  });

  test("running it clears the verification", () => {
    const history = [
      toolItem("builtin_edit_existing_file", "agent-test-app/src/formatters/text.py"),
      terminalItem("python agent-test-app/src/main.py"),
    ];
    const progress = collectTaskProgress(history, PLAN, VERIFY);
    expect(progress.unverified).toEqual([]);

    const content = buildTaskStateRecitation(history, PLAN, VERIFY)!
      .content as string;
    expect(content).toContain("Nothing is left from the original request");
  });
});

describe("the task_complete gate", () => {
  const PLAN = ["report/format.py", "calc/stats.py"];
  const VERIFY = ["src/main.py"];

  const editFormat = toolItem(
    "builtin_edit_existing_file",
    "inventory-app/src/report/format.py",
  );
  const editStats = toolItem(
    "builtin_edit_existing_file",
    "inventory-app/lib/calc/stats.py",
  );
  const runMain = terminalItem("python inventory-app/src/main.py");

  test("rejects a completion claimed after only half the work", () => {
    const reason = reasonTaskIncomplete([editFormat], PLAN, VERIFY);
    // No successful call has touched this one yet, so there is no proven path
    // to quote - the request's own wording is all that can honestly be used.
    expect(reason).toContain("calc/stats.py");
    expect(reason).toContain("has not been edited");
  });

  test("names the real path once a tool call has proven it", () => {
    const readStats = toolItem(
      "builtin_read_file",
      "inventory-app/lib/calc/stats.py",
    );
    const reason = reasonTaskIncomplete([editFormat, readStats], PLAN, VERIFY);
    expect(reason).toContain("inventory-app/lib/calc/stats.py");
  });

  test("rejects a completion claimed without the check the request asked for", () => {
    const reason = reasonTaskIncomplete([editFormat, editStats], PLAN, VERIFY);
    expect(reason).toContain("src/main.py");
    expect(reason).toContain("Run it with the terminal tool");
  });

  test("accepts a completion once the work and the check are both done", () => {
    expect(
      reasonTaskIncomplete([editFormat, editStats, runMain], PLAN, VERIFY),
    ).toBeUndefined();
  });

  test("a failed edit does not count towards completion", () => {
    const failedStats = toolItem(
      "builtin_edit_existing_file",
      "inventory-app/lib/calc/stats.py",
      "errored",
    );
    const reason = reasonTaskIncomplete(
      [editFormat, failedStats, runMain],
      PLAN,
      VERIFY,
    );
    expect(reason).toContain("calc/stats.py");
  });

  test("a request with no extractable plan is taken at its word", () => {
    expect(reasonTaskIncomplete([], [], [])).toBeUndefined();
  });
});
