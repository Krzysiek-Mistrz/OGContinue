import { createNewFileTool } from "./definitions/createNewFile";
import { createRuleBlock } from "./definitions/createRuleBlock";
import { editFileTool } from "./definitions/editFile";
import { globSearchTool } from "./definitions/globSearch";
import { grepSearchTool } from "./definitions/grepSearch";
import { lsTool } from "./definitions/lsTool";
import { readCurrentlyOpenFileTool } from "./definitions/readCurrentlyOpenFile";
import { readFileTool } from "./definitions/readFile";
import { runTerminalCommandTool } from "./definitions/runTerminalCommand";
import { searchWebTool } from "./definitions/searchWeb";
import { setTaskPlanTool } from "./definitions/setTaskPlan";
import { taskCompleteTool } from "./definitions/taskComplete";
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
  searchWebTool,
  setTaskPlanTool,
  taskCompleteTool,
  // replacing with ls tool for now
  // viewSubdirectoryTool,
  // viewRepoMapTool,
];
