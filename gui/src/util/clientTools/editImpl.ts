import { resolveWorkspacePath } from "core/util/ideUtils";
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
