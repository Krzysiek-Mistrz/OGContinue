import { unwrapResult } from "@reduxjs/toolkit";
import { renderChatMessage } from "core/util/messageContent";
import { v4 as uuidv4 } from "uuid";
import {
  DescribedAction,
  describedAction,
  unappliedCodeBlock,
} from "../../util/describedAction";
import { setToolGenerated, streamUpdate } from "../slices/sessionSlice";
import { isAutoApprovedTool } from "../slices/uiSlice";
import { AppThunkDispatch, RootState } from "../store";
import { callCurrentTool } from "./callCurrentTool";


// Runs the tool call the model described but never made
export async function recoverDescribedAction({
  dispatch,
  getState,
  pending,
}: {
  dispatch: AppThunkDispatch;
  getState: () => RootState;
  pending: string[];
}): Promise<boolean> {
  const state = getState();
  const history = state.session.history;
  const text = renderChatMessage(history[history.length - 1]?.message);
  if (!text.trim()) {
    return false;
  }

  const action = describedAction(text, pending);
  if (!action) {
    return false;
  }

  // already made? its result is already in context - don't loop rebuilding it
  const alreadyCalled = history.some((item) => {
    const previous = item.toolCallState;
    return (
      !!previous &&
      previous.toolCall.function.name === action.toolName &&
      previous.parsedArgs?.filepath === action.args.filepath
    );
  });
  if (alreadyCalled) {
    return false;
  }

  return runSynthesizedCall(dispatch, getState, action);
}

// Injects a reconstructed call the same way a streamed one arrives
async function runSynthesizedCall(
  dispatch: AppThunkDispatch,
  getState: () => RootState,
  action: DescribedAction,
): Promise<boolean> {
  const toolCallId = uuidv4();
  dispatch(
    streamUpdate([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: toolCallId,
            type: "function",
            function: {
              name: action.toolName,
              arguments: JSON.stringify(action.args),
            },
          },
        ],
      },
    ]),
  );
  dispatch(setToolGenerated({ toolCallId }));

  // gated tools stay gated - leave it for the user to approve
  if (!isAutoApprovedTool(action.toolName, getState().ui.toolSettings)) {
    return true;
  }

  unwrapResult(await dispatch(callCurrentTool()));
  return true;
}

// Applies a printed code block as a real edit, whether or not the turn stalled.
export async function applyUnappliedCodeBlock({
  dispatch,
  getState,
  historyLengthBeforeStream,
}: {
  dispatch: AppThunkDispatch;
  getState: () => RootState;
  historyLengthBeforeStream: number;
}): Promise<boolean> {
  const history = getState().session.history;
  const action = unappliedCodeBlock(history, historyLengthBeforeStream);
  return action ? runSynthesizedCall(dispatch, getState, action) : false;
}
