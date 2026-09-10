import { unwrapResult } from "@reduxjs/toolkit";
import {
  ChatHistoryItem,
  RuleWithSource,
  ToolStatus
} from "core";
import { constructMessages } from "core/llm/constructMessages";
import { BuiltInToolNames } from "core/tools/builtIn";
import { renderChatMessage } from "core/util/messageContent";
import { getBaseSystemMessage } from "../../util";
import { buildNudgeMessage, resolvedPathFor } from "../../util/agentNudge";
import { extractFilePathMentions } from "../../util/extractFilePathMentions";
import {
  collectTaskProgress,
  withTaskStateRecitation,
} from "../../util/taskStateRecitation";
import { selectSelectedChatModel } from "../slices/configSlice";
import { appendAssistantNotice } from "../slices/sessionSlice";
import { AppThunkDispatch, RootState } from "../store";
import {
  applyUnappliedCodeBlock,
  recoverDescribedAction,
} from "./recoverDescribedAction";
import { streamNormalInput } from "./streamNormalInput";


const ANNOUNCES_NEXT_STEP =
  /\b(let'?s|let us|i'?ll|i will|next[,:]?\s|now[,:]?\s+(?:i|we|let)|we (?:need to|should|can|will)|first[,:]?\s|start by)\b/i;

// leftover text like this is almost certainly a tool call recovery missed
const LOOKS_LIKE_UNRECOVERED_TOOL_CALL = /\{\s*"[A-Za-z0-9_]+"\s*:/;

// only trusted when there's no plan, or every plan target's been touched
const SOUNDS_DONE =
  /\b(all (set|done)|already (done|fixed|complete|correct)|task(?:'?s| is) (now )?(complete|done|finished)|nothing (else|further|more) (to|needs)|no (further|more|additional) (action|changes|steps|fixes)(?: (?:is|are) needed)?|fully fixed|everything (?:looks|is|has been) (?:good|fine|fixed|resolved|corrected)|(?:fix|change|edit)(?:es)? (?:is|are|have been) complete)\b/i;

const MAX_NUDGE_ATTEMPTS = 2;

// reading/grepping/listing is how a target is started, not finished
const MUTATING_TOOLS: string[] = [
  BuiltInToolNames.EditExistingFile,
  BuiltInToolNames.CreateNewFile,
];

// errored/canceled left the file unchanged - target's still outstanding
const SUCCEEDED: ToolStatus[] = ["calling", "done"];

// Plan targets no successful file-changing tool call has covered yet.
function remainingPlanTargets(
  planTargets: string[],
  history: ChatHistoryItem[],
): string[] {
  if (planTargets.length === 0) {
    return [];
  }
  const editedArgsText = history
    .map((item) => item.toolCallState)
    .filter(
      (state): state is NonNullable<typeof state> =>
        !!state &&
        MUTATING_TOOLS.includes(state.toolCall.function.name) &&
        SUCCEEDED.includes(state.status),
    )
    .map((state) => JSON.stringify(state.parsedArgs ?? {}))
    .join(" ");
  return planTargets.filter((target) => !editedArgsText.includes(target));
}

// Re-streams with a targeted nudge, up to MAX_NUDGE_ATTEMPTS; posts a visible notice if all fail.
export async function nudgeStalledAgent({
  dispatch,
  getState,
  historyLengthBeforeStream,
  rules,
  afterToolCall = false,
}: {
  dispatch: AppThunkDispatch;
  getState: () => RootState;
  historyLengthBeforeStream: number;
  rules: RuleWithSource[];
  afterToolCall?: boolean;
}): Promise<void> {
  if (getState().session.mode !== "agent") {
    return;
  }

  // unapplied work regardless of how the turn ended - check before stall handling
  if (
    await applyUnappliedCodeBlock({
      dispatch,
      getState,
      historyLengthBeforeStream,
    })
  ) {
    return;
  }

  let lastTarget: string | undefined;

  for (let attempt = 0; attempt < MAX_NUDGE_ATTEMPTS; attempt++) {
    const state = getState();
    const history = state.session.history;
    const producedToolCall = history
      .slice(historyLengthBeforeStream)
      .some((item) => !!item.toolCallState);

    if (producedToolCall) {
      return;
    }

    const stalledResponse = renderChatMessage(
      history[history.length - 1]?.message,
    );
    const pending = remainingPlanTargets(
      state.session.agentPlanTargets,
      history,
    );

    // every target changed = strongest evidence the task's done, stronger than anything the model says
    const unverified = collectTaskProgress(
      history,
      state.session.agentPlanTargets,
      state.session.agentVerifyTargets,
    ).unverified;

    if (
      state.session.agentPlanTargets.length > 0 &&
      pending.length === 0 &&
      unverified.length === 0
    ) {
      return;
    }

    // With no plan to check against, a "sounds done" claim is all there is.
    if (pending.length === 0 && SOUNDS_DONE.test(stalledResponse)) {
      return;
    }

    const shouldNudge =
      afterToolCall ||
      ANNOUNCES_NEXT_STEP.test(stalledResponse) ||
      LOOKS_LIKE_UNRECOVERED_TOOL_CALL.test(stalledResponse);

    if (!shouldNudge) {
      return;
    }

    if (await recoverDescribedAction({ dispatch, getState, pending })) {
      return;
    }

    const selectedChatModel = selectSelectedChatModel(state);
    if (!selectedChatModel) {
      return;
    }

    // ground truth beats guessing from the model's own text
    lastTarget = pending[0] ?? extractFilePathMentions(stalledResponse).at(-1);

    // never written into session history - the user doesn't see this
    const nudgedMessages = withTaskStateRecitation(
      constructMessages(
        state.session.mode,
        [...history],
        getBaseSystemMessage(selectedChatModel, state.session.mode),
        rules,
      ),
      state.session.mode,
      history,
      state.session.agentPlanTargets,
      state.session.agentVerifyTargets,
      state.session.agentPlanSteps,
    ).concat(
      buildNudgeMessage(
        lastTarget,
        lastTarget ? resolvedPathFor(lastTarget, history) : undefined,
        pending.length === 0 ? unverified[0] : undefined,
      ),
    );

    unwrapResult(
      await dispatch(streamNormalInput({ messages: nudgedMessages })),
    );
  }

  const finalState = getState();
  const finalHistory = finalState.session.history;
  const stillNoToolCall = !finalHistory
    .slice(historyLengthBeforeStream)
    .some((item) => !!item.toolCallState);

  if (afterToolCall && stillNoToolCall) {
    const stillPending = remainingPlanTargets(
      finalState.session.agentPlanTargets,
      finalHistory,
    );
    const stillUnverified = collectTaskProgress(
      finalHistory,
      finalState.session.agentPlanTargets,
      finalState.session.agentVerifyTargets,
    ).unverified;
    const target = stillPending[0] ?? lastTarget;
    const shownPath = target
      ? (resolvedPathFor(target, finalHistory) ?? target)
      : undefined;

    let notice = `⚠️ The agent stopped without finishing this task and didn't call a tool despite being asked to continue. Ask it to continue, or check what's left yourself.`;
    if (stillPending.length === 0 && stillUnverified.length) {
      notice = `⚠️ The agent made every change this task asked for but never checked that **${stillUnverified[0]}** works, which the request also asked for. Run it yourself, or ask the agent to.`;
    } else if (shownPath) {
      notice = `⚠️ The agent stopped without editing **${shownPath}**, which this task named. It may not have needed a change - check it yourself, or ask the agent to continue.`;
    }
    dispatch(appendAssistantNotice(notice));
  }
}
