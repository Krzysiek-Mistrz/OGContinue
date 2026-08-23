import { createNewFileTool } from "./definitions/createNewFile";
import { createRuleBlock } from "./definitions/createRuleBlock";
import { editFileTool } from "./definitions/editFile";
import { globSearchTool } from "./definitions/globSearch";
import { grepSearchTool } from "./definitions/grepSearch";
import { lsTool } from "./definitions/lsTool";
import { readCurrentlyOpenFileTool } from "./definitions/readCurrentlyOpenFile";
import { readFileTool } from "./definitions/readFile";
import { runTerminalCommandTool } from "./definitions/runTerminalCommand";
import { viewDiffTool } from "./definitions/viewDiff";

export const allTools = [
  readFileTool,
  editFileTool,
  createNewFileTool,
  runTerminalCommandTool,
  grepSearchTool,
  globSearchTool,
  viewDiffTool,
  readCurrentlyOpenFileTool,
  lsTool,
  createRuleBlock,
  // replacing with ls tool for now
  // viewSubdirectoryTool,
  // viewRepoMapTool,
  // searchWebTool goes through Continue Dev's hosted trial proxy, which this
  // fork does not use, so it can only ever fail - and a failing tool invites
  // the model to retry it indefinitely.
];
