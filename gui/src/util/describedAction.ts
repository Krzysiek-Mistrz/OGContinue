import { ChatHistoryItem } from "core";
import { BuiltInToolNames } from "core/tools/builtIn";
import { renderChatMessage } from "core/util/messageContent";
import { extractFilePathMentions } from "./extractFilePathMentions";


const CODE_FENCE = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;

const EDIT_TOOLS: string[] = [
  BuiltInToolNames.EditExistingFile,
  BuiltInToolNames.CreateNewFile,
];

const PATH_LOOKBEHIND_CHARS = 300;

const READ_INTENT =
  /\b(read|reading|open|look at|inspect|check|view|examine|contents of)\b/i;

const RUN_INTENT =
  /\b(run|running|execute|executing|verify|verifying|test|testing)\b/i;

// conservative on purpose - wrong guess here runs an arbitrary shell cmd, so only
// unambiguous extensions covered, else it falls thru and gets nudged again
const INTERPRETER_BY_EXTENSION: Record<string, string> = {
  py: "python",
  js: "node",
  mjs: "node",
  cjs: "node",
  sh: "bash",
};

export interface DescribedAction {
  toolName: string;
  args: Record<string, string>;
}

export function describedAction(
  text: string,
  pending: string[],
  verifyTargets: string[] = [],
): DescribedAction | undefined {
  return (
    describedEdit(text) ??
    describedReadPending(text, pending) ?? // reliable case: path is still a pending edit target
    // try run before the loose read fallback below - else "check it works" gets
    // misread as re-reading an already-read file (READ_INTENT matches "check" too)
    describedRun(text, verifyTargets) ??
    describedReadFallback(text)
  );
}

function alreadyEdited(filepath: string, history: ChatHistoryItem[]): boolean {
  return history.some((item) => {
    const state = item.toolCallState;
    return (
      !!state &&
      (state.status === "done" || state.status === "calling") &&
      EDIT_TOOLS.includes(state.toolCall.function.name) &&
      typeof state.parsedArgs?.filepath === "string" &&
      (state.parsedArgs.filepath.includes(filepath) ||
        filepath.includes(state.parsedArgs.filepath))
    );
  });
}

export function unappliedCodeBlock(
  history: ChatHistoryItem[],
  fromIndex: number,
): DescribedAction | undefined {
  for (const item of history.slice(fromIndex)) {
    if (item.message.role !== "assistant") {
      continue;
    }
    const action = describedEdit(renderChatMessage(item.message));
    if (action && !alreadyEdited(action.args.filepath, history)) {
      return action;
    }
  }
  return undefined;
}

// bare "}" etc (cut-off json scrap) isn't real content - reconstructing an edit
// from it would silently wipe the file, so require at least 1 real char
const LOOKS_LIKE_REAL_CONTENT = /[A-Za-z0-9_]/;

function describedEdit(text: string): DescribedAction | undefined {
  CODE_FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE.exec(text)) !== null) {
    const [, infoString, body] = match;
    if (!body.trim() || !LOOKS_LIKE_REAL_CONTENT.test(body)) {
      continue;
    }
    const filepath =
      extractFilePathMentions(infoString).at(-1) ??
      extractFilePathMentions(
        text.slice(Math.max(0, match.index - PATH_LOOKBEHIND_CHARS), match.index),
      ).at(-1);
    if (filepath) {
      return {
        toolName: BuiltInToolNames.EditExistingFile,
        args: { filepath, changes: body.trimEnd() },
      };
    }
  }
  return undefined;
}

function describedReadPending(
  text: string,
  pending: string[],
): DescribedAction | undefined {
  const filepath = extractFilePathMentions(text).find((path) =>
    pending.includes(path),
  );
  return filepath
    ? { toolName: BuiltInToolNames.ReadFile, args: { filepath } }
    : undefined;
}

function describedReadFallback(text: string): DescribedAction | undefined {
  if (!READ_INTENT.test(text)) {
    return undefined;
  }
  const filepath = extractFilePathMentions(text).at(-1);
  return filepath
    ? { toolName: BuiltInToolNames.ReadFile, args: { filepath } }
    : undefined;
}

// "I will run X to verify..." has no call syntax to recover, unlike an edit (fence)
// or read (just a path) - so reconstruct it, but only against known verify targets/exts
function describedRun(
  text: string,
  verifyTargets: string[],
): DescribedAction | undefined {
  if (verifyTargets.length === 0 || !RUN_INTENT.test(text)) {
    return undefined;
  }
  const mentioned = extractFilePathMentions(text);
  const filepath =
    mentioned.find((path) =>
      verifyTargets.some((v) => path.includes(v) || v.includes(path)),
    ) ?? (verifyTargets.length === 1 ? verifyTargets[0] : undefined);
  if (!filepath) {
    return undefined;
  }
  const ext = filepath.split(".").pop()?.toLowerCase();
  const interpreter = ext ? INTERPRETER_BY_EXTENSION[ext] : undefined;
  return interpreter
    ? {
        toolName: BuiltInToolNames.RunTerminalCommand,
        args: { command: `${interpreter} ${filepath}` },
      }
    : undefined;
}

