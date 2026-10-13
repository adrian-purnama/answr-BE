import { Types } from "mongoose";
import { logger } from "../logger/logger";
import { DEEPSEEK_CHAT_MODEL } from "./deepseek/deepseekClient";
import {
  DeepseekTurnError,
  deepseekProvider,
} from "./deepseek/deepseekProvider";
import {
  addDeepseekTokens,
  resolveDeepseekQuota,
  shouldUseDeepseek,
} from "./deepseek/deepseekQuota";
import { ollamaClient, OLLAMA_CHAT_MODEL } from "./ollama/ollamaClient";
import type {
  LlmChatMessage,
  LlmChatTurnResult,
  LlmTokenUsage,
  LlmToolDefinition,
} from "./types";

export type ChatTurnWithQuotaOptions = {
  userId: string | Types.ObjectId;
  messages: LlmChatMessage[];
  temperature?: number;
  think?: boolean;
  tools?: LlmToolDefinition[];
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  /** Skip DeepSeek (e.g. test mode, or sticky fallback after a DeepSeek failure). */
  forceOllama?: boolean;
  logSource?: string;
};

export type ChatTurnWithQuotaResult = LlmChatTurnResult & {
  provider: "deepseek" | "ollama";
};

export type ChatWithQuotaOptions = Omit<
  ChatTurnWithQuotaOptions,
  "tools" | "onToken"
>;

/** Cap a single completion so one request cannot eat the whole remaining budget. */
const DEEPSEEK_MAX_TOKENS_CAP = 8192;

function toObjectId(userId: string | Types.ObjectId): Types.ObjectId | null {
  if (userId instanceof Types.ObjectId) return userId;
  if (typeof userId === "string" && Types.ObjectId.isValid(userId)) {
    return new Types.ObjectId(userId);
  }
  return null;
}

function estimateTokensFromMessages(messages: LlmChatMessage[]): {
  inputTokens: number;
  outputTokens: number;
} {
  const chars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  const inputTokens = Math.max(1, Math.ceil(chars / 4));
  return { inputTokens, outputTokens: 0 };
}

function usageFromTurn(
  turn: { usage?: LlmTokenUsage },
  messages: LlmChatMessage[],
  logSource: string,
): { inputTokens: number; outputTokens: number; estimated: boolean } {
  const prompt = turn.usage?.promptTokens ?? 0;
  const completion = turn.usage?.completionTokens ?? 0;
  if (prompt > 0 || completion > 0) {
    return {
      inputTokens: Math.max(0, Math.trunc(prompt)),
      outputTokens: Math.max(0, Math.trunc(completion)),
      estimated: false,
    };
  }
  const estimate = estimateTokensFromMessages(messages);
  logger.warn(
    `DeepSeek usage missing; recording ESTIMATED tokens input=${estimate.inputTokens} output=${estimate.outputTokens}`,
    logSource,
    "chatWithQuota",
  );
  return { ...estimate, estimated: true };
}

async function recordTokens(
  userId: Types.ObjectId,
  tokens: { inputTokens: number; outputTokens: number },
  logSource: string,
): Promise<void> {
  if (tokens.inputTokens <= 0 && tokens.outputTokens <= 0) return;
  try {
    await addDeepseekTokens(userId, tokens);
  } catch (error) {
    logger.error(
      error instanceof Error
        ? error.message
        : "Failed to record DeepSeek usage",
      logSource,
      "chatWithQuota",
    );
  }
}

/**
 * DeepSeek when the user has quota (unless forceOllama), else Ollama.
 * DeepSeek failures fall back to Ollama (unless aborted). Successful
 * DeepSeek turns increment the period-window token counters.
 */
export async function chatTurnWithQuota(
  options: ChatTurnWithQuotaOptions,
): Promise<ChatTurnWithQuotaResult> {
  const logSource = options.logSource ?? "llm/chatWithQuota.ts";
  const oid = toObjectId(options.userId);
  const temperature = options.temperature ?? 0.2;
  const tools = options.tools ?? [];

  const useDeepseek =
    !options.forceOllama &&
    oid != null &&
    (await shouldUseDeepseek(oid));

  if (useDeepseek && oid) {
    const snapshot = await resolveDeepseekQuota(oid);
    const remaining = snapshot?.remaining ?? 0;
    const maxTokens =
      remaining > 0
        ? Math.min(DEEPSEEK_MAX_TOKENS_CAP, Math.max(1, remaining))
        : undefined;

    try {
      const turn = await deepseekProvider.streamChatTurn(
        options.messages,
        {
          provider: "deepseek",
          name: DEEPSEEK_CHAT_MODEL,
          temperature,
          think: options.think,
          ...(maxTokens != null ? { maxTokens } : {}),
        },
        tools,
        options.onToken,
      );
      const tokens = usageFromTurn(turn, options.messages, logSource);
      await recordTokens(oid, tokens, logSource);
      return { ...turn, provider: "deepseek" };
    } catch (error) {
      if (options.signal?.aborted) throw error;

      const partialUsage =
        error instanceof DeepseekTurnError ? error.usage : undefined;
      if (partialUsage || error instanceof DeepseekTurnError) {
        const tokens = usageFromTurn(
          { usage: partialUsage },
          options.messages,
          logSource,
        );
        await recordTokens(oid, tokens, logSource);
      }

      logger.error(
        error instanceof Error ? error.message : "DeepSeek chat failed",
        logSource,
        "chatWithQuota",
      );
    }
  }

  const turn = await ollamaClient.streamChatTurn(
    options.messages,
    {
      provider: "ollama",
      name: OLLAMA_CHAT_MODEL,
      temperature,
      think: options.think,
    },
    tools,
    options.onToken,
    options.signal,
  );
  return { ...turn, provider: "ollama" };
}

/** Non-tool convenience wrapper that returns reply text only. */
export async function chatWithQuota(
  options: ChatWithQuotaOptions,
): Promise<string> {
  const turn = await chatTurnWithQuota(options);
  return turn.text;
}
