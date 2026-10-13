export type LlmProviderName = "ollama" | "deepseek";

export type LlmChatRole = "system" | "user" | "assistant" | "tool";

export type LlmChatMessage = {
  role: LlmChatRole;
  content: string;
  /** Present on assistant messages that requested tools. */
  toolCalls?: LlmToolCall[];
  /** DeepSeek thinking content. Required on later turns when the request includes tools. */
  reasoningContent?: string;
  /** Present on tool-result messages. */
  toolCallId?: string;
  name?: string;
};

export type LlmChatConfig = {
  provider: LlmProviderName;
  name: string;
  temperature?: number;
  /** Cap completion tokens (e.g. remaining DeepSeek quota). */
  maxTokens?: number;
  /** Ollama thinking. Default false (customer replies). Classifiers may set true. */
  think?: boolean;
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object for arguments. */
  parameters: Record<string, unknown>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmTokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type LlmChatTurnResult = {
  text: string;
  toolCalls: LlmToolCall[];
  /** DeepSeek thinking content for the assistant tool-call replay. */
  reasoningContent?: string;
  usage?: LlmTokenUsage;
};
