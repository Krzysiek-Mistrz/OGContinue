// headless agent loop 4 checking the harness end to end
// pulls system msg/tools/recovery/task-state logic straight from ext source, so a
// green run actually means smth for a given model
// llm call goes thru the real streamChat() (same as a real gui turn) not a hand-rolled
// fetch - a hand-rolled req can silently diverge from what the ext really sends (it did,
// see autodetect.ts's PROVIDER_HANDLES_TEMPLATING)
// NOT the vscode layer tho - ide here is plain fs, edits applied directly, no diff ui.
// can't catch ApplyManager/vscode path-resolution bugs, only a real editor run does that
import { ChatMessage, Tool } from "../../core";
import { DEFAULT_AGENT_SYSTEM_MESSAGE } from "../../core/llm/constructMessages";
import LlamaCpp from "../../core/llm/llms/LlamaCpp";
import Ollama from "../../core/llm/llms/Ollama";
import { BuiltInToolNames } from "../../core/tools/builtIn";
import { callTool } from "../../core/tools/callTool";
import { allTools } from "../../core/tools/index";
import { buildNudgeMessage, resolvedPathFor } from "../../gui/src/util/agentNudge";
import { describedAction } from "../../gui/src/util/describedAction";
import {
  extractTaskTargets,
  extractVerifyTargets,
} from "../../gui/src/util/extractFilePathMentions";
import {
  buildTaskStateRecitation,
  collectTaskProgress,
  reasonTaskIncomplete,
} from "../../gui/src/util/taskStateRecitation";
import { createFsIde } from "./runner-ide";

const OLLAMA = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const LLAMACPP = process.env.LLAMACPP_HOST ?? "http://127.0.0.1:8080";
const BACKEND = process.env.EVAL_BACKEND === "llamacpp" ? "llamacpp" : "ollama";
const CONTEXT_LENGTH = Number(process.env.EVAL_NUM_CTX ?? 8192);
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 30);

const MAX_NUDGE_ATTEMPTS = 2;

interface Step {
  tool: string;
  args: any;
  how: "native" | "reconstructed";
  ok: boolean;
  detail: string;
}

function createLlm(model: string) {
  return BACKEND === "llamacpp"
    ? new LlamaCpp({ model, apiBase: LLAMACPP, contextLength: CONTEXT_LENGTH })
    : new Ollama({ model, apiBase: OLLAMA, contextLength: CONTEXT_LENGTH });
}

async function chat(
  llm: LlamaCpp | Ollama,
  messages: ChatMessage[],
  tools: Tool[],
) {
  let content = "";
  const toolCalls: { id?: string; name: string; arguments: string }[] = [];
  for await (const chunk of llm.streamChat(
    messages,
    new AbortController().signal,
    { temperature: 0.2, tools },
  )) {
    if (chunk.role === "assistant") {
      if (typeof chunk.content === "string") {
        content += chunk.content;
      }
      for (const tc of chunk.toolCalls ?? []) {
        if (tc.function?.name) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments ?? "{}",
          });
        }
      }
    }
  }
  return {
    content,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      function: { name: tc.name, arguments: JSON.parse(tc.arguments) },
    })),
  };
}

function historyItem(
  tool: string,
  args: any,
  status: string,
  output: any[] = [],
) {
  return {
    message: { role: "assistant", content: "" },
    contextItems: [],
    toolCallState: {
      toolCallId: `${tool}-${Math.random()}`,
      toolCall: { id: "1", type: "function", function: { name: tool, arguments: "" } },
      status,
      parsedArgs: args,
      output,
    },
  } as any;
}

