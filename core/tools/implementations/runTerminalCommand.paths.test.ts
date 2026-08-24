import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { IDE } from "../..";
import { runTerminalCommandImpl } from "./runTerminalCommand";

const FILES = ["agent-test-app/src/main.py", "agent-test-app/lib/math_utils/stats.py"];

describe("terminal command failure hints", () => {
  // The command actually runs, so its cwd must exist for real - this can't be
  // a made-up path, unlike the fake file:// entries FILES describes below.
  const rootPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "ogcontinue-terminal-test-"),
  );
  const root = `file://${rootPath}`;

  const ide = {
    getIdeInfo: async () => ({ remoteName: "local" }),
    getWorkspaceDirs: async () => [root],
    fileExists: async (uri: string) =>
      FILES.some((f) => uri === `${root}/${f}` || `${root}/${f}`.startsWith(`${uri}/`)),
    getFileResults: async (pattern: string) => {
      const regex = new RegExp(
        "^" + pattern.replace(/\*\*\//g, "(?:.*/)?").replace(/\/\*\*$/, "/.*") + "$",
      );
      return FILES.filter((f) => regex.test(f));
    },
  } as unknown as IDE;

  afterAll(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
  });

  test("points at the real location of a path the command got wrong", async () => {
    const result = await runTerminalCommandImpl(
      { command: "python src/main.py" },
      { ide, toolCallId: "t1" } as any,
    );
    const content = result[0].content;

    expect(content).toContain(`The command ran in ${rootPath}`);
    expect(content).toContain(
      '"src/main.py" does not exist relative to the working directory, but "agent-test-app/src/main.py" does.',
    );
  });

  test("says nothing extra when the command succeeds", async () => {
    const result = await runTerminalCommandImpl(
      { command: "echo hello" },
      { ide, toolCallId: "t2" } as any,
    );
    expect(result[0].content).not.toContain("The command ran in");
  });
});
