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

export interface DescribedAction {
  toolName: string;
  args: Record<string, string>;
}

export function describedAction(
  text: string,
  pending: string[],
): DescribedAction | undefined {
  return describedEdit(text) ?? describedRead(text, pending);
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

