import { v4 as uuidv4 } from "uuid";

import { ChatMessage, CompletionOptions, LLMOptions } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";
import { streamSse } from "../stream.js";
import { tryRecoverToolCallFromText } from "./Ollama.js";

interface LlamaCppToolCall {
  id?: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface LlamaCppChatMessage {
  role: string;
  content: string;
  tool_calls?: LlamaCppToolCall[];
  tool_call_id?: string;
}

interface LlamaCppChatResponse {
  error?: { message: string };
  choices?: Array<{
    message?: { role: string; content: string | null; tool_calls?: LlamaCppToolCall[] };
    delta?: { content?: string | null };
  }>;
}

class LlamaCpp extends BaseLLM {
  static providerName = "llama.cpp";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "http://127.0.0.1:8080/",
    maxEmbeddingBatchSize: 64,
  };

  private _convertArgs(options: CompletionOptions, prompt: string) {
    const finalOptions = {
      n_predict: options.maxTokens,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      min_p: options.minP,
      mirostat: options.mirostat,
      stop: options.stop,
      top_k: options.topK,
      top_p: options.topP,
      temperature: options.temperature,
    };

    return finalOptions;
  }

  private _convertToLlamaCppMessage(message: ChatMessage): LlamaCppChatMessage {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }

    const llamaCppMessage: LlamaCppChatMessage = {
      role: message.role,
      content: renderChatMessage(message),
    };

    // Tool calls must be sent back with the assistant turn that made them,
    // same reason as in Ollama.ts - otherwise the template loses the thread.
    if (message.role === "assistant" && message.toolCalls?.length) {
      const toolCalls = message.toolCalls
        .filter((toolCall) => toolCall.function?.name)
        .map((toolCall) => ({
          id: toolCall.id ?? `tc_${uuidv4()}`,
          type: "function" as const,
          function: {
            name: toolCall.function!.name!,
            arguments: toolCall.function?.arguments || "{}",
          },
        }));

      if (toolCalls.length > 0) {
        llamaCppMessage.tool_calls = toolCalls;
      }
    }

    return llamaCppMessage;
  }

  protected async *_streamComplete(
    prompt: string,
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<string> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.requestOptions?.headers,
    };

    const resp = await this.fetch(new URL("completions", this.apiBase), {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        stream: true,
        ...this._convertArgs(options, prompt),
      }),
      signal,
    });

    for await (const value of streamSse(resp)) {
      if (value.content) {
        yield value.content;
      }
    }
  }

  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.requestOptions?.headers,
    };

    const validToolNames = options.tools?.map((tool) => tool.function.name) ?? [];
    // llama-server's OpenAI-compatible endpoint can't stream a tool call
    // in pieces we can parse mid-flight, same constraint as Ollama.
    const stream = !validToolNames.length;

    const body: Record<string, unknown> = {
      messages: messages.map((m) => this._convertToLlamaCppMessage(m)),
      temperature: options.temperature,
      top_p: options.topP,
      top_k: options.topK,
      max_tokens: options.maxTokens,
      stop: options.stop,
      stream,
    };

    if (options.tools?.length) {
      body.tools = options.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));
    }

    const resp = await this.fetch(new URL("v1/chat/completions", this.apiBase), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    // See Ollama.ts's emitRecoveredToolCall - kept in sync deliberately, a
    // recovered call must arrive as its own tool-call-only message.
    function* emitRecoveredToolCall(recovered: {
      name: string;
      args: unknown;
      remainingText: string;
    }): Generator<ChatMessage> {
      let remainingText = recovered.remainingText;
      for (
        let extra = tryRecoverToolCallFromText(remainingText, validToolNames);
        extra !== null;
        extra = tryRecoverToolCallFromText(remainingText, validToolNames)
      ) {
        remainingText = extra.remainingText;
      }

      if (remainingText.trim()) {
        yield { role: "assistant", content: remainingText };
      }

      yield {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            type: "function",
            id: `tc_${uuidv4()}`,
            function: {
              name: recovered.name,
              arguments: JSON.stringify(recovered.args),
            },
          },
        ],
      };
    }

    if (!stream) {
      const json = (await resp.json()) as LlamaCppChatResponse;
      if (json.error) {
        throw new Error(json.error.message);
      }
      const message = json.choices?.[0]?.message;
      if (!message) {
        throw new Error("No message in llama.cpp response");
      }

      const chatMessage: ChatMessage = {
        role: "assistant",
        content: message.content ?? "",
      };
      if (message.tool_calls?.length) {
        chatMessage.toolCalls = message.tool_calls.map((tc) => ({
          type: "function",
          id: tc.id ?? `tc_${uuidv4()}`,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
      }

      // Small models often print the call as plain JSON text instead of
      // triggering llama.cpp's own template-based tool-call parsing.
      if (!chatMessage.toolCalls?.length && validToolNames.length) {
        const recovered = tryRecoverToolCallFromText(
          renderChatMessage(chatMessage),
          validToolNames,
        );
        if (recovered) {
          yield* emitRecoveredToolCall(recovered);
          return;
        }
      }

      yield chatMessage;
      return;
    }

    for await (const chunk of streamSse(resp) as AsyncGenerator<LlamaCppChatResponse>) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield { role: "assistant", content };
      }
    }
  }

  protected async _embed(chunks: string[]): Promise<number[][]> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.requestOptions?.headers,
    };

    // A dedicated llama-server serving an embedding GGUF, separate from the
    // one serving chat - one process can only ever have one model loaded.
    const resp = await this.fetch(new URL("v1/embeddings", this.apiBase), {
      method: "POST",
      headers,
      body: JSON.stringify({ input: chunks }),
    });

    if (!resp.ok) {
      throw new Error(`Failed to embed chunk: ${await resp.text()}`);
    }

    const data = (await resp.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    const embeddings = data.data?.map((d) => d.embedding);

    if (!embeddings || embeddings.length === 0) {
      throw new Error("llama.cpp generated empty embedding");
    }
    return embeddings;
  }
}

export default LlamaCpp;
