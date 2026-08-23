import { unwrapResult } from "@reduxjs/toolkit";
import { ChatMessage, RuleWithSource } from "core";
import { constructMessages } from "core/llm/constructMessages";
import { renderChatMessage } from "core/util/messageContent";
import { getBaseSystemMessage } from "../../util";
import { selectSelectedChatModel } from "../slices/configSlice";
import { AppThunkDispatch, RootState } from "../store";
import { streamNormalInput } from "./streamNormalInput";

/**
 * Small local models frequently answer by describing the step they are about
 * to take and then stopping, instead of taking it. Nudging them once gets them
 * moving again; measured on qwen2.5-coder 7B this turned 0/4 tool calls into
 * 4/4. A system-role nudge had no effect at all.
 *
 * The nudge is only sent for a response that announces a next action, so a
 * genuine "the task is done" answer is left alone.
 */
const NUDGE_MESSAGE: ChatMessage = {
  role: "user",
  content:
    "Continue. Carry out the step you just described by calling the appropriate tool now. Do not reply with text.",
};

const ANNOUNCES_NEXT_STEP =
  /\b(let'?s|let us|i'?ll|i will|next[,:]?\s|now[,:]?\s+(?:i|we|let)|we (?:need to|should|can|will)|first[,:]?\s|start by)\b/i;

/**
 * Re-streams once with the nudge appended when the model ended its turn on an
 * announcement rather than a tool call. Applies to a response to a plain user
 * message just as much as to one following a tool result - a model stalls the
 * same way in both, and only the latter used to be covered.
 */
export async function nudgeStalledAgent({
  dispatch,
  getState,
  historyLengthBeforeStream,
  rules,
}: {
  dispatch: AppThunkDispatch;
  getState: () => RootState;
  historyLengthBeforeStream: number;
  rules: RuleWithSource[];
}): Promise<void> {
  const state = getState();

  if (state.session.mode !== "agent") {
    return;
  }

  const history = state.session.history;
  const producedToolCall = history
    .slice(historyLengthBeforeStream)
    .some((item) => !!item.toolCallState);

  if (producedToolCall) {
    return;
  }

  const stalledResponse = renderChatMessage(history[history.length - 1]?.message);
  if (!ANNOUNCES_NEXT_STEP.test(stalledResponse)) {
    return;
  }

  const selectedChatModel = selectSelectedChatModel(state);
  if (!selectedChatModel) {
    return;
  }

  // Kept out of the session history so the user never sees it.
  const nudgedMessages = constructMessages(
    state.session.mode,
    [...history],
    getBaseSystemMessage(selectedChatModel, state.session.mode),
    rules,
  ).concat(NUDGE_MESSAGE);

  unwrapResult(
    await dispatch(streamNormalInput({ messages: nudgedMessages })),
  );
}
