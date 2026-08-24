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
 * A blocked call almost always means the model already made the change and
 * just hasn't noticed - re-reading the file would show its own edit already
 * applied. So every tier below keeps nudging the model to look again and move
 * on, the same way a manual "Regenerate" reliably unstuck it in testing,
 * rather than silently stopping and leaving the model's last word as another
 * attempt at the same call. Only ABSOLUTE_MAX_TOOL_CALLS_PER_TURN - reserved
 * for a model that ignores every nudge - actually ends the turn, purely to
 * cap runaway token cost.
 */
const IDENTICAL_CALL_LIMIT = 2;
const IDENTICAL_CALL_STRONG_NUDGE_LIMIT = 4;

/**
 * The identical-call guard above only catches byte-identical repeats. In
 * practice a small model asked to redo the same edit rarely reproduces it
 * exactly - a comment worded slightly differently, different whitespace - so
 * it drifts through a series of near-identical variants, each one dodging the
 * identical-call counter by never repeating any single variant often enough
 * to trip it. Observed live: "fix the type mismatch in text.py" cycling
 * through edit_existing_file with subtly different `changes` text call after
 * call. This is a second, argument-independent backstop: however varied the
 * arguments, a turn that has made this many tool calls without reaching an
 * answer is very likely stuck redoing work it already finished.
 */
const MAX_TOOL_CALLS_PER_TURN = 15;
const ABSOLUTE_MAX_TOOL_CALLS_PER_TURN = 30;

function canonicalizeArgs(args: unknown): string {
  return JSON.stringify(args, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

function countToolCallsSinceLastUserMessage(
  history: ThunkApiType["state"]["session"]["history"],
): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].message.role === "user") {
      break;
    }
    if (history[i].toolCallState) {
      count++;
    }
  }
  return count;
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
    const turnToolCallCount = countToolCallsSinceLastUserMessage(
      state.session.history,
    );

    const overIdenticalLimit = identicalCalls >= IDENTICAL_CALL_LIMIT;
    const overStrongNudgeLimit =
      identicalCalls >= IDENTICAL_CALL_STRONG_NUDGE_LIMIT;
    const overTurnBudget = turnToolCallCount >= MAX_TOOL_CALLS_PER_TURN;
    const overAbsoluteLimit = turnToolCallCount >= ABSOLUTE_MAX_TOOL_CALLS_PER_TURN;

    if (overIdenticalLimit || overTurnBudget) {
      const content = overAbsoluteLimit
        ? `This turn has made ${turnToolCallCount} tool calls without reaching an answer. Stopping here to cap runaway tool use. Explain what was tried and what's still unresolved.`
        : overStrongNudgeLimit || overTurnBudget
          ? `${toolName} was called again with the same or near-identical arguments. That almost always means the change is already applied - re-read the file to check before editing it again. If it's already correct, stop touching it and move on to the rest of the task, or tell the user you're done if nothing is left.`
          : `${toolName} has already been called ${identicalCalls} times with exactly these arguments, so calling it again cannot produce a different result. Do not repeat it. Change the arguments, use a different tool, or - if you already have what you need - give the user your answer. If you are genuinely stuck, explain what you tried and stop.`;
      dispatch(
        updateToolCallOutput({
          toolCallId,
          contextItems: [
            {
              icon: "problems",
              name: "Repeated Tool Call",
              description: "Tool Call Blocked",
              content,
              hidden: false,
            },
          ],
        }),
      );
      dispatch(errorToolCall({ toolCallId }));
      if (!overAbsoluteLimit) {
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
