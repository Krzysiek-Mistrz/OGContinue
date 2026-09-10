import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/core";
import { InputModifiers } from "core";
import { constructMessages } from "core/llm/constructMessages";
import { renderChatMessage } from "core/util/messageContent";
import posthog from "posthog-js";
import { v4 as uuidv4 } from "uuid";
import { getBaseSystemMessage } from "../../util";
import {
  extractTaskTargets,
  extractVerifyTargets,
} from "../../util/extractFilePathMentions";
import { withTaskStateRecitation } from "../../util/taskStateRecitation";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  setAgentPlanTargets,
  submitEditorAndInitAtIndex,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { gatherContext } from "./gatherContext";
import { nudgeStalledAgent } from "./nudgeStalledAgent";
import { resetStateForNewMessage } from "./resetStateForNewMessage";
import { streamNormalInput } from "./streamNormalInput";
import { streamThunkWrapper } from "./streamThunkWrapper";
import { updateFileSymbolsFromFiles } from "./updateFileSymbols";

export const streamResponseThunk = createAsyncThunk<
  void,
  {
    editorState: JSONContent;
    modifiers: InputModifiers;
    index?: number;
    promptPreamble?: string;
  },
  ThunkApiType
>(
  "chat/streamResponse",
  async (
    { editorState, modifiers, index, promptPreamble },
    { dispatch, extra, getState },
  ) => {
    await dispatch(
      streamThunkWrapper(async () => {
        const state = getState();
        const selectedChatModel = selectSelectedChatModel(state);
        const inputIndex = index ?? state.session.history.length; // Either given index or concat to end

        if (!selectedChatModel) {
          throw new Error("No chat model selected");
        }

        dispatch(
          submitEditorAndInitAtIndex({ index: inputIndex, editorState }),
        );
        resetStateForNewMessage();

        const result = await dispatch(
          gatherContext({
            editorState,
            modifiers,
            promptPreamble,
          }),
        );
        const {
          selectedContextItems,
          selectedCode,
          content,
          slashCommandWithInput,
        } = unwrapResult(result);

        // symbols for both context items AND selected codeblocks
        const filesForSymbols = [
          ...selectedContextItems
            .filter((item) => item.uri?.type === "file" && item?.uri?.value)
            .map((item) => item.uri!.value),
          ...selectedCode.map((rif) => rif.filepath),
        ];
        dispatch(updateFileSymbolsFromFiles(filesForSymbols));

        dispatch(
          updateHistoryItemAtIndex({
            index: inputIndex,
            updates: {
              message: {
                role: "user",
                content,
                id: uuidv4(),
              },
              contextItems: selectedContextItems,
            },
          }),
        );

        // Construct messages from updated history
        const updatedHistory = getState().session.history;
        const messageMode = getState().session.mode

        // ground truth from the user's own request, not the model's narration
        const requestText = renderChatMessage({ role: "user", content });
        dispatch(
          setAgentPlanTargets(
            messageMode === "agent"
              ? {
                  change: extractTaskTargets(requestText),
                  verify: extractVerifyTargets(requestText),
                }
              : { change: [], verify: [] },
          ),
        );

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

        posthog.capture("step run", {
          step_name: "User Input",
          params: {},
        });
        posthog.capture("userInput", {});

        if (slashCommandWithInput) {
          posthog.capture("step run", {
            step_name: slashCommandWithInput.command.name,
            params: {},
          });
        }

        const historyLengthBeforeStream =
          getState().session.history.length;

        unwrapResult(
          await dispatch(
            streamNormalInput({
              messages,
              legacySlashCommandData: slashCommandWithInput
                ? {
                    command: slashCommandWithInput.command,
                    contextItems: selectedContextItems,
                    historyIndex: inputIndex,
                    input: slashCommandWithInput.input,
                    selectedCode,
                  }
                : undefined,
            }),
          ),
        );

        await nudgeStalledAgent({
          dispatch,
          getState,
          historyLengthBeforeStream,
          rules: state.config.config.rules,
        });
      }),
    );
  },
);
