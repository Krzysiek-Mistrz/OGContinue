import {
  ChatHistoryItem,
  ChatMessage,
  RuleWithSource,
  TextMessagePart,
  ToolResultChatMessage,
  UserChatMessage,
} from "../";
import { findLast } from "../util/findLast";
import { normalizeToMessageParts } from "../util/messageContent";
import { isUserOrToolMsg } from "./messages";
import { getSystemMessageWithRules } from "./rules/getSystemMessageWithRules";

export const DEFAULT_CHAT_SYSTEM_MESSAGE_URL =
  "https://github.com/continuedev/continue/blob/main/core/llm/constructMessages.ts";

export const DEFAULT_AGENT_SYSTEM_MESSAGE_URL =
  "https://github.com/continuedev/continue/blob/main/core/llm/constructMessages.ts";

const EDIT_MESSAGE = `\
  Always include the language and file name in the info string when you write code blocks.
  If you are editing "src/main.py" for example, your code block should start with '\`\`\`python src/main.py'

  When addressing code modification requests, present a concise code snippet that
  emphasizes only the necessary changes and uses abbreviated placeholders for
  unmodified sections. For example:

  \`\`\`language /path/to/file
  // ... existing code ...

  {{ modified code here }}

  // ... existing code ...

  {{ another modification }}

  // ... rest of code ...
  \`\`\`

  In existing files, you should always restate the function or class that the snippet belongs to:

  \`\`\`language /path/to/file
  // ... existing code ...

  function exampleFunction() {
    // ... existing code ...

    {{ modified code here }}

    // ... rest of function ...
  }

  // ... rest of code ...
  \`\`\`

  Since users have access to their complete file, they prefer reading only the
  relevant modifications. It's perfectly acceptable to omit unmodified portions
  at the beginning, middle, or end of files using these "lazy" comments. Only
  provide the complete file when explicitly requested. Include a concise explanation
  of changes unless the user specifically asks for code only.
`

export const DEFAULT_CHAT_SYSTEM_MESSAGE = `\
<important_rules>
  You are in chat mode.

  If the user asks to make changes to files offer that they can use the Apply Button on the code block, or switch to Agent Mode to make the suggested updates automatically.
  If needed consisely explain to the user they can switch to agent mode using the Mode Selector dropdown and provide no other details.

${EDIT_MESSAGE}
</important_rules>`;

export const DEFAULT_AGENT_SYSTEM_MESSAGE = `\
<important_rules>
  You are in agent mode. You have tools available to read, search, and edit files, and to run terminal commands. Use them instead of writing code directly in your response.

  Work one tool call at a time. Call a tool, wait for its result, then decide the next step based on that result. Do not guess at file contents or command output — use a tool to check.

  Before editing a file you have not already read in this conversation, read it first so your edit is based on its real contents.

  When a task is finished, say so plainly and stop. Do not call further tools "just in case".

  If a tool call fails or returns something unexpected, read the error message and adjust your next tool call accordingly, rather than repeating the same call. A failed call is not a reason to stop and ask the user: when a path is wrong, list or search the workspace to find the real one and retry. Only ask the user once you have actually tried to work it out and are still stuck.

  When you are told a file is in some folder but not given its exact path, list or glob that folder first instead of guessing the path.

  To use a tool, you must invoke it through the tool-calling mechanism provided to you — never by writing a JSON object describing the call as plain text in your response. If you cannot invoke a tool through that mechanism, say so instead of printing what the call would have looked like.

  Never describe a file edit as prose with "Current Code" / "Updated Code" markdown blocks, or any other before/after code snippet, as a substitute for actually editing the file. If a change is needed, call the file-editing tool to apply it directly; only fall back to describing a change in text if no editing tool is available to you.

  Never end a response by only announcing what you are about to do ("Let's start by...", "First, let's read...", "Now I will..."). Every response that names a next step must immediately continue with the matching tool call in that same response — do not stop after the announcement and wait to be asked to continue.
</important_rules>`;

export function constructMessages(
  messageMode: string,
  history: ChatHistoryItem[],
  baseChatOrAgentSystemMessage: string | undefined,
  rules: RuleWithSource[],
): ChatMessage[] {
  const filteredHistory = history.filter(
    (item) => item.message.role !== "system",
  );
  const msgs: ChatMessage[] = [];

  for (let i = 0; i < filteredHistory.length; i++) {
    const historyItem = filteredHistory[i];

    if (messageMode === "chat") {
      const toolMessage: ToolResultChatMessage = historyItem.message as ToolResultChatMessage;
      if (historyItem.toolCallState?.toolCallId || toolMessage.toolCallId) {
        // remove all tool calls from the history
        continue;
      }
    }

    if (historyItem.message.role === "user") {
      // Gather context items for user messages
      let content = normalizeToMessageParts(historyItem.message);

      const ctxItems = historyItem.contextItems
        .map((ctxItem) => {
          return {
            type: "text",
            text: `${ctxItem.content}\n`,
          } as TextMessagePart;
        })
        .filter((part) => !!part.text.trim());

      content = [...ctxItems, ...content];
      msgs.push({
        ...historyItem.message,
        content,
      });
    } else {
      msgs.push(historyItem.message);
    }
  }

  const lastUserMsg = findLast(msgs, isUserOrToolMsg) as
    | UserChatMessage
    | ToolResultChatMessage
    | undefined;

  const systemMessage = getSystemMessageWithRules({
    baseSystemMessage: baseChatOrAgentSystemMessage,
    rules,
    userMessage: lastUserMsg,
  });

  if (systemMessage.trim()) {
    msgs.unshift({
      role: "system",
      content: systemMessage,
    });
  }

  // Remove the "id" from all of the messages
  return msgs.map((msg) => {
    const { id, ...rest } = msg as any;
    return rest;
  });
}
