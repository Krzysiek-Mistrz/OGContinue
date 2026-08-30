import { createSelector } from "@reduxjs/toolkit";
import { renderChatMessage } from "core/util/messageContent";
import { selectSelectedChatModelContextLength } from "../slices/configSlice";
import { RootState } from "../store";

// A rough chars-per-token ratio for English/code text. Good enough for a UI
// estimate - the real count used for truncation happens server-side in core
// against the actual model
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * A rough estimate of how much of the model's context window the current
 * session is using
 */
export const selectContextUsedTokens = createSelector(
  (store: RootState) => store.session.history,
  (history) => {
    const chars = history.reduce(
      (sum, item) => sum + renderChatMessage(item.message).length,
      0,
    );
    return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
  },
);

export const selectContextUsagePercentage = createSelector(
  [selectContextUsedTokens, selectSelectedChatModelContextLength],
  (usedTokens, contextLength) =>
    contextLength > 0
      ? Math.min(100, Math.round((usedTokens / contextLength) * 100))
      : 0,
);
