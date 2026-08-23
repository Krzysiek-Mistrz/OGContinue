import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ContextItem } from "core";
import { CLIENT_TOOLS } from "core/tools/builtIn";
import { callClientTool } from "../../util/clientTools/callClientTool";
import { selectCurrentToolCall } from "../selectors/selectCurrentToolCall";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  acceptToolCall,
  errorToolCall,
  setToolCallCalling,
  updateToolCallOutput,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";

/**
 * Small local models get stuck reissuing one tool call verbatim - the same ls
 * of a directory that does not resolve, or the same no-op edit - and will keep
 * going until the user stops them. The result cannot change, so refuse the call
 * once it has already been made twice and tell the model to do something else.
 *
 * Telling it is not enough on its own: a model already stuck in a loop tends to
 * answer the refusal with the very same call again, which would just bounce off
 * the guard forever. So the refusal buys a couple of chances to recover, and
 * past that the turn ends instead of streaming another response.
 */
const IDENTICAL_CALL_LIMIT = 2;
const IDENTICAL_CALL_HARD_LIMIT = 4;

function canonicalizeArgs(args: unknown): string {
  return JSON.stringify(args, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

export const callCurrentTool = createAsyncThunk<void, undefined, ThunkApiType>(
  "chat/callTool",
  async (_, { dispatch, extra, getState }) => {
    const state = getState();
    const toolCallState = selectCurrentToolCall(state);

    if (!toolCallState) {
      return;
    }

    if (toolCallState.status !== "generated") {
      return;
    }

    const selectedChatModel = selectSelectedChatModel(state);

    if (!selectedChatModel) {
      throw new Error("No model selected");
    }

    const { toolCallId } = toolCallState;
    const toolName = toolCallState.toolCall.function.name;

    const args = canonicalizeArgs(toolCallState.parsedArgs);
    const identicalCalls = state.session.history.filter((item) => {
      const previous = item.toolCallState;
      return (
        !!previous &&
        previous.toolCallId !== toolCallId &&
        previous.toolCall.function.name === toolName &&
        canonicalizeArgs(previous.parsedArgs) === args
      );
    }).length;

    if (identicalCalls >= IDENTICAL_CALL_LIMIT) {
      const givingUp = identicalCalls >= IDENTICAL_CALL_HARD_LIMIT;
      dispatch(
        updateToolCallOutput({
          toolCallId,
          contextItems: [
            {
              icon: "problems",
              name: "Repeated Tool Call",
              description: "Tool Call Blocked",
              content: givingUp
                ? `${toolName} was called ${identicalCalls} times with exactly these arguments and blocked each time. Stopping here so it does not loop indefinitely.`
                : `${toolName} has already been called ${identicalCalls} times with exactly these arguments, so calling it again cannot produce a different result. Do not repeat it. Change the arguments, use a different tool, or - if you already have what you need - give the user your answer. If you are genuinely stuck, explain what you tried and stop.`,
              hidden: false,
            },
          ],
        }),
      );
      dispatch(errorToolCall({ toolCallId }));
      if (!givingUp) {
        unwrapResult(
          await dispatch(streamResponseAfterToolCall({ toolCallId })),
        );
      }
      return;
    }

    dispatch(
      setToolCallCalling({
        toolCallId,
      }),
    );

    let output: ContextItem[] | undefined = undefined;
    let errorMessage: string | undefined = undefined;
    let streamResponse: boolean;

    // IMPORTANT:
    // Errors that occur while calling tool call implementations
    // Are caught and passed in output as context items
    // Errors that occur outside specifically calling the tool
    // Should not be caught here - should be handled as normal stream errors
    if (
      CLIENT_TOOLS.find(
        (clientToolName) => clientToolName === toolName,
      )
    ) {
      // Tool is called on client side
      const {
        output: clientToolOuput,
        respondImmediately,
        errorMessage: clientToolError,
      } = await callClientTool(toolCallState.toolCall, {
        dispatch,
        ideMessenger: extra.ideMessenger,
        streamId: state.session.codeBlockApplyStates.states.find(
          (state) =>
            state.toolCallId && state.toolCallId === toolCallState.toolCallId,
        )?.streamId,
        getState,
      });
      output = clientToolOuput;
      errorMessage = clientToolError;
      streamResponse = respondImmediately;
    } else {
      // Tool is called on core side
      const result = await extra.ideMessenger.request("tools/call", {
        toolCall: toolCallState.toolCall,
      });
      if (result.status === "error") {
        throw new Error(result.error);
      } else {
        output = result.content.contextItems;
        errorMessage = result.content.errorMessage;
      }
      streamResponse = true;
    }

    if (errorMessage) {
      dispatch(
        updateToolCallOutput({
          toolCallId,
          contextItems: [
            {
              icon: "problems",
              name: "Tool Call Error",
              description: "Tool Call Failed",
              content: `${toolName} failed with the message: ${errorMessage}\n\nDo not stop to ask the user. If this message suggests a concrete fix, apply it and retry immediately; otherwise use the list or glob tools to find the correct input. Ask the user only after you have actually tried and are still stuck.`,
              hidden: false,
            },
          ],
        }),
      );
    } else if (output?.length) {
      dispatch(
        updateToolCallOutput({
          toolCallId,
          contextItems: output,
        }),
      );
    }

    if (streamResponse) {
      if (errorMessage) {
        dispatch(
          errorToolCall({
            toolCallId,
          }),
        );
      } else {
        dispatch(
          acceptToolCall({
            toolCallId,
          }),
        );
      }

      // Send to the LLM to continue the conversation
      const wrapped = await dispatch(
        streamResponseAfterToolCall({
          toolCallId,
        }),
      );
      unwrapResult(wrapped);
    }
  },
);
