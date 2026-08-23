import { ToolImpl } from ".";
import { walkDir } from "../../indexing/walkDir";
import { resolveWorkspaceDir } from "../../util/ideUtils";

export const lsToolImpl: ToolImpl = async (args, extras) => {
  const uri = await resolveWorkspaceDir(args.dirPath, extras.ide);
  if (!uri) {
    throw new Error(
      `Directory ${args.dirPath} not found. Use a forward-slash path relative to the project root, e.g. "src/formatters", or "/" for the root itself.`,
    );
  }

  const entries = await walkDir(uri, extras.ide, {
    returnRelativeUrisPaths: true,
    include: "both",
    recursive: args.recursive ?? false,
  });

  const content =
    entries.length > 0
      ? entries.join("\n")
      : `No files/folders found in ${args.dirPath}`;

  return [
    {
      name: "File/folder list",
      description: `Files/folders in ${args.dirPath}`,
      content,
    },
  ];
};
