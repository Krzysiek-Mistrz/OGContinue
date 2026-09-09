import * as YAML from "yaml";
import { IDE } from "../..";
import { getGlobalAssistantsPath } from "../../util/paths";
import { localPathToUri } from "../../util/pathToUri";
import { joinPathsToUri } from "../../util/uri";

/**
 * Any YAML file under ~/.continue/assistants/ (or <workspace>/.continue/assistants/,
 * see getDotContinueSubDirs) already loads as its own switchable profile - see
 * ConfigHandler.getLocalProfiles. Nothing wrote to that folder from the UI
 * before, so this is the missing other half: give the file a name, drop it
 * there, open it.
 */
export async function createNewLocalAssistantFile(ide: IDE): Promise<void> {
  const baseDirUri = localPathToUri(getGlobalAssistantsPath());

  let counter = 0;
  let fileUri: string;
  do {
    const suffix = counter === 0 ? "" : `-${counter}`;
    fileUri = joinPathsToUri(baseDirUri, `new-assistant${suffix}.yaml`);
    counter++;
  } while (await ide.fileExists(fileUri));

  await ide.writeFile(
    fileUri,
    YAML.stringify({
      name: "New Assistant",
      version: "0.0.1",
      schema: "v1",
      models: [
        {
          name: "My Model",
          provider: "ollama",
          model: "REPLACE_WITH_YOUR_OLLAMA_MODEL",
          roles: ["chat", "edit", "apply"],
        },
      ],
    }),
  );
  await ide.openFile(fileUri);
}
