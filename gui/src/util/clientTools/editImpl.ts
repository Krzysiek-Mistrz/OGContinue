import { resolveWorkspacePath } from "core/util/ideUtils";
import { getUriPathBasename } from "core/util/uri";
import { ClientToolImpl } from "./callClientTool";

// A partial diff instead of complete file content - the tool's own
// description forbids this, but a model sends one anyway sometimes.
const LAZY_MARKER = /\.{3}\s*(.+?)\s*\.{3}/;

// Applied directly, the same way the agent-eval harness does it. The
// interactive accept/reject diff flow (ApplyManager/VerticalDiffManager)
// depends on a streamId nothing ever seeds and a "closed" push that doesn't
// reliably arrive back - in practice the turn stalls spinning forever right
// after Accept. The tool's own contract already requires complete file
// content, so a diff review has nothing to add on top of that.
export const editToolImpl: ClientToolImpl = async (
  args,
  toolCallId,
  extras,
) => {
  const firstUriMatch = await resolveWorkspacePath(
    args.filepath,
    extras.ideMessenger.ide,
  );
  if (!firstUriMatch) {
    throw new Error(`${args.filepath} does not exist`);
  }
  if (LAZY_MARKER.test(args.changes)) {
    throw new Error(
      "This edit uses '... existing code ...' placeholders. Send the file's complete new content instead.",
    );
  }

  const contents = args.changes.endsWith("\n")
    ? args.changes
    : `${args.changes}\n`;
  await extras.ideMessenger.ide.writeFile(firstUriMatch, contents);
  await extras.ideMessenger.ide.openFile(firstUriMatch);

  return {
    respondImmediately: true,
    output: [
      {
        name: getUriPathBasename(firstUriMatch),
        description: args.filepath,
        content: `Applied the new content of ${args.filepath}.`,
      },
    ],
  };
};
