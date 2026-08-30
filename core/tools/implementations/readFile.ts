import { resolveWorkspacePath } from "../../util/ideUtils";
import { getUriPathBasename } from "../../util/uri";

import { ToolImpl } from ".";

const MAX_SUGGESTIONS = 10;

// A local model's context window can be as small as 8192 tokens
// (default when a config doesn't set contextLength). Cap what a single read reports back
export const MAX_REPORTED_FILE_CHARS = 8000;

/**
 * When a path cannot be resolved at all, point the model at the real
 * locations of that filename so it can retry instead of stalling.
 */
async function describeMissingFile(
  filepath: string,
  extras: Parameters<ToolImpl>[1],
): Promise<string> {
  const basename = getUriPathBasename(filepath);
  let matches: string[] = [];
  try {
    matches = (await extras.ide.getFileResults(`**/${basename}`))
      .map((match) => match.trim())
      .filter(Boolean);
  } catch {
    // Searching is best effort.
  }

  if (matches.length === 0) {
    return `Could not find file ${filepath}, and no file named ${basename} exists in the workspace. Use the list or glob tools to discover the correct path.`;
  }

  const shown = matches.slice(0, MAX_SUGGESTIONS);
  const more =
    matches.length > shown.length
      ? `\n(${matches.length - shown.length} more matches not shown)`
      : "";

  return `Could not find file ${filepath}. Files named ${basename} exist at these paths:\n${shown.join("\n")}${more}\nRetry with one of these exact paths.`;
}

export const readFileImpl: ToolImpl = async (args, extras) => {
  const resolvedUri = await resolveWorkspacePath(args.filepath, extras.ide);

  if (!resolvedUri) {
    throw new Error(await describeMissingFile(args.filepath, extras));
  }

  const fullContent = await extras.ide.readFile(resolvedUri);
  const content =
    fullContent.length > MAX_REPORTED_FILE_CHARS
      ? `${fullContent.slice(0, MAX_REPORTED_FILE_CHARS)}\n\n[Truncated: showing the first ${MAX_REPORTED_FILE_CHARS} of ${fullContent.length} characters. Use grep search to find a specific part of this file, or read it again with a narrower request.]`
      : fullContent;

  return [
    {
      name: getUriPathBasename(args.filepath),
      description: args.filepath,
      content,
      uri: {
        type: "file",
        value: resolvedUri,
      },
    },
  ];
};
