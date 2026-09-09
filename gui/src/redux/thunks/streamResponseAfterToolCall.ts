import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ChatMessage } from "core";
import { constructMessages } from "core/llm/constructMessages";
import { renderContextItems } from "core/util/messageContent";
import { getBaseSystemMessage } from "../../util";
import { withTaskStateRecitation } from "../../util/taskStateRecitation";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  addContextItemsAtIndex,
  setActive,
  streamUpdate,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { findToolCall } from "../util";
import { resetStateForNewMessage } from "./resetStateForNewMessage";
import { nudgeStalledAgent } from "./nudgeStalledAgent";
import { streamNormalInput } from "./streamNormalInput";
import { streamThunkWrapper } from "./streamThunkWrapper";

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
        
        const messages = withTaskStateRecitation(
          constructMessages(
            messageMode,
            [...updatedHistory],
            baseChatOrAgentSystemMessage,
            state.config.config.rules,
          ),
          messageMode,
          updatedHistory,
          getState().session.agentPlanTargets,
          getState().session.agentVerifyTargets,
          getState().session.agentPlanSteps,
        );

        unwrapResult(await dispatch(streamNormalInput({ messages })));

        await nudgeStalledAgent({
          dispatch,
          getState,
          historyLengthBeforeStream: updatedHistory.length,
          rules: state.config.config.rules,
          afterToolCall: true,
        });
      }),
    );
  },
);
