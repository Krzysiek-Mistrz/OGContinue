import { IDE } from "../..";
import { runTerminalCommandImpl } from "./runTerminalCommand";

const ROOT_PATH = "/tmp/ogcontinue-terminal-test";
const ROOT = `file://${ROOT_PATH}`;
const FILES = ["agent-test-app/src/main.py", "agent-test-app/lib/math_utils/stats.py"];

const ide = {
  getIdeInfo: async () => ({ remoteName: "local" }),
  getWorkspaceDirs: async () => [ROOT],
  fileExists: async (uri: string) =>
    FILES.some((f) => uri === `${ROOT}/${f}` || `${ROOT}/${f}`.startsWith(`${uri}/`)),
  getFileResults: async (pattern: string) => {
    const regex = new RegExp(
      "^" + pattern.replace(/\*\*\//g, "(?:.*/)?").replace(/\/\*\*$/, "/.*") + "$",
    );
    return FILES.filter((f) => regex.test(f));
  },
} as unknown as IDE;

describe("terminal command failure hints", () => {
  test("points at the real location of a path the command got wrong", async () => {
    const result = await runTerminalCommandImpl(
      { command: "python src/main.py" },
      { ide, toolCallId: "t1" } as any,
    );
    const content = result[0].content;

    expect(content).toContain(`The command ran in ${ROOT_PATH}`);
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
