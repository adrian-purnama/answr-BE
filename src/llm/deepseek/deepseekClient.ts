import { env } from "../../environment/env";
import { logger } from "../../logger/logger";

export const DEEPSEEK_CHAT_MODEL = "deepseek-flash";

export type DeepseekChatRole = "system" | "user" | "assistant" | "tool";

export type DeepseekToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type DeepseekMessage = {
  role: DeepseekChatRole;
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: DeepseekToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type DeepseekTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type DeepseekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type DeepseekChatRequest = {
  model: string;
  messages: DeepseekMessage[];
  tools?: DeepseekTool[];
  temperature?: number;
  max_tokens?: number;
};

export type DeepseekToolCallDelta = {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type DeepseekDelta = {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: DeepseekToolCallDelta[];
};

export type DeepseekChunk = {
  choices?: Array<{
    delta?: DeepseekDelta;
    message?: DeepseekMessage;
    finish_reason?: string | null;
  }>;
  usage?: DeepseekUsage;
};

export type DeepseekClientConfig = {
  baseUrl?: string;
  apiKey?: string;
};

export class DeepseekClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config?: DeepseekClientConfig) {
    this.baseUrl = (config?.baseUrl ?? env.deepseekBaseUrl).replace(/\/$/, "");
    this.apiKey = config?.apiKey ?? env.deepseekApiKey;
  }

  async chat(options: DeepseekChatRequest): Promise<DeepseekChunk> {
    const response = await this.post(this.buildBody(options, false));
    return (await response.json()) as DeepseekChunk;
  }

  async *chatStream(
    options: DeepseekChatRequest,
  ): AsyncGenerator<DeepseekChunk> {
    const response = await this.post(this.buildBody(options, true));
    if (!response.body) {
      throw new Error("DeepSeek stream response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsed = parseSseLine(line);
        if (parsed === "done") return;
        if (parsed) yield parsed;
      }
    }

    const trailing = parseSseLine(buffer);
    if (trailing && trailing !== "done") yield trailing;
  }

  private buildBody(
    options: DeepseekChatRequest,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      stream,
      ...(typeof options.max_tokens === "number" &&
      Number.isFinite(options.max_tokens) &&
      options.max_tokens > 0
        ? { max_tokens: Math.trunc(options.max_tokens) }
        : {}),
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(options.tools && options.tools.length > 0
        ? { tools: options.tools }
        : {}),
    };
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not set");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    return response;
  }

  private async createHttpError(response: Response): Promise<Error> {
    const errorBody = await response.text();
    logger.error(
      `DeepSeek request failed (${response.status}): ${errorBody || response.statusText}`,
      "llm/deepseek/deepseekClient.ts",
      "createHttpError",
    );
    return new Error(
      `DeepSeek request failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }
}

function parseSseLine(line: string): DeepseekChunk | "done" | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice("data:".length).trim();
  if (!payload) return null;
  if (payload === "[DONE]") return "done";
  return JSON.parse(payload) as DeepseekChunk;
}

export const deepseekClient = new DeepseekClient();