async function main() {
  const model = process.argv[2] ?? "qwen2.5-coder:7b-instruct-q4_K_M";
  const workspace = process.argv[3];
  const request = process.argv[4];

  const ide = createFsIde(workspace);
  const llm = createLlm(model);
  const planTargets = extractTaskTargets(request);
  const verifyTargets = extractVerifyTargets(request);
  console.log(`model: ${model}`);
  console.log(`plan:  change ${JSON.stringify(planTargets)} verify ${JSON.stringify(verifyTargets)}\n`);

  const messages: ChatMessage[] = [
    { role: "system", content: DEFAULT_AGENT_SYSTEM_MESSAGE },
    { role: "user", content: request },
  ];
  const history: any[] = [];
  let planSteps: string[] = [];
  const steps: Step[] = [];
  let nudge: any[] = [];
  let nudgeAttempts = 0;
  let finishedByPlan = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const recitation = buildTaskStateRecitation(
      history,
      planTargets,
      verifyTargets,
      planSteps,
    );
    const sent = [...messages, ...(recitation ? [recitation] : []), ...nudge];

    let reply: Awaited<ReturnType<typeof chat>>;
    try {
      reply = await chat(llm, sent, allTools);
    } catch (e: any) {
      console.log(`${step + 1}. FAILED to get a reply: ${e.message}`);
      steps.push({ tool: "(error)", args: null, how: "native", ok: false, detail: e.message });
      break;
    }
    const text: string = (reply.content ?? "").trim();

    let name: string | undefined;
    let args: any;
    // "native" = real native call OR provider-recovered - streamChat() doesn't tell them apart
    let how: "native" | "reconstructed" = "native";

    if (reply.tool_calls?.length) {
      name = reply.tool_calls[0].function.name;
      args = reply.tool_calls[0].function.arguments;
    }

    if (!name) {
      const { pending, unverified } = collectTaskProgress(
        history,
        planTargets,
        verifyTargets,
      );
      const described = describedAction(text, pending, unverified);
      const repeat =
        described &&
        history.some(
          (item) =>
            item.toolCallState.toolCall.function.name === described.toolName &&
            JSON.stringify(item.toolCallState.parsedArgs ?? {}) ===
              JSON.stringify(described.args),
        );
      if (described && !repeat) {
        name = described.toolName;
        args = described.args;
        how = "reconstructed";
      }
    }

    if (!name) {
      const done = collectTaskProgress(history, planTargets, verifyTargets);
      if (process.env.EVAL_DEBUG) {
        console.log(
          `      DEBUG progress: pending=${JSON.stringify(done.pending)} unverified=${JSON.stringify(done.unverified)}`,
        );
      }
      if (
        planTargets.length > 0 &&
        done.pending.length === 0 &&
        done.unverified.length === 0
      ) {
        console.log(`${step + 1}. plan complete - turn ends without a formal hand-back`);
        finishedByPlan = true;
        break;
      }

      nudgeAttempts++;
      console.log(`${step + 1}. no tool call — "${text.slice(0, 80)}"`);
      steps.push({ tool: "(none)", args: null, how, ok: false, detail: text.slice(0, 60) });
      if (nudgeAttempts > MAX_NUDGE_ATTEMPTS) {
        console.log("        nudges exhausted - the extension would post its warning and stop here");
        break;
      }
      const { pending, unverified } = collectTaskProgress(
        history,
        planTargets,
        verifyTargets,
      );
      const target = pending[0];
      nudge = [
        buildNudgeMessage(
          target,
          target ? resolvedPathFor(target, history) : undefined,
          pending.length === 0 ? unverified[0] : undefined,
        ),
      ];
      continue;
    }

    nudge = [];
    nudgeAttempts = 0;

    const toolCallId = `call_${step}`;
    messages.push({
      role: "assistant",
      content: text,
      toolCalls: [
        {
          id: toolCallId,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    });

    if (name === BuiltInToolNames.SetTaskPlan && Array.isArray(args?.steps)) {
      planSteps = args.steps.filter((x: unknown) => typeof x === "string");
      console.log(
        `${step + 1}. set_task_plan (${how}) — ${planSteps.length} steps:`,
      );
      planSteps.forEach((s2, i) => console.log(`      ${i + 1}. ${s2}`));
    }

    if (name === BuiltInToolNames.TaskComplete) {
      const reason = reasonTaskIncomplete(
        history,
        planTargets,
        verifyTargets,
        planSteps,
      );
      if (reason) {
        console.log(`${step + 1}. task_complete REJECTED (${how}) — ${reason.slice(0, 80)}`);
        if (process.env.EVAL_DEBUG) {
          for (const h of history) {
            const st = h.toolCallState;
            if (st?.toolCall.function.name === BuiltInToolNames.RunTerminalCommand) {
              console.log(
                `      DEBUG term: status=${st.status} cmd=${JSON.stringify(st.parsedArgs?.command)} outStatus=${JSON.stringify((st.output ?? []).map((o: any) => o.status))}`,
              );
            }
          }
        }
        messages.push({ role: "tool", toolCallId, content: reason });
        history.push(historyItem(name, args, "errored"));
        steps.push({ tool: name, args, how, ok: false, detail: "rejected" });
        continue;
      }
      console.log(`${step + 1}. task_complete ACCEPTED (${how}) — turn ends`);
      steps.push({ tool: name, args, how, ok: true, detail: String(args?.summary ?? "").slice(0, 70) });
      break;
    }

    const tool = allTools.find((t) => t.function.name === name)!;
    const identical = steps.filter(
      (s) => s.tool === name && JSON.stringify(s.args) === JSON.stringify(args),
    ).length;
    if (!tool.readonly && identical >= 2) {
      const blocked = `${name} has already been called with exactly these arguments ${identical} times, so calling it again cannot produce a different result. Do something else.`;
      console.log(`${step + 1}. BLOCKED ${name} (repeat guard)`);
      messages.push({ role: "tool", toolCallId, content: blocked });
      steps.push({ tool: name, args, how, ok: false, detail: "blocked" });
      continue;
    }

    let content: string;
    let ok = true;
    let toolOutput: any[] = [];
    if (name === BuiltInToolNames.EditExistingFile) {
      const result = await ide.applyEdit(args.filepath, args.changes);
      ok = result.ok;
      content = result.message;
    } else {
      const result = await callTool(tool, JSON.stringify(args), {
        ide,
        llm: {} as any,
        fetch: fetch as any,
        tool,
      });
      ok = !result.errorMessage;
      content = result.errorMessage ?? result.contextItems.map((c) => c.content).join("\n");
      toolOutput = result.contextItems;
    }

    history.push(historyItem(name, args, ok ? "done" : "errored", toolOutput));
    messages.push({ role: "tool", toolCallId, content });
    const label = args?.filepath ?? args?.command ?? args?.pattern ?? args?.dirPath ?? "";
    console.log(`${step + 1}. ${ok ? "ok  " : "FAIL"} ${name} ${label} (${how})`);
    if (!ok) {
      console.log(`        ${content.split("\n")[0].slice(0, 100)}`);
    }
    steps.push({ tool: name, args, how, ok, detail: content.slice(0, 60) });
  }

  const finished =
    finishedByPlan ||
    (steps.at(-1)?.tool === BuiltInToolNames.TaskComplete && !!steps.at(-1)?.ok);
  const reconstructed = steps.filter((s) => s.how === "reconstructed").length;
  console.log(
    `\n${steps.length} steps, ${reconstructed} reconstructed from narration, ended by task_complete: ${finished}`,
  );
  process.exit(finished ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
