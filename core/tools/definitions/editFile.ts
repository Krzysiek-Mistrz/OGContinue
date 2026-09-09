import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export interface EditToolArgs {
  filepath: string;
  changes: string;
}

export const editFileTool: Tool = {
  type: "function",
  displayTitle: "Edit File",
  wouldLikeTo: "edit {{{ filepath }}}",
  isCurrently: "editing {{{ filepath }}}",
  hasAlready: "edited {{{ filepath }}}",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  function: {
    name: BuiltInToolNames.EditExistingFile,
    description:
      "Use this tool to edit an existing file. If you don't know the contents of the file, read it first.",
    parameters: {
      type: "object",
      required: ["filepath", "changes"],
      properties: {
        filepath: {
          type: "string",
          description:
            "The path of the file to edit, relative to the root of the workspace.",
        },
        changes: {
          type: "string",
          description:
            "The file's COMPLETE new content after your changes are applied - not a diff or snippet. Do NOT wrap this in a codeblock, and do NOT use placeholders like '// ... existing code ...' for unchanged sections - write out the whole file, changed and unchanged parts alike. A partial edit with placeholders has to be merged into the file by a second, slower model call that can fail or stall; the complete file is applied instantly and deterministically instead.",
        },
      },
    },
  },
};
