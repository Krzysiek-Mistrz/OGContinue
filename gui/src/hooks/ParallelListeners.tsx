import { useCallback, useContext, useEffect, useRef } from "react";
import { VSC_THEME_COLOR_VARS } from "../components";
import { IdeMessengerContext } from "../context/IdeMessenger";

import { ApplyState, ContextItem } from "core";
import { EDIT_MODE_STREAM_ID } from "core/edit/constants";
import { FromCoreProtocol } from "core/protocol";
import { getUriPathBasename } from "core/util/uri";
import {
  initializeProfilePreferences,
  setOrganizations,
  setSelectedOrgId,
  setSelectedProfile,
} from "../redux";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { selectCurrentToolCallApplyState } from "../redux/selectors/selectCurrentToolCall";
import { setConfigResult } from "../redux/slices/configSlice";
import { updateEditStateApplyState } from "../redux/slices/editModeState";
import { updateIndexingStatus } from "../redux/slices/indexingSlice";
import {
  acceptToolCall,
  addContextItemsAtIndex,
  updateApplyState,
  updateToolCallOutput,
} from "../redux/slices/sessionSlice";
import { setTTSActive } from "../redux/slices/uiSlice";
import { streamResponseAfterToolCall } from "../redux/thunks";
import { cancelStream } from "../redux/thunks/cancelStream";
import { refreshSessionMetadata } from "../redux/thunks/session";
import { streamResponseThunk } from "../redux/thunks/streamResponse";
import { updateFileSymbolsFromHistory } from "../redux/thunks/updateFileSymbols";
import { isJetBrains } from "../util";
import { setLocalStorage } from "../util/localStorage";
import { useWebviewListener } from "./useWebviewListener";

/**
 * The edit tool resolves before the user has accepted or rejected the diff, so
 * its result is filled in here once the diff closes. Sending back nothing at
 * all - which is what used to happen - leaves the model with no evidence its
 * edit ever landed, and small local models respond to that by reissuing the
 * same edit over and over.
 *
 * "closed" only means no diff blocks are left pending; it covers a rejection
 * just as much as an acceptance. So report the file's resulting contents rather
 * than claiming the change was kept.
 */
const MAX_REPORTED_FILE_CHARS = 4000;

function buildEditToolOutput(state: ApplyState): ContextItem {
  const filepath = state.filepath
    ? getUriPathBasename(state.filepath)
    : "the file";
  const fileContent = state.fileContent ?? "";
  const content =
    fileContent && fileContent.length <= MAX_REPORTED_FILE_CHARS
      ? `The edit to ${filepath} is complete and no changes are left pending. The file now contains:\n\n${fileContent}\n\nDo not make this same edit again.`
      : `The edit to ${filepath} is complete and no changes are left pending. Do not make this same edit again.`;

  return {
    name: "Edit results",
    description: `Result of editing ${filepath}`,
    content,
  };
}

