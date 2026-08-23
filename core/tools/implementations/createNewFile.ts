import {
  inferResolvedUriFromRelativePath,
  resolveWorkspaceDir,
} from "../../util/ideUtils";

import { ToolImpl } from ".";
import {
  getCleanUriPath,
  getUriPathBasename,
  joinPathsToUri,
} from "../../util/uri";

/**
 * A new file cannot be located by searching for it, but the folder it belongs
 * in usually can. Resolving that folder keeps a file the model asked for at
 * "src/util/helper.ts" out of the workspace root when the project actually
 * lives a level or two down.
 */
async function resolveNewFileUri(
  filepath: string,
  extras: Parameters<ToolImpl>[1],
): Promise<string> {
  const segments = filepath.replaceAll("\\", "/").split("/").filter(Boolean);

  if (segments.length > 1) {
    const parentDir = segments.slice(0, -1).join("/");
    const resolvedParent = await resolveWorkspaceDir(parentDir, extras.ide);
    if (resolvedParent) {
      return joinPathsToUri(resolvedParent, segments[segments.length - 1]);
    }
  }

  return inferResolvedUriFromRelativePath(filepath, extras.ide);
}

export const createNewFileImpl: ToolImpl = async (args, extras) => {
  const resolvedFileUri = await resolveNewFileUri(args.filepath, extras);
  if (resolvedFileUri) {
    const exists = await extras.ide.fileExists(resolvedFileUri);
    if (exists) {
      throw new Error(
        `File ${args.filepath} already exists. Use the edit tool to edit this file`,
      );
    }
    await extras.ide.writeFile(resolvedFileUri, args.contents);
    await extras.ide.openFile(resolvedFileUri);
    return [
      {
        name: getUriPathBasename(resolvedFileUri),
        description: getCleanUriPath(resolvedFileUri),
        content: "File created successfuly",
        uri: {
          type: "file",
          value: resolvedFileUri,
        },
      },
    ];
  } else {
    throw new Error("Failed to resolve path");
  }
};
