import { logger } from "../../logger/logger";
import type {
  LlmChatConfig,
  LlmChatMessage,
  LlmChatTurnResult,
  LlmToolCall,
  LlmToolDefinition,
} from "../types";

// --- models ---

export const OLLAMA_CHAT_MODEL = "gemma4:12b";
export const OLLAMA_EMBED_MODEL = "qwen3-embedding:4b";
export const OLLAMA_TRANSLATE_MODEL = "translategemma:latest";

// --- ollama (embed / translate) ---

type OllamaMessageRole = "system" | "user" | "assistant" | "tool";

interface OllamaMessage {
  role: OllamaMessageRole;
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface OllamaToolCall {
  id?: string;
  type?: string;
  function: {
    name: string;
    arguments?: Record<string, unknown> | string;
  };
}

interface OllamaChatOptions {
  temperature?: number;
  stream?: boolean;
  think?: boolean;
  num_ctx?: number;
  num_predict?: number;
}

interface OllamaChatRequest extends OllamaChatOptions {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: OllamaMessageRole;
    content: string;
    thinking?: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

interface OllamaClientConfig {
  baseUrl?: string;
  defaultOptions?: OllamaChatOptions;
}

const DEFAULTS: Required<OllamaClientConfig> = {
  baseUrl: process.env.OLLAMA_BASE_URL || "ollama-temp.amfphub.com",
  defaultOptions: {
    temperature: 0.2,
    stream: false,
    think: false,
    num_ctx: 16384,
    num_predict: 4096,
  },
};

function toOllamaMessages(messages: LlmChatMessage[]): OllamaMessage[] {
  return messages.map((message) => {
    const base: OllamaMessage = {
      role: message.role === "tool" ? "tool" : message.role,
      content: message.content,
    };
    if (message.role === "assistant" && message.toolCalls?.length) {
      base.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.arguments,
        },
      }));
    }
    if (message.role === "tool" && message.name) {
      base.tool_name = message.name;
    }
    return base;
  });
}

function toOllamaTools(tools: LlmToolDefinition[]): OllamaTool[] {
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

// --- bonsai (live chat) ---

const BONSAI_BASE_URL = (
  process.env.BONSAI_BASE_URL || "http://192.168.1.4:11437"
).replace(/\/$/, "");
/** Live chat / tool-turn model on the Bonsai OpenAI-compatible endpoint. */
export const BONSAI_CHAT_MODEL = "bonsai2";
const BONSAI_MAX_TOKENS = DEFAULTS.defaultOptions.num_predict ?? 4096;

interface BonsaiMessage {
  role: OllamaMessageRole;
  content: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface BonsaiToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface BonsaiChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: BonsaiToolCallDelta[];
    };
  }>;
}

function toBonsaiMessages(messages: LlmChatMessage[]): BonsaiMessage[] {
  const systemParts: string[] = [];
  const rest: LlmChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      const text = message.content.trim();
      if (text) systemParts.push(text);
      continue;
    }
    rest.push(message);
  }

  const out: BonsaiMessage[] = [];
  if (systemParts.length > 0) {
    out.push({ role: "system", content: systemParts.join("\n\n") });
  }

  for (const message of rest) {
    const item: BonsaiMessage = {
      role: message.role,
      content: message.content,
    };
    if (message.role === "assistant" && message.reasoningContent) {
      item.reasoning_content = message.reasoningContent;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      item.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      }));
    }
    if (message.role === "tool" && message.toolCallId) {
      item.tool_call_id = message.toolCallId;
    }
    if (message.role === "tool" && message.name) {
      item.name = message.name;
    }
    out.push(item);
  }
  return out;
}

