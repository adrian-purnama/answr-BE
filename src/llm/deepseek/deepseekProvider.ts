import {
  deepseekClient,
  type DeepseekMessage,
  type DeepseekTool,
  type DeepseekToolCallDelta,
  type DeepseekUsage,
} from "./deepseekClient";
import type {
  LlmChatConfig,
  LlmChatMessage,
  LlmChatTurnResult,
  LlmTokenUsage,
  LlmToolCall,
  LlmToolDefinition,
} from "../types";

export class DeepseekTurnError extends Error {
  readonly usage?: LlmTokenUsage;

  constructor(message: string, usage?: LlmTokenUsage) {
    super(message);
    this.name = "DeepseekTurnError";
    this.usage = usage;
  }
}

function toDeepseekMessages(messages: LlmChatMessage[]): DeepseekMessage[] {
  return messages.map((message) => {
    const out: DeepseekMessage = {
      role: message.role,
      content: message.content,
    };
    if (message.role === "assistant") {
      // Thinking mode rejects a later tools request if this field is omitted.
      out.reasoning_content = message.reasoningContent ?? "";
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      out.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      }));
    }
    if (message.role === "tool" && message.toolCallId) {
      out.tool_call_id = message.toolCallId;
    }
    if (message.role === "tool" && message.name) {
      out.name = message.name;
    }
    return out;
  });
}

function toDeepseekTools(tools: LlmToolDefinition[]): DeepseekTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters:
        tool.parameters && Object.keys(tool.parameters).length > 0
          ? tool.parameters
          : { type: "object", properties: {} },
    },
  }));
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function toLlmToolCalls(
  accumulated: Map<number, { id: string; name: string; arguments: string }>,
): LlmToolCall[] {
  const indices = [...accumulated.keys()].sort((a, b) => a - b);
  const out: LlmToolCall[] = [];
  for (const index of indices) {
    const item = accumulated.get(index);
    const name = item?.name.trim();
    if (!item || !name) continue;
    out.push({
      id: item.id.trim() || `call_${index}_${name}`,
      name,
      arguments: parseToolArguments(item.arguments),
    });
  }
  return out;
}

function applyToolDeltas(
  acc: Map<number, { id: string; name: string; arguments: string }>,
  deltas: DeepseekToolCallDelta[] | undefined,
): void {
  if (!deltas?.length) return;
  for (const delta of deltas) {
    const current = acc.get(delta.index) ?? {
      id: "",
      name: "",
      arguments: "",
    };
    if (delta.id) current.id = delta.id;
    if (delta.function?.name) current.name += delta.function.name;
    if (delta.function?.arguments) {
      current.arguments += delta.function.arguments;
    }
    acc.set(delta.index, current);
  }
}

function toUsage(raw: DeepseekUsage | undefined): LlmTokenUsage | undefined {
  if (!raw) return undefined;
  const promptTokens = raw.prompt_tokens ?? 0;
  const completionTokens = raw.completion_tokens ?? 0;
  if (promptTokens <= 0 && completionTokens <= 0) return undefined;
  return { promptTokens, completionTokens };
}

export class DeepseekProvider {
  async streamChatTurn(
    messages: LlmChatMessage[],
    config: LlmChatConfig,
    tools: LlmToolDefinition[] = [],
    onToken?: (token: string) => void,
  ): Promise<LlmChatTurnResult> {
    let text = "";
    let reasoningContent = "";
    const toolAcc = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let usage: LlmTokenUsage | undefined;

    try {
      for await (const chunk of deepseekClient.chatStream({
        model: config.name,
        messages: toDeepseekMessages(messages),
        temperature: config.temperature,
        ...(typeof config.maxTokens === "number" &&
        Number.isFinite(config.maxTokens) &&
        config.maxTokens > 0
          ? { max_tokens: Math.trunc(config.maxTokens) }
          : {}),
        ...(tools.length > 0 ? { tools: toDeepseekTools(tools) } : {}),
      })) {
        const reported = toUsage(chunk.usage);
        if (reported) usage = reported;

        const delta = chunk.choices?.[0]?.delta;
        const content = delta?.content;
        if (content) {
          text += content;
          onToken?.(content);
        }
        if (delta?.reasoning_content) {
          reasoningContent += delta.reasoning_content;
        }
        applyToolDeltas(toolAcc, delta?.tool_calls);

        const finished = chunk.choices?.[0]?.message;
        if (finished?.tool_calls?.length) {
          for (let i = 0; i < finished.tool_calls.length; i++) {
            const call = finished.tool_calls[i];
            toolAcc.set(i, {
              id: call.id,
              name: call.function.name,
              arguments: call.function.arguments ?? "",
            });
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "DeepSeek chat failed";
      throw new DeepseekTurnError(message, usage);
    }

    return {
      text: text.trim(),
      toolCalls: toLlmToolCalls(toolAcc),
      ...(reasoningContent ? { reasoningContent } : {}),
      ...(usage ? { usage } : {}),
    };
  }
}

export const deepseekProvider = new DeepseekProvider();
