import { ToolImpl } from ".";

// the real completion check runs in callCurrentTool.ts before this - just acknowledge
export const taskCompleteImpl: ToolImpl = async (args) => [
  {
    name: "Task Complete",
    description: "The agent ended its turn",
    content: String(args.summary ?? "Task complete."),
    hidden: false,
  },
];