function parseToolArguments(
  raw: Record<string, unknown> | string | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function applyBonsaiToolDeltas(
  acc: Map<number, { id: string; name: string; arguments: string }>,
  deltas: BonsaiToolCallDelta[] | undefined,
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

function bonsaiToolCalls(
  acc: Map<number, { id: string; name: string; arguments: string }>,
): LlmToolCall[] {
  const out: LlmToolCall[] = [];
  for (const index of [...acc.keys()].sort((a, b) => a - b)) {
    const item = acc.get(index);
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

function parseBonsaiSseLine(line: string): BonsaiChunk | "done" | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith("data:")
    ? trimmed.slice("data:".length).trim()
    : trimmed;
  if (payload === "[DONE]") return "done";
  if (!payload.startsWith("{")) return null;
  return JSON.parse(payload) as BonsaiChunk;
}

// --- translate ---

export type TranslateLanguage = {
  lang: string;
  code: string;
};

function buildTranslatePrompt(
  from: TranslateLanguage,
  to: TranslateLanguage,
  text: string,
): string {
  const sourceLang = from.lang.trim();
  const sourceCode = from.code.trim();
  const targetLang = to.lang.trim();
  const targetCode = to.code.trim();
  if (!sourceLang || !sourceCode || !targetLang || !targetCode) {
    throw new Error("Translate requires lang and code for both from and to");
  }

  return `You are a professional ${sourceLang} (${sourceCode}) to ${targetLang} (${targetCode}) translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLang} text while adhering to ${targetLang} grammar, vocabulary, and cultural sensitivities.
Produce only the ${targetLang} translation, without any additional explanations or commentary. Please translate the following ${sourceLang} text into ${targetLang}:


${text}`;
}

// --- unused ---

function parseToolCalls(
  raw:
    | Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: Record<string, unknown> | string;
        };
      }>
    | undefined,
): LlmToolCall[] {
  if (!raw?.length) return [];
  const out: LlmToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const name = item.function?.name?.trim();
    if (!name) continue;
    out.push({
      id: item.id?.trim() || `call_${i}_${name}`,
      name,
      arguments: parseToolArguments(item.function?.arguments),
    });
  }
  return out;
}

