import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ChatMessage } from "core";
import { constructMessages } from "core/llm/constructMessages";
import {
  renderChatMessage,
  renderContextItems,
} from "core/util/messageContent";
import { getBaseSystemMessage } from "../../util";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  addContextItemsAtIndex,
  setActive,
  streamUpdate,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { findToolCall } from "../util";
import { resetStateForNewMessage } from "./resetStateForNewMessage";
import { streamNormalInput } from "./streamNormalInput";
import { streamThunkWrapper } from "./streamThunkWrapper";

/**
 * Small local models frequently answer a tool result by describing the step
 * they are about to take and then stopping, instead of taking it. Nudging
 * them once gets them moving again; measured on qwen2.5-coder 7B this turned
 * 0/4 tool calls into 4/4. A system-role nudge had no effect at all.
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

export const streamResponseAfterToolCall = createAsyncThunk<
  void,
  { toolCallId: string },
  ThunkApiType
>(
  "chat/streamAfterToolCall",
  async ({ toolCallId }, { dispatch, getState }) => {
    await dispatch(
      streamThunkWrapper(async () => {
        const state = getState();
        const initialHistory = state.session.history;
        const selectedChatModel = selectSelectedChatModel(state);

        if (!selectedChatModel) {
          throw new Error("No model selected");
        }

        const toolCallState = findToolCall(state.session.history, toolCallId);

        if (!toolCallState) {
          throw new Error("Tool call not found");
        }

        const toolOutput = toolCallState.output ?? [];

        resetStateForNewMessage();

        await new Promise((resolve) => setTimeout(resolve, 0));

        const newMessage: ChatMessage = {
          role: "tool",
          content: renderContextItems(toolOutput),
          toolCallId,
        };
        dispatch(streamUpdate([newMessage]));
        dispatch(
          addContextItemsAtIndex({
            index: initialHistory.length,
            contextItems: toolOutput.map((contextItem) => ({
              ...contextItem,
              id: {
                providerTitle: "toolCall",
                itemId: toolCallId,
              },
            })),
          }),
        );

        dispatch(setActive());

        
        const updatedHistory = getState().session.history;
        const messageMode = getState().session.mode

        const baseChatOrAgentSystemMessage = getBaseSystemMessage(selectedChatModel, messageMode)
        
        const messages = constructMessages(
          messageMode,
          [...updatedHistory],
          baseChatOrAgentSystemMessage,
          state.config.config.rules,
        );

        unwrapResult(await dispatch(streamNormalInput({ messages })));

        const afterHistory = getState().session.history;
        const producedToolCall = afterHistory
          .slice(updatedHistory.length)
          .some((item) => !!item.toolCallState);

        if (producedToolCall || getState().session.mode !== "agent") {
          return;
        }

        const stalledResponse = renderChatMessage(
          afterHistory[afterHistory.length - 1]?.message,
        );
        if (!ANNOUNCES_NEXT_STEP.test(stalledResponse)) {
          return;
        }

        // Kept out of the session history so the user never sees it.
        const nudgedMessages = constructMessages(
          messageMode,
          [...afterHistory],
          baseChatOrAgentSystemMessage,
          state.config.config.rules,
        ).concat(NUDGE_MESSAGE);

        unwrapResult(
          await dispatch(streamNormalInput({ messages: nudgedMessages })),
        );
      }),
    );
  },
);