function ParallelListeners() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const history = useAppSelector((store) => store.session.history);

  const selectedProfileId = useAppSelector(
    (store) => store.profiles.selectedProfileId,
  );

  const hasDoneInitialConfigLoad = useRef(false);

  const handleConfigUpdate = useCallback(
    async (isInitial: boolean, result: FromCoreProtocol["configUpdate"][0]) => {
      const {
        result: configResult,
        profileId,
        organizations,
        selectedOrgId,
      } = result;
      if (isInitial && hasDoneInitialConfigLoad.current) {
        return;
      }
      hasDoneInitialConfigLoad.current = true;
      dispatch(setOrganizations(organizations));
      dispatch(setSelectedOrgId(selectedOrgId));
      dispatch(setSelectedProfile(profileId));
      dispatch(setConfigResult(configResult));

      const isNewProfileId = profileId && profileId !== selectedProfileId;

      if (isNewProfileId) {
        dispatch(
          initializeProfilePreferences({
            defaultSlashCommands: [],
            profileId,
          }),
        );
      }

      // Perform any actions needed with the config
      if (configResult.config?.ui?.fontSize) {
        setLocalStorage("fontSize", configResult.config.ui.fontSize);
        document.body.style.fontSize = `${configResult.config.ui.fontSize}px`;
      }
    },
    [dispatch, hasDoneInitialConfigLoad],
  );

  const initialLoadAuthAndConfig = useCallback(
    async (initial: boolean) => {
      const result = await ideMessenger.request(
        "config/getSerializedProfileInfo",
        undefined,
      );
      if (result.status === "success") {
        await handleConfigUpdate(initial, result.content);
      }
    },
    [ideMessenger, handleConfigUpdate],
  );

  // Load config from the IDE
  useEffect(() => {
    initialLoadAuthAndConfig(true);
    const interval = setInterval(() => {
      if (hasDoneInitialConfigLoad.current) {
        // Init to run on initial config load
        ideMessenger.post("docs/initStatuses", undefined);
        dispatch(updateFileSymbolsFromHistory());
        dispatch(refreshSessionMetadata({}));

        // This triggers sending pending status to the GUI for relevant docs indexes
        clearInterval(interval);
      } else {
        initialLoadAuthAndConfig(true);
      }
    }, 2_000);

    return () => clearInterval(interval);
  }, [hasDoneInitialConfigLoad, initialLoadAuthAndConfig, ideMessenger]);

  useWebviewListener(
    "configUpdate",
    async (update) => {
      if (!update) {
        return;
      }
      await handleConfigUpdate(false, update);
    },
    [handleConfigUpdate],
  );

  // Load symbols for chat on any session change
  const sessionId = useAppSelector((state) => state.session.id);
  useEffect(() => {
    if (sessionId) {
      dispatch(updateFileSymbolsFromHistory());
    }
  }, [sessionId]);

  // ON LOAD
  useEffect(() => {
    // Override persisted state
    dispatch(cancelStream());

    const jetbrains = isJetBrains();
    for (const colorVar of VSC_THEME_COLOR_VARS) {
      if (jetbrains) {
        const cached = localStorage.getItem(colorVar);
        if (cached) {
          document.body.style.setProperty(colorVar, cached);
        }
      }

      // Remove alpha channel from colors
      const value = getComputedStyle(document.documentElement).getPropertyValue(
        colorVar,
      );
      if (colorVar.startsWith("#") && value.length > 7) {
        document.body.style.setProperty(colorVar, value.slice(0, 7));
      }
    }

    if (jetbrains) {
      // Save theme colors to local storage for immediate loading in JetBrains
      ideMessenger.request("jetbrains/getColors", undefined).then((result) => {
        if (result.status === "success") {
          Object.entries(result.content).forEach(([key, value]) => {
            document.body.style.setProperty(key, value);
            document.documentElement.style.setProperty(key, value);
          });
        }
      });

      // Tell JetBrains the webview is ready
      ideMessenger.request("jetbrains/onLoad", undefined).then((result) => {
        if (result.status === "error") {
          return;
        }

        const msg = result.content;
        (window as any).windowId = msg.windowId;
        (window as any).serverUrl = msg.serverUrl;
        (window as any).workspacePaths = msg.workspacePaths;
        (window as any).vscMachineId = msg.vscMachineId;
        (window as any).vscMediaUrl = msg.vscMediaUrl;
      });

      for (const colorVar of VSC_THEME_COLOR_VARS) {
        if (document.body.style.getPropertyValue(colorVar)) {
          localStorage.setItem(
            colorVar,
            document.body.style.getPropertyValue(colorVar),
          );
        }
      }
    }
  }, []);

  useWebviewListener(
    "jetbrains/setColors",
    async (data) => {
      Object.entries(data).forEach(([key, value]) => {
        document.body.style.setProperty(key, value);
        document.documentElement.style.setProperty(key, value);
      });
    },
    [],
  );

  // IDE event listeners
  useWebviewListener(
    "getWebviewHistoryLength",
    async () => {
      return history.length;
    },
    [history],
  );

  useWebviewListener(
    "getCurrentSessionId",
    async () => {
      return sessionId;
    },
    [sessionId],
  );

  useWebviewListener("setInactive", async () => {
    dispatch(cancelStream());
  });

  useWebviewListener("setTTSActive", async (status) => {
    dispatch(setTTSActive(status));
  });

  // TODO - remove?
  useWebviewListener("submitMessage", async (data) => {
    dispatch(
      streamResponseThunk({
        editorState: data.message,
        modifiers: { useCodebase: false, noContext: true },
      }),
    );
  });

  useWebviewListener("addContextItem", async (data) => {
    dispatch(
      addContextItemsAtIndex({
        index: data.historyIndex,
        contextItems: [data.item],
      }),
    );
  });

  useWebviewListener("indexing/statusUpdate", async (data) => {
    dispatch(updateIndexingStatus(data));
  });

  const currentToolCallApplyState = useAppSelector(
    selectCurrentToolCallApplyState,
  );
  useWebviewListener(
    "updateApplyState",
    async (state) => {
      if (state.streamId === EDIT_MODE_STREAM_ID) {
        dispatch(updateEditStateApplyState(state));
      } else {
        // chat or agent
        dispatch(updateApplyState(state));

        // Handle apply status updates that are associated with current tool call
        if (
          state.status === "closed" &&
          currentToolCallApplyState &&
          currentToolCallApplyState.streamId === state.streamId
        ) {
          const toolCallId = currentToolCallApplyState.toolCallId!;
          dispatch(acceptToolCall({ toolCallId }));
          dispatch(
            updateToolCallOutput({
              toolCallId,
              contextItems: [buildEditToolOutput(state)],
            }),
          );
          dispatch(streamResponseAfterToolCall({ toolCallId }));
        }
      }
    },
    [currentToolCallApplyState, history],
  );

  return <></>;
}

export default ParallelListeners;
