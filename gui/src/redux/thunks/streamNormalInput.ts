import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { ChatMessage, LLMFullCompletionOptions } from "core";
import { modelSupportsTools } from "core/llm/autodetect";
import { ToCoreProtocol } from "core/protocol";
import { selectActiveTools } from "../selectors/selectActiveTools";
import { selectCurrentToolCall } from "../selectors/selectCurrentToolCall";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  abortStream,
  addPromptCompletionPair,
  setToolGenerated,
  streamUpdate,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { callCurrentTool } from "./callCurrentTool";

const AGENT_MODE_TEMPERATURE = 0.2;

export const streamNormalInput = createAsyncThunk<
  void,
  {
    messages: ChatMessage[];
    legacySlashCommandData?: ToCoreProtocol["llm/streamChat"][0]["legacySlashCommandData"];
  },
  ThunkApiType
>(
  "chat/streamNormalInput",
  async (
    { messages, legacySlashCommandData },
    { dispatch, extra, getState },
  ) => {
    // Gather state
    const state = getState();
    const selectedChatModel = selectSelectedChatModel(state);

    const streamAborter = state.session.streamAborter;
    if (!selectedChatModel) {
      throw new Error("Default model not defined");
    }

    let completionOptions: LLMFullCompletionOptions = {};
    const activeTools = selectActiveTools(state);
    const toolsSupported = modelSupportsTools(selectedChatModel);
    if (toolsSupported && activeTools.length > 0) {
      completionOptions = {
        tools: activeTools,
      };

      // Small local models emit a well-formed tool call far more reliably when
      // sampling is nearly greedy. Measured on qwen2.5-coder 7B through Ollama:
      // 12/12 tool calls at temperature 0-0.2 versus 4/6 at 0.5.
      if (selectedChatModel.completionOptions?.temperature === undefined) {
        completionOptions.temperature = AGENT_MODE_TEMPERATURE;
      }
    }

    // Send request
    const gen = extra.ideMessenger.llmStreamChat(
      {
        completionOptions,
        title: selectedChatModel.title,
        messages,
        legacySlashCommandData,
      },
      streamAborter.signal,
    );

    // Stream response
    let next = await gen.next();
    while (!next.done) {
      if (!getState().session.isStreaming) {
        dispatch(abortStream());
        break;
      }

      dispatch(streamUpdate(next.value));
      next = await gen.next();
    }

    // Attach prompt log and end thinking for reasoning models
    if (next.done && next.value) {
      dispatch(addPromptCompletionPair([next.value]));

      try {
        if (state.session.mode === "chat" || state.session.mode === "agent") {
          extra.ideMessenger.post("devdata/log", {
            name: "chatInteraction",
            data: {
              prompt: next.value.prompt,
              completion: next.value.completion,
              modelProvider: selectedChatModel.provider,
              modelTitle: selectedChatModel.title,
              sessionId: state.session.id,
            },
          });
        }
        // else if (state.session.mode === "edit") {
        //   extra.ideMessenger.post("devdata/log", {
        //     name: "editInteraction",
        //     data: {
        //       prompt: next.value.prompt,
        //       completion: next.value.completion,
        //       modelProvider: selectedChatModel.provider,
        //       modelTitle: selectedChatModel.title,
        //     },
        //   });
        // }
      } catch (e) {
        console.error("Failed to send dev data interaction log", e);
      }
    }

    // If it's a tool call that is automatically accepted, we should call it
    const newState = getState();
    const toolSettings = newState.ui.toolSettings;
    const toolCallState = selectCurrentToolCall(newState);
    if (toolCallState) {
      dispatch(
        setToolGenerated({
          toolCallId: toolCallState.toolCallId,
        }),
      );

      if (
        toolSettings[toolCallState.toolCall.function.name] ===
        "allowedWithoutPermission"
      ) {
        const response = await dispatch(callCurrentTool());
        unwrapResult(response);
      }
    }
  },
);
