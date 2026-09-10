/**
 * A headless agent loop for checking the harness end to end.
 *
 * Everything that decides behaviour is imported from the extension's own
 * source - the system message, the tool definitions, the tool implementations,
 * the plain-text tool-call recovery, the task-state recitation and the
 * task_complete gate - so a green run says those actually carry a task to
 * completion with a given model.
 *
 * What it is NOT: the VS Code layer. The IDE below is a plain filesystem
 * implementation, and edits are applied directly instead of through the
 * accept/reject diff UI, which cannot be clicked from here. So this cannot
 * catch a bug in ApplyManager or in VS Code path resolution - only a real run
 * in the editor does that.
 */
import { DEFAULT_AGENT_SYSTEM_MESSAGE } from "../../core/llm/constructMessages";
import { tryRecoverToolCallFromText } from "../../core/llm/llms/Ollama";
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
  how: "native" | "recovered" | "reconstructed";
  ok: boolean;
  detail: string;
}

async function chatOllama(model: string, messages: any[]) {
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: allTools.map((t) => ({ type: "function", function: t.function })),
      stream: false,
      options: { temperature: 0.2, num_ctx: CONTEXT_LENGTH },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Ollama ${response.status} for ${model}: ${await response.text()}`,
    );
  }
  return (await response.json()).message;
}

// llama-server's parser requires strict OpenAI shape: every tool_calls[i]
// needs `type: "function"` and a stringified `arguments`, unlike Ollama's
// looser native format that this harness's `messages` array otherwise uses.
function toOpenAiShape(m: any) {
  if (m.role === "assistant" && m.tool_calls?.length) {
    return {
      ...m,
      tool_calls: m.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      })),
    };
  }
  return m;
}

// llama-server serves exactly one loaded GGUF, so `model` is a label only -
// same as the real LlamaCpp provider, which never sends a `model` field.
async function chatLlamaCpp(model: string, messages: any[]) {
  const response = await fetch(`${LLAMACPP}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(toOpenAiShape),
      tools: allTools.map((t) => ({ type: "function", function: t.function })),
      stream: false,
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `llama.cpp ${response.status} for ${model}: ${await response.text()}`,
    );
  }
  const message = (await response.json()).choices[0].message;
  // OpenAI-shaped tool_calls carry stringified arguments; the rest of this
  // loop expects the already-parsed object, matching Ollama's native shape.
  if (message.tool_calls?.length) {
    message.tool_calls = message.tool_calls.map((tc: any) => ({
      ...tc,
      function: {
        ...tc.function,
        arguments: JSON.parse(tc.function.arguments),
      },
    }));
  }
  return message;
}

async function chat(model: string, messages: any[]) {
  return BACKEND === "llamacpp"
    ? chatLlamaCpp(model, messages)
    : chatOllama(model, messages);
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
  const toolNames = allTools.map((t) => t.function.name);
  const planTargets = extractTaskTargets(request);
  const verifyTargets = extractVerifyTargets(request);
  console.log(`model: ${model}`);
  console.log(`plan:  change ${JSON.stringify(planTargets)} verify ${JSON.stringify(verifyTargets)}\n`);

  const messages: any[] = [
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

    let reply: any;
    try {
      reply = await chat(model, sent);
    } catch (e: any) {
      console.log(`${step + 1}. FAILED to get a reply: ${e.message}`);
      steps.push({ tool: "(error)", args: null, how: "native", ok: false, detail: e.message });
      break;
    }
    const text: string = (reply.content ?? "").trim();

    let name: string | undefined;
    let args: any;
    let how: "native" | "recovered" | "reconstructed" = "native";

    if (reply.tool_calls?.length) {
      name = reply.tool_calls[0].function.name;
      args = reply.tool_calls[0].function.arguments;
    } else {
      const recovered = tryRecoverToolCallFromText(text, toolNames);
      if (recovered) {
        name = recovered.name;
        args = recovered.args;
        how = "recovered";
      }
    }

    if (!name) {
      const { pending } = collectTaskProgress(history, planTargets, verifyTargets);
      const described = describedAction(text, pending);
      const repeat =
        described &&
        history.some(
          (item) =>
            item.toolCallState.toolCall.function.name === described.toolName &&
            item.toolCallState.parsedArgs?.filepath === described.args.filepath,
        );
      if (described && !repeat) {
        name = described.toolName;
        args = described.args;
        how = "reconstructed";
      }
    }

    if (!name) {
      const done = collectTaskProgress(history, planTargets, verifyTargets);
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
      content: how === "recovered" ? "" : text,
      tool_calls: [{ id: toolCallId, function: { name, arguments: args } }],
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
        messages.push({ role: "tool", tool_name: name, tool_call_id: toolCallId, content: reason });
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
      messages.push({ role: "tool", tool_name: name, tool_call_id: toolCallId, content: blocked });
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
    messages.push({ role: "tool", tool_name: name, tool_call_id: toolCallId, content });
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
  const recovered = steps.filter((s) => s.how === "recovered").length;
  console.log(
    `\n${steps.length} steps, ${recovered} recovered from text, ended by task_complete: ${finished}`,
  );
  process.exit(finished ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
