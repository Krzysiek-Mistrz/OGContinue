import { tryRecoverToolCallFromText } from "./Ollama";

const TOOLS = ["builtin_edit_existing_file", "builtin_read_file"];

describe("recovering a tool call printed as text", () => {
  test("recovers a complete object", () => {
    const recovered = tryRecoverToolCallFromText(
      'Let\'s fix it.\n\n{"name": "builtin_read_file", "arguments": {"filepath": "a/b.py"}}',
      TOOLS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_read_file",
      args: { filepath: "a/b.py" },
      remainingText: "Let's fix it.",
    });
  });

  test("recovers an object cut off before its closing brace", () => {
    const recovered = tryRecoverToolCallFromText(
      'Let\'s fix the type mismatches.\n\n {"name": "builtin_edit_existing_file", "arguments": {"filepath": "agent-test-app/src/formatters/text.py", "changes": "def format_report(user_name: str, score: int) -> str:\\n    return f\'ok\'"}',
      TOOLS,
    );
    expect(recovered?.name).toBe("builtin_edit_existing_file");
    expect((recovered?.args as any).filepath).toBe(
      "agent-test-app/src/formatters/text.py",
    );
    expect((recovered?.args as any).changes).toContain("def format_report");
    expect(recovered?.remainingText).toBe("Let's fix the type mismatches.");
  });

  test("recovers an object cut off after a trailing comma", () => {
    const recovered = tryRecoverToolCallFromText(
      '{"name": "builtin_read_file", "arguments": {"filepath": "a/b.py"},',
      TOOLS,
    );
    expect(recovered?.name).toBe("builtin_read_file");
  });

  test("refuses to complete a cut that landed inside a string", () => {
    expect(
      tryRecoverToolCallFromText(
        '{"name": "builtin_edit_existing_file", "arguments": {"filepath": "a/b.py", "changes": "def format_report(user',
        TOOLS,
      ),
    ).toBeNull();
  });

  test("ignores objects that are not tool calls", () => {
    expect(
      tryRecoverToolCallFromText('Config: {"model": "qwen"}', TOOLS),
    ).toBeNull();
  });
});
