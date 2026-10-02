import { resolveNewFileUri, resolveWorkspacePath } from "core/util/ideUtils";
import { getUriPathBasename } from "core/util/uri";
import { ClientToolImpl } from "./callClientTool";

// catches "... existing code ..." placeholders - model sends these sometimes even tho it shouldn't
const LAZY_MARKER = /\.{3}\s*(.+?)\s*\.{3}/;

// applies directly like the eval harness does - ApplyManager's diff flow relies on a
// streamId that never reliably gets seeded/closed, so it just stalls after Accept
export const editToolImpl: ClientToolImpl = async (
  args,
  toolCallId,
  extras,
) => {
  // fall back to creating it instead
  // of hard-failing on "does not exist"
  let targetUri = await resolveWorkspacePath(
    args.filepath,
    extras.ideMessenger.ide,
  );
  let isNewFile = false;
  if (!targetUri) {
    targetUri = await resolveNewFileUri(
      args.filepath,
      extras.ideMessenger.ide,
    );
    isNewFile = true;
  }
  if (LAZY_MARKER.test(args.changes)) {
    throw new Error(
      "This edit uses '... existing code ...' placeholders. Send the file's complete new content instead.",
    );
  }

  const contents = args.changes.endsWith("\n")
    ? args.changes
    : `${args.changes}\n`;
  await extras.ideMessenger.ide.writeFile(targetUri, contents);
  await extras.ideMessenger.ide.openFile(targetUri);

  return {
    respondImmediately: true,
    output: [
      {
        name: getUriPathBasename(targetUri),
        description: args.filepath,
        content: isNewFile
          ? `${args.filepath} didn't exist yet, so it was created with this content.`
          : `Applied the new content of ${args.filepath}.`,
      },
    ],
  };
};
