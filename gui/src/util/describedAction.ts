import { ChatHistoryItem } from "core";
import { BuiltInToolNames } from "core/tools/builtIn";
import { renderChatMessage } from "core/util/messageContent";
import { extractFilePathMentions } from "./extractFilePathMentions";

// Decides what call a response describes but doesn't make - free of Redux/IDE
// deps so agent-eval's headless runner can exercise the real decision, not a
// lookalike. Dispatching half lives in redux/thunks/recoverDescribedAction.ts.

const CODE_FENCE = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;

const EDIT_TOOLS: string[] = [
  BuiltInToolNames.EditExistingFile,
  BuiltInToolNames.CreateNewFile,
];

// span of one sentence - a path from earlier prose starts leaking in past this
const PATH_LOOKBEHIND_CHARS = 300;

const READ_INTENT =
  /\b(read|reading|open|look at|inspect|check|view|examine|contents of)\b/i;

export interface DescribedAction {
  toolName: string;
  args: Record<string, string>;
}

/** The call a response describes but doesn't make, or undefined. */
export function describedAction(
  text: string,
  pending: string[],
): DescribedAction | undefined {
  return describedEdit(text) ?? describedRead(text, pending);
}

/** Whether a successful edit already covers this path - work done, not owed. */
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

// Scans the whole turn, not just a stalled one - the common case is the model
// prints the fixed code and carries straight on, leaving it behind an Apply
// button nobody clicks. Work was done; only the applying wasn't.

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

/** A code block the model printed instead of calling the edit tool. */
function describedEdit(text: string): DescribedAction | undefined {
  CODE_FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_FENCE.exec(text)) !== null) {
    const [, infoString, body] = match;
    if (!body.trim()) {
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

// A read announced but not made. Naming a pending file is enough on its own
// (reading is the safe next step either way); a file outside the plan needs
// the read intent stated explicitly.

function describedRead(
  text: string,
  pending: string[],
): DescribedAction | undefined {
  const mentioned = extractFilePathMentions(text);
  const filepath =
    mentioned.find((path) => pending.includes(path)) ??
    (READ_INTENT.test(text) ? mentioned.at(-1) : undefined);
  return filepath
    ? { toolName: BuiltInToolNames.ReadFile, args: { filepath } }
    : undefined;
}

