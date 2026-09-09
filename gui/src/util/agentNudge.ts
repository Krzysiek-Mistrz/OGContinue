import { ChatHistoryItem, ChatMessage } from "core";

// Free of Redux so agent-eval's runner sends the model the exact same nudge
// the extension does. Deliberately not "do not reply with text" - the failure
// is describing a step instead of taking it, not describing it at all;
// banning prose strips the commentary that makes agent mode readable.
const GENERIC_NUDGE =
  "You described that step but did not take it. Carry it out now: say in one short sentence what you are doing and make the tool call in the same reply.";

// Plan wording is routinely a partial path ("stats.py" for "lib/stats.py") -
// quoting it back as if real just re-feeds the path reads keep failing on. A
// target is only quoted once a successful call proved the full path.
export function buildNudgeMessage(
  target: string | undefined,
  resolvedPath: string | undefined,
  verifyTarget?: string,
): ChatMessage {
  let content = GENERIC_NUDGE;
  if (verifyTarget) {
    content = `Every file this task asked you to change has been changed, but the request also asks that ${verifyTarget} works, and that hasn't been checked. Run it with the terminal tool now and report what it printed.`;
  } else if (resolvedPath) {
    content = `${resolvedPath} still has to be changed for this task and no edit has been made to it yet. Call the edit tool on it now - one short sentence about what you are changing, then the call, in the same reply.`;
  } else if (target) {
    content = `The task still requires changing ${target}, and you do not have its contents yet. Read it now - one short sentence, then the call, in the same reply. If an earlier read of it failed, use the corrected path from that error, not the path you tried.`;
  }
  return { role: "user", content };
}

/** The real path a successful call proved this target resolves to; failed calls are skipped on purpose. */
export function resolvedPathFor(
  target: string,
  history: ChatHistoryItem[],
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const state = history[i].toolCallState;
    if (!state || state.status !== "done") {
      continue;
    }
    const filepath = state.parsedArgs?.filepath;
    if (typeof filepath === "string" && filepath.includes(target)) {
      return filepath;
    }
  }
  return undefined;
}

