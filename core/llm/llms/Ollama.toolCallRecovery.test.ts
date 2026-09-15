import { Tool } from "../../index";
import {
  tryRecoverPythonCallFromText,
  tryRecoverToolCallFromText,
} from "./Ollama";

const TOOLS = ["builtin_edit_existing_file", "builtin_read_file"];

const TOOL_SCHEMAS: Tool[] = [
  {
    type: "function",
    displayTitle: "Edit File",
    group: "builtin",
    readonly: false,
    function: {
      name: "builtin_edit_existing_file",
      parameters: {
        type: "object",
        required: ["filepath", "changes"],
        properties: {
          filepath: { type: "string" },
          changes: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    displayTitle: "Read File",
    group: "builtin",
    readonly: true,
    function: {
      name: "builtin_read_file",
      parameters: {
        type: "object",
        required: ["filepath"],
        properties: {
          filepath: { type: "string" },
        },
      },
    },
  },
];

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

  test("recovers a bare '<tool_name> {args}' call with no name/arguments envelope", () => {
    const recovered = tryRecoverToolCallFromText(
      'Let\'s read the file.\n\nbuiltin_read_file {"filepath":"Rust-Tic-Tac-Toe/main.rs"}',
      TOOLS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_read_file",
      args: { filepath: "Rust-Tic-Tac-Toe/main.rs" },
      remainingText: "Let's read the file.",
    });
  });

  test("ignores a bare object whose preceding word is not a valid tool name", () => {
    expect(
      tryRecoverToolCallFromText('some_setting {"model": "qwen"}', TOOLS),
    ).toBeNull();
  });
});

describe("recovering a tool call printed as Python-style call syntax", () => {
  test("maps positional string arguments onto the tool's parameter order", () => {
    const recovered = tryRecoverPythonCallFromText(
      'I will fix report/format.py.\n\n```python\nbuiltin_edit_existing_file("report/format.py", "def format_line(item_name, quantity, unit_price):\\n    return item_name")\n```',
      TOOL_SCHEMAS,
    );
    expect(recovered?.name).toBe("builtin_edit_existing_file");
    expect((recovered?.args as any).filepath).toBe("report/format.py");
    expect((recovered?.args as any).changes).toContain(
      "def format_line(item_name, quantity, unit_price):",
    );
  });

  test("handles a single string argument", () => {
    const recovered = tryRecoverPythonCallFromText(
      'builtin_read_file("report/format.py")',
      TOOL_SCHEMAS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_read_file",
      args: { filepath: "report/format.py" },
    });
  });

  test("unescapes newlines inside a single-quoted argument", () => {
    const recovered = tryRecoverPythonCallFromText(
      "builtin_edit_existing_file('a.py', 'line one\\nline two')",
      TOOL_SCHEMAS,
    );
    expect((recovered?.args as any).changes).toBe("line one\nline two");
  });

  test("handles a triple-quoted argument containing a comma and parens", () => {
    const recovered = tryRecoverPythonCallFromText(
      'builtin_edit_existing_file("a.py", """def f(x, y):\n    return (x, y)""")',
      TOOL_SCHEMAS,
    );
    expect((recovered?.args as any).changes).toBe(
      "def f(x, y):\n    return (x, y)",
    );
  });

  test("strips the matched call out of the remaining text", () => {
    const recovered = tryRecoverPythonCallFromText(
      'Fixing it now.\n\n```python\nbuiltin_read_file("a.py")\n```',
      TOOL_SCHEMAS,
    );
    expect(recovered?.remainingText).not.toContain("builtin_read_file");
  });

  test("returns null when there is no matching call", () => {
    expect(
      tryRecoverPythonCallFromText("Just some prose about a.py", TOOL_SCHEMAS),
    ).toBeNull();
  });

  test("returns null for an unterminated call", () => {
    expect(
      tryRecoverPythonCallFromText(
        'builtin_read_file("a.py',
        TOOL_SCHEMAS,
      ),
    ).toBeNull();
  });

  test("recovers Gemma's tool_code.<name>(...) namespaced, prefix-dropped call", () => {
    const recovered = tryRecoverPythonCallFromText(
      '<tool_code>\nprint(tool_code.read_file("report/format.py"))\n</tool_code>',
      TOOL_SCHEMAS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_read_file",
      args: { filepath: "report/format.py" },
    });
  });

  test("recovers a bare prefix-dropped call with no namespace", () => {
    const recovered = tryRecoverPythonCallFromText(
      'edit_existing_file("a.py", "print(1)")',
      TOOL_SCHEMAS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_edit_existing_file",
      args: { filepath: "a.py", changes: "print(1)" },
    });
  });

  test("maps an invented tool name's keyword arguments onto the real tool", () => {
    const recovered = tryRecoverPythonCallFromText(
      "<|tool_call>call:file_manager.write_file(file_path='report/format.py', content='def f(): pass')",
      TOOL_SCHEMAS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_edit_existing_file",
      args: { filepath: "report/format.py", changes: "def f(): pass" },
    });
  });

  test("resolves keyword arguments in a different order than the tool declares them", () => {
    const recovered = tryRecoverPythonCallFromText(
      "builtin_edit_existing_file(content='new text', file_path='a.py')",
      TOOL_SCHEMAS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_edit_existing_file",
      args: { filepath: "a.py", changes: "new text" },
    });
  });

  test("recovers an invented write_file(...) call nested inside another invented wrapper call, with positional triple-quoted content", () => {
    const recovered = tryRecoverPythonCallFromText(
      '<|tool_call>call:tool_code_interpreter{code:<|"|>file_manager.write_file("report/format.py", """def format_line(item_name: str, quantity: int, unit_price: float) -> str:\n    return "Item: " + item_name + " x" + str(quantity) + " @ " + str(unit_price)\n\ndef format_total(label: str, amount: float) -> str:\n    return label + ": " + str(amount)""")<|"|>}<tool_call|>',
      TOOL_SCHEMAS,
    );
    expect(recovered).toMatchObject({
      name: "builtin_edit_existing_file",
      args: { filepath: "report/format.py" },
    });
    expect((recovered?.args as any).changes).toContain(
      "def format_line(item_name: str, quantity: int, unit_price: float) -> str:",
    );
  });
});
