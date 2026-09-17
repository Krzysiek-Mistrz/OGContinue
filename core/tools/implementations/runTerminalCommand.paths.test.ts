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

  // command actually runs for real, so the corrected path needs a real file
  // behind it too, or the retry the impl now does would fail for real
  fs.mkdirSync(path.join(rootPath, "agent-test-app/src"), { recursive: true });
  fs.writeFileSync(
    path.join(rootPath, "agent-test-app/src/main.py"),
    "print('hi')\n",
  );

  afterAll(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
  });

  test("retries with the corrected path and succeeds", async () => {
    const result = await runTerminalCommandImpl(
      { command: "python src/main.py" },
      { ide, toolCallId: "t1" } as any,
    );
    const content = result[0].content;

    expect(content).toContain(
      "retried with the path corrected (src/main.py -> agent-test-app/src/main.py)",
    );
    expect(content).toContain("$ python agent-test-app/src/main.py");
    expect(content).toContain("hi");
    // "ran in X" only gets appended on failure (see the other test below) -
    // the retry succeeded, so none of that extra context is expected here
    expect(result[0].status).not.toMatch(/^Command failed/);
  });

  test("says nothing extra when the command succeeds", async () => {
    const result = await runTerminalCommandImpl(
      { command: "echo hello" },
      { ide, toolCallId: "t2" } as any,
    );
    expect(result[0].content).not.toContain("The command ran in");
  });
});
