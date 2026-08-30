import { getUriDescription } from "../../util/uri";

import { ToolImpl } from ".";
import { MAX_REPORTED_FILE_CHARS } from "./readFile";

export const readCurrentlyOpenFileImpl: ToolImpl = async (args, extras) => {
  const result = await extras.ide.getCurrentFile();

  if (!result) {
    return [];
  }

  const { relativePathOrBasename, last2Parts, baseName } = getUriDescription(
    result.path,
    await extras.ide.getWorkspaceDirs(),
  );

  const contents =
    result.contents.length > MAX_REPORTED_FILE_CHARS
      ? `${result.contents.slice(0, MAX_REPORTED_FILE_CHARS)}\n\n[Truncated: showing the first ${MAX_REPORTED_FILE_CHARS} of ${result.contents.length} characters.]`
      : result.contents;

  return [
    {
      name: `Current file: ${baseName}`,
      description: last2Parts,
      content: `\`\`\`${relativePathOrBasename}\n${contents}\n\`\`\``,
      uri: {
        type: "file",
        value: result.path,
      },
    },
  ];
};
