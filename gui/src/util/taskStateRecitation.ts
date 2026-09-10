import { ChatHistoryItem, ChatMessage } from "core";
import { BuiltInToolNames } from "core/tools/builtIn";
import { extractFilePathMentions } from "./extractFilePathMentions";

// A small model loops mostly because it forgets what it already did - each
// turn it attends to the newest tool result, not the pattern of past ones.
// This restates progress at the end of every request (like todo.md),
// built from tool calls actually executed, never the model's own account.

const READ_TOOLS: string[] = [
  BuiltInToolNames.ReadFile,
  BuiltInToolNames.ReadCurrentlyOpenFile,
];

const EDIT_TOOLS: string[] = [
  BuiltInToolNames.EditExistingFile,
  BuiltInToolNames.CreateNewFile,
];

const MAX_LISTED_PATHS = 8;

function formatPaths(paths: string[]): string {
  const shown = paths.slice(0, MAX_LISTED_PATHS).join(", ");
  return paths.length > MAX_LISTED_PATHS
    ? `${shown} (and ${paths.length - MAX_LISTED_PATHS} more)`
    : shown;
}

interface TaskProgress {
  read: string[];
  edited: string[];
  pending: string[];
  unverified: string[];
}

function commandSucceeded(state: {
  toolCall: { function: { name: string } };
  output?: { status?: string }[];
}): boolean {
  if (state.toolCall.function.name !== BuiltInToolNames.RunTerminalCommand) {
    return true;
  }
  return !(state.output ?? []).some((item) =>
    item.status?.startsWith("Command failed"),
  );
}

function succeededCalls(history: ChatHistoryItem[]) {
  return history
    .map((item) => item.toolCallState)
    .filter(
      (state): state is NonNullable<typeof state> =>
        !!state &&
        (state.status === "done" || state.status === "calling") &&
        commandSucceeded(state),
    );
}

export function collectTaskProgress(
  history: ChatHistoryItem[],
  planTargets: string[],
  verifyTargets: string[] = [],
): TaskProgress {
  const read = new Set<string>();
  const edited = new Set<string>();
  const commandsRun: string[] = [];

  for (const state of succeededCalls(history)) {
    const name = state.toolCall.function.name;
    if (name === BuiltInToolNames.RunTerminalCommand) {
      commandsRun.push(JSON.stringify(state.parsedArgs ?? {}));
      continue;
    }
    const filepath = state.parsedArgs?.filepath;
    if (typeof filepath !== "string" || !filepath) {
      continue;
    }
    if (EDIT_TOOLS.includes(name)) {
      edited.add(filepath);
    } else if (READ_TOOLS.includes(name)) {
      read.add(filepath);
    }
  }

  const editedPaths = Array.from(edited);
  const resolve = (target: string) =>
    [...editedPaths, ...read].find((path) => path.includes(target)) ?? target;
  const commandText = commandsRun.join(" ");

  return {
    read: Array.from(read).filter((path) => !edited.has(path)),
    edited: editedPaths,
    pending: planTargets
      .filter((target) => !editedPaths.some((path) => path.includes(target)))
      .map(resolve),
    unverified: verifyTargets
      .filter((target) => !commandText.includes(target))
      .map(resolve),
  };
}

const PROGRESS_TOOLS: string[] = [
  BuiltInToolNames.EditExistingFile,
  BuiltInToolNames.CreateNewFile,
  BuiltInToolNames.RunTerminalCommand,
];

export interface PlanStepStatus {
  text: string;
  paths: string[];
  done: boolean;
}

export function collectPlanProgress(
  steps: string[],
  history: ChatHistoryItem[],
): PlanStepStatus[] {
  const progressText = succeededCalls(history)
    .filter((state) => PROGRESS_TOOLS.includes(state.toolCall.function.name))
    .map((state) => JSON.stringify(state.parsedArgs ?? {}))
    .join(" ");

  return steps.map((text) => {
    const paths = extractFilePathMentions(text);
    return {
      text,
      paths,
      done: paths.length > 0 && paths.some((p) => progressText.includes(p)),
    };
  });
}

