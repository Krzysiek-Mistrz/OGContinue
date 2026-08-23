import { IDE } from "..";
import { resolveWorkspaceDir, resolveWorkspacePath } from "./ideUtils";

const ROOT = "file:///mnt/arch_storage/Dokumenty/Projekty/continue/manual-testing-sandbox";
const FILES = [
  "agent-test-app/src/main.py",
  "agent-test-app/src/formatters/text.py",
  "agent-test-app/lib/math_utils/stats.py",
  "test.js",
];

const ide = {
  getWorkspaceDirs: async () => [ROOT],
  fileExists: async (uri: string) =>
    uri === ROOT ||
    uri === `${ROOT}/` ||
    FILES.some((f) => uri === `${ROOT}/${f}` || `${ROOT}/${f}`.startsWith(`${uri}/`)),
  getFileResults: async (pattern: string) => {
    const regex = new RegExp(
      "^" + pattern.replace(/\*\*\//g, "(?:.*/)?").replace(/\/\*\*$/, "/.*") + "$",
    );
    return FILES.filter((f) => regex.test(f));
  },
} as unknown as IDE;

describe("path resolution tolerance", () => {
  test.each([
    ["/mnt/arch_storage/Dokumenty/Projekty/continue/manual-testing-sandbox", ROOT],
    ["/", ROOT],
    [".", ROOT],
    ["./", ROOT],
    ["/mnt/arch_storage/Dokumenty/Projekty/continue/manual-testing-sandbox/agent-test-app/src", `${ROOT}/agent-test-app/src`],
    ["src/formatters", `${ROOT}/agent-test-app/src/formatters`],
    ["/src/formatters", `${ROOT}/agent-test-app/src/formatters`],
  ])("resolveWorkspaceDir(%s)", async (input, expected) => {
    expect(await resolveWorkspaceDir(input, ide)).toBe(expected);
  });

  test.each([
    ["/mnt/arch_storage/Dokumenty/Projekty/continue/manual-testing-sandbox/agent-test-app/src/main.py", `${ROOT}/agent-test-app/src/main.py`],
    ["file:///mnt/arch_storage/Dokumenty/Projekty/continue/manual-testing-sandbox/agent-test-app/lib/math_utils/stats.py", `${ROOT}/agent-test-app/lib/math_utils/stats.py`],
    ["src/formatters/text.py", `${ROOT}/agent-test-app/src/formatters/text.py`],
    ["text.py", `${ROOT}/agent-test-app/src/formatters/text.py`],
    ["src/math_utils/stats.py", `${ROOT}/agent-test-app/lib/math_utils/stats.py`],
  ])("resolveWorkspacePath(%s)", async (input, expected) => {
    expect(await resolveWorkspacePath(input, ide)).toBe(expected);
  });
});
