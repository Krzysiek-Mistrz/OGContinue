import { ToolImpl } from ".";

// plan is stored in the GUI (callCurrentTool.ts) - just echo it back into the conversation
export const setTaskPlanImpl: ToolImpl = async (args) => {
  const steps: string[] = Array.isArray(args.steps) ? args.steps : [];
  return [
    {
      name: "Task Plan",
      description: `${steps.length} steps`,
      content:
        steps.length === 0
          ? "No steps were given. Call this tool again with the steps this task breaks down into."
          : `Plan recorded:\n${steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\nNow carry out step 1.`,
    },
  ];
};