function unfinishedCheckableSteps(
  steps: string[],
  history: ChatHistoryItem[],
): PlanStepStatus[] {
  return collectPlanProgress(steps, history).filter(
    (step) => step.paths.length > 0 && !step.done,
  );
}

export function buildTaskStateRecitation(
  history: ChatHistoryItem[],
  planTargets: string[],
  verifyTargets: string[] = [],
  planSteps: string[] = [],
): ChatMessage | undefined {
  const { read, edited, pending, unverified } = collectTaskProgress(
    history,
    planTargets,
    verifyTargets,
  );

  if (!read.length && !edited.length && !pending.length && !planSteps.length) {
    return undefined;
  }

  const lines = ["[Task state - maintained automatically, not written by you]"];

  const steps = collectPlanProgress(planSteps, history);
  if (steps.length) {
    lines.push("Your plan:");
    steps.forEach((step, i) => {
      lines.push(`  ${step.done ? "[done]" : "[    ]"} ${i + 1}. ${step.text}`);
    });
  }
  if (edited.length) {
    lines.push(`Already changed: ${formatPaths(edited)}`);
  }
  if (read.length) {
    lines.push(
      `Already read, contents are above: ${formatPaths(read)} - you have these, do not read them again.`,
    );
  }

  const nextStep = steps.find((step) => !step.done);
  if (nextStep) {
    lines.push(
      `Next action: ${nextStep.text}. Say in one short sentence what you are doing, and make the tool call in that same reply - a reply that only describes the step does not count as taking it.`,
    );
  } else if (steps.length) {
    lines.push(
      "Every step of your plan is done. Call the task_complete tool with a summary, unless you can point to something concrete that is still wrong.",
    );
  } else if (pending.length) {
    lines.push(`Still to change: ${formatPaths(pending)}`);
    lines.push(
      `Next action: ${pending[0]}. Say in one short sentence what you are about to change, and make the tool call in that same reply - a reply that only describes the step does not count as taking it.`,
    );
  } else if (unverified.length) {
    lines.push(
      `Everything the request asked to change has been changed. It also asks that ${formatPaths(unverified)} works - that part is not done yet.`,
    );
    lines.push(
      `Next action: verify ${unverified[0]} by running it with the terminal tool, then report what it printed.`,
    );
  } else if (edited.length) {
    lines.push(
      "Nothing is left from the original request. Summarize what you changed and stop, unless you can point to something concrete that is still wrong.",
    );
  }

  return { role: "user", content: lines.join("\n") };
}

export function withTaskStateRecitation(
  messages: ChatMessage[],
  mode: string,
  history: ChatHistoryItem[],
  planTargets: string[],
  verifyTargets: string[] = [],
  planSteps: string[] = [],
): ChatMessage[] {
  if (mode !== "agent") {
    return messages;
  }
  const recitation = buildTaskStateRecitation(
    history,
    planTargets,
    verifyTargets,
    planSteps,
  );
  return recitation ? [...messages, recitation] : messages;
}

export function reasonTaskIncomplete(
  history: ChatHistoryItem[],
  planTargets: string[],
  verifyTargets: string[],
  planSteps: string[] = [],
): string | undefined {
  const unfinished = unfinishedCheckableSteps(planSteps, history);
  if (unfinished.length) {
    const list = unfinished.map((step) => `"${step.text}"`).join(", ");
    return `Not finished: your own plan still has ${list} outstanding, and nothing has changed ${unfinished[0].paths[0]}. Carry out that step now.`;
  }

  const { pending, unverified } = collectTaskProgress(
    history,
    planTargets,
    verifyTargets,
  );

  if (pending.length) {
    const was = pending.length === 1 ? "was" : "were";
    const has = pending.length === 1 ? "has" : "have";
    return `Not finished: ${pending.join(", ")} ${was} named by the request but ${has} not been edited. Work on ${pending[0]} now.`;
  }
  if (unverified.length) {
    return `Not finished: the request also asks that ${unverified.join(", ")} works, and that has not been checked. Run it with the terminal tool and report the result.`;
  }
  return undefined;
}
