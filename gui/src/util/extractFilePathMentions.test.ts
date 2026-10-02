import { describe, expect, test } from "vitest";
import {
  extractFilePathMentions,
  extractTaskTargets,
  extractVerifyTargets,
} from "./extractFilePathMentions";

describe("extractFilePathMentions", () => {
  test("matches a path with a directory, any extension", () => {
    expect(extractFilePathMentions("fix src/report/format.py")).toEqual([
      "src/report/format.py",
    ]);
  });

  test("matches a bare filename with a known code/doc extension", () => {
    expect(extractFilePathMentions("create main.py at the root")).toEqual([
      "main.py",
    ]);
  });

  test("does not treat an abbreviation as a bare filename", () => {
    expect(extractFilePathMentions("e.g. this works")).toEqual([]);
  });

  test("does not treat a version number as a bare filename", () => {
    expect(extractFilePathMentions("bump to v1.2.3 please")).toEqual([]);
  });
});

describe("extractTaskTargets / extractVerifyTargets with a root-level file", () => {
  const request =
    "Set up a new Python todo-list project with this structure: " +
    "todo_cli/storage.py (...), todo_cli/cli.py (...), and main.py at the " +
    "workspace root that loads the tasks so it runs without errors.";

  test("a root-level file mentioned before the purpose clause is a plan target", () => {
    expect(extractTaskTargets(request)).toEqual([
      "todo_cli/storage.py",
      "todo_cli/cli.py",
      "main.py",
    ]);
  });

  test("the purpose clause's pronoun ('so it runs') refers back to the last plan target, so it's tracked to verify too", () => {
    // main.py is both something to create AND the thing that has to actually run to confirm the task is done
    expect(extractVerifyTargets(request)).toEqual(["main.py"]);
  });
});

describe("extractVerifyTargets distinguishing a genuinely separate verify target", () => {
  test("a different file named after the purpose clause is still the verify target, not the change targets", () => {
    const request =
      "Fix the type errors in report/format.py and the division-by-zero " +
      "crashes in calc/stats.py so that src/main.py runs without errors.";
    expect(extractVerifyTargets(request)).toEqual(["src/main.py"]);
  });
});
