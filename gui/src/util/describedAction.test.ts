import { describe, expect, test } from "vitest";
import { describedAction } from "./describedAction";

describe("describedAction refusing to reconstruct an edit from a garbage fence", () => {
  test("does not treat a bare punctuation-only fence as real file content", () => {
    // A cut-off JSON scrap like this has been observed leaking into a
    // model's narration - reconstructing an edit from it would silently
    // overwrite the file with a single "}".
    const action = describedAction(
      'I will run src/main.py to verify.\n```json\n}\n```',
      [],
      ["src/main.py"],
    );
    expect(action?.toolName).not.toBe("builtin_edit_existing_file");
  });

  test("still reconstructs a real edit from a genuine code fence", () => {
    const action = describedAction(
      "I will fix report/format.py.\n```python report/format.py\nprint('fixed')\n```",
      [],
      [],
    );
    expect(action).toEqual({
      toolName: "builtin_edit_existing_file",
      args: { filepath: "report/format.py", changes: "print('fixed')" },
    });
  });
});

describe("describedAction reconstructing a run command from narration", () => {
  test("recovers a run command for a verify target the model just narrated", () => {
    const action = describedAction(
      "I will run src/main.py to verify that it works without errors.",
      [],
      ["src/main.py"],
    );
    expect(action).toEqual({
      toolName: "builtin_run_terminal_command",
      args: { command: "python src/main.py" },
    });
  });

  test("picks the sole verify target even when the path isn't repeated verbatim", () => {
    const action = describedAction(
      "Run the terminal command to check if it works.",
      [],
      ["src/main.py"],
    );
    expect(action).toEqual({
      toolName: "builtin_run_terminal_command",
      args: { command: "python src/main.py" },
    });
  });

  test("does not guess a command for an unrecognized extension", () => {
    expect(
      describedAction(
        "I will run build/app.bin to verify it works.",
        [],
        ["build/app.bin"],
      ),
    ).toBeUndefined();
  });

  test("does not fire without run intent", () => {
    expect(
      describedAction(
        "The file src/main.py looks correct now.",
        [],
        ["src/main.py"],
      ),
    ).toBeUndefined();
  });

  test("does not fire with no verify targets", () => {
    expect(
      describedAction("I will run src/main.py to verify it works.", [], []),
    ).toBeUndefined();
  });

  test("run narration containing a read-intent word ('check') still reconstructs a run, not a duplicate read", () => {
    const action = describedAction(
      "I will run the terminal command to execute src/main.py and check for any errors.",
      [],
      ["src/main.py"],
    );
    expect(action).toEqual({
      toolName: "builtin_run_terminal_command",
      args: { command: "python src/main.py" },
    });
  });

  test("an edit description still takes priority over a run description", () => {
    const action = describedAction(
      "I will run the fix.\n```python report/format.py\nprint('fixed')\n```",
      [],
      ["src/main.py"],
    );
    expect(action?.toolName).toBe("builtin_edit_existing_file");
  });
});