/** Ollama may send cumulative content or deltas   emit only the new suffix. */
function nextDelta(
  previous: string,
  content: string,
): { delta: string; previous: string } {
  if (content.startsWith(previous)) {
    return { delta: content.slice(previous.length), previous: content };
  }
  return { delta: content, previous: previous + content };
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly bonsaiBaseUrl: string;
  private readonly defaultOptions: OllamaChatOptions;

  constructor(config?: OllamaClientConfig) {
    this.baseUrl = (config?.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.bonsaiBaseUrl = BONSAI_BASE_URL;
    this.defaultOptions = {
      ...DEFAULTS.defaultOptions,
      ...config?.defaultOptions,
    };
  }

  // --- public ---

  async *streamChat(
    messages: LlmChatMessage[],
    config: LlmChatConfig,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    for await (const chunk of this.bonsaiChatStream({
      messages,
      temperature: config.temperature,
      signal,
    })) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }

  /**
   * Stream a tool-capable turn: tokens go to `onToken` as they arrive.
   * Tool calls (if any) are returned only after the stream ends.
   * When the model calls tools, content is usually empty   if not, callers
   * should treat streamed text as speculative.
   */
  async streamChatTurn(
    messages: LlmChatMessage[],
    config: LlmChatConfig,
    tools: LlmToolDefinition[] = [],
    onToken?: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmChatTurnResult> {
    return this.collectBonsaiTurn(messages, config, tools, onToken, signal);
  }

  async chatTurn(
    messages: LlmChatMessage[],
    config: LlmChatConfig,
    tools: LlmToolDefinition[] = [],
    signal?: AbortSignal,
  ): Promise<LlmChatTurnResult> {
    return this.collectBonsaiTurn(messages, config, tools, undefined, signal);
  }

  async embed(
    text: string,
    model = OLLAMA_EMBED_MODEL,
    signal?: AbortSignal,
  ): Promise<OllamaEmbedResponse> {
    this.logRequest("POST", "/api/embed", model);
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
      signal,
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    return (await response.json()) as OllamaEmbedResponse;
  }

  /** Lightweight connectivity check (GET /api/tags). Throws if Ollama is unreachable. */
  async assertReachable(): Promise<void> {
    logger.info(`Checking Ollama reachability at ${this.baseUrl}`);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
      });
      logger.info(`Ollama response: ${response.status}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Ollama is unreachable at ${this.baseUrl}: ${detail}`);
    }

    if (!response.ok) {
      throw await this.createHttpError(response);
    }
  }

  /**
   * Translate `text` from `from` → `to` via TranslateGemma.
   * Pass display name + code for each side, e.g. `{ lang: "English", code: "en" }`.
   */
  async translate(
    from: TranslateLanguage,
    to: TranslateLanguage,
    text: string,
    model = OLLAMA_TRANSLATE_MODEL,
  ): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const response = await this.chat({
      model,
      messages: toOllamaMessages([
        { role: "user", content: buildTranslatePrompt(from, to, trimmed) },
      ]),
      temperature: 0.2,
      think: false,
    });
    return response.message?.content?.trim() ?? "";
  }

  // --- bonsai (live chat) ---

  private async collectBonsaiTurn(
    messages: LlmChatMessage[],
    config: LlmChatConfig,
    tools: LlmToolDefinition[],
    onToken: ((token: string) => void) | undefined,
    signal?: AbortSignal,
  ): Promise<LlmChatTurnResult> {
    let text = "";
    let reasoningContent = "";
    const toolAcc = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of this.bonsaiChatStream({
      messages,
      temperature: config.temperature,
      tools,
      signal,
    })) {
      const delta = chunk.choices?.[0]?.delta;
      const content = delta?.content;
      if (content) {
        text += content;
        onToken?.(content);
      }
      if (delta?.reasoning_content) {
        reasoningContent += delta.reasoning_content;
      }
      applyBonsaiToolDeltas(toolAcc, delta?.tool_calls);
    }

    return {
      text: text.trim(),
      toolCalls: bonsaiToolCalls(toolAcc),
      ...(reasoningContent ? { reasoningContent } : {}),
    };
  }

  private async *bonsaiChatStream(input: {
    messages: LlmChatMessage[];
    temperature?: number;
    tools?: LlmToolDefinition[];
    signal?: AbortSignal;
  }): AsyncGenerator<BonsaiChunk> {
    logger.info(
      `Bonsai POST /v1/chat/completions model=${BONSAI_CHAT_MODEL}`,
      "llm/ollama/ollamaClient.ts",
      "request",
    );
    const response = await fetch(`${this.bonsaiBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: BONSAI_CHAT_MODEL,
        messages: toBonsaiMessages(input.messages),
        max_tokens: BONSAI_MAX_TOKENS,
        stream: true,
        temperature: input.temperature ?? this.defaultOptions.temperature,
        ...(input.tools && input.tools.length > 0
          ? { tools: toOllamaTools(input.tools) }
          : {}),
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }
    if (!response.body) {
      throw new Error("Bonsai stream response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (input.signal?.aborted) {
        throw input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error("Bonsai request aborted");
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const chunk = parseBonsaiSseLine(line);
        if (chunk === "done") return;
        if (chunk) yield chunk;
      }
    }

    const trailing = parseBonsaiSseLine(buffer);
    if (trailing && trailing !== "done") yield trailing;
  }

  // --- ollama (translate) ---

  /** Ollama `/api/chat`. Used by translate only. Answer generation uses bonsai. */
  private async chat(
    options: Omit<OllamaChatRequest, "stream">,
    signal?: AbortSignal,
  ): Promise<OllamaChatResponse> {
    this.logRequest("POST", "/api/chat", options.model);
    const body = this.buildRequestBody({ ...options, stream: false });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    return (await response.json()) as OllamaChatResponse;
  }

  private buildRequestBody(
    options: OllamaChatRequest,
  ): Record<string, unknown> {
    const merged: OllamaChatRequest = {
      ...this.defaultOptions,
      ...options,
    };
    const {
      model,
      messages,
      tools,
      stream = false,
      think = false,
      temperature = DEFAULTS.defaultOptions.temperature,
      num_ctx = DEFAULTS.defaultOptions.num_ctx,
      num_predict = DEFAULTS.defaultOptions.num_predict,
    } = merged;

    return {
      model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      stream,
      think,
      options: {
        temperature,
        num_ctx,
        num_predict,
      },
    };
  }

  // --- unused ---

  /**
   * Inactive. Answer generation uses `bonsaiChatStream`.
   * Kept so the previous Ollama `/api/chat` stream can be turned back on.
   */
  private async *chatStream(
    options: Omit<OllamaChatRequest, "stream">,
    signal?: AbortSignal,
  ): AsyncGenerator<OllamaChatResponse> {
    this.logRequest("POST", "/api/chat", options.model);
    const body = this.buildRequestBody({ ...options, stream: true });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    if (!response.body) {
      throw new Error("Ollama stream response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new Error("Ollama request aborted");
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        yield JSON.parse(trimmed) as OllamaChatResponse;
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      yield JSON.parse(trailing) as OllamaChatResponse;
    }
  }

  // --- http ---

  private logRequest(method: string, path: string, model?: string): void {
    logger.info(
      model
        ? `Ollama ${method} ${path} model=${model}`
        : `Ollama ${method} ${path}`,
      "llm/ollama/ollamaClient.ts",
      "request",
    );
  }

  private async createHttpError(response: Response): Promise<Error> {
    const errorBody = await response.text();
    return new Error(
      `Ollama request failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }
}

export const ollamaClient = new OllamaClient();
