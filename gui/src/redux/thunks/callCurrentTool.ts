import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ContextItem } from "core";
import { BuiltInToolNames, CLIENT_TOOLS } from "core/tools/builtIn";
import { callClientTool } from "../../util/clientTools/callClientTool";
import { reasonTaskIncomplete } from "../../util/taskStateRecitation";
import { selectCurrentToolCall } from "../selectors/selectCurrentToolCall";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  acceptToolCall,
  errorToolCall,
  setAgentPlanSteps,
  setToolCallCalling,
  updateToolCallOutput,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";


const IDENTICAL_CALL_LIMIT = 2;
const IDENTICAL_CALL_STRONG_NUDGE_LIMIT = 4;
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

    const isReadonly =
      state.config.config.tools.find(
        (tool) => tool.function.name === toolName,
      )?.readonly === true;

    const overIdenticalLimit =
      !isReadonly && identicalCalls >= IDENTICAL_CALL_LIMIT;
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

    // model's own plan, recorded as given - stored here, next to the progress tracking that reads it
    if (toolName === BuiltInToolNames.SetTaskPlan) {
      const steps = toolCallState.parsedArgs?.steps;
      if (Array.isArray(steps)) {
        dispatch(
          setAgentPlanSteps(
            steps.filter((step): step is string => typeof step === "string"),
          ),
        );
      }
    }

    if (toolName === BuiltInToolNames.TaskComplete) {
      const reason = reasonTaskIncomplete(
        state.session.history,
        state.session.agentPlanTargets,
        state.session.agentVerifyTargets,
        state.session.agentPlanSteps,
      );
      if (reason) {
        dispatch(
          updateToolCallOutput({
            toolCallId,
            contextItems: [
              {
                icon: "problems",
                name: "Task Not Complete",
                description: "Work remains",
                content: reason,
                hidden: false,
              },
            ],
          }),
        );
        dispatch(errorToolCall({ toolCallId }));
        unwrapResult(
          await dispatch(streamResponseAfterToolCall({ toolCallId })),
        );
        return;
      }
    }

    dispatch(
      setToolCallCalling({
        toolCallId,
      }),
    );

    let output: ContextItem[] | undefined = undefined;
    let errorMessage: string | undefined = undefined;
    let streamResponse: boolean;

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
      streamResponse = toolName !== BuiltInToolNames.TaskComplete;
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
      // The result alone doesn't tell the model it has seen this before
      const repeatNotice: ContextItem[] =
        identicalCalls > 0
          ? [
              {
                icon: "problems",
                name: "Repeated Tool Call",
                description: "Already called",
                content: `You have already called ${toolName} with exactly these arguments ${identicalCalls} time(s) in this task, and the result above is the same as before. Nothing has changed and calling it again will not change it. Use what you already have and take the next concrete action.`,
                hidden: false,
              },
            ]
          : [];
      dispatch(
        updateToolCallOutput({
          toolCallId,
          contextItems: [...output, ...repeatNotice],
        }),
      );
    }

    // The terminal state: mark it done and let the turn end
    if (toolName === BuiltInToolNames.TaskComplete && !errorMessage) {
      dispatch(acceptToolCall({ toolCallId }));
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
