import { env } from "../../environment/env";
import { logger } from "../../logger/logger";

export const RERANKER_MODEL = "Qwen3-Reranker-0.6B";

export type RerankResult = {
  index: number;
  relevance_score: number;
};

export type RerankResponse = {
  model: string;
  object: "list";
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
  results: RerankResult[];
};

export type RerankerClientConfig = {
  baseUrl?: string;
};

const logSource = "llm/reranker/rerankerClient.ts";

function isRerankResult(value: unknown): value is RerankResult {
  if (!value || typeof value !== "object") return false;
  const record = value as { index?: unknown; relevance_score?: unknown };
  return (
    typeof record.index === "number" &&
    Number.isFinite(record.index) &&
    typeof record.relevance_score === "number" &&
    Number.isFinite(record.relevance_score)
  );
}

function isRerankResponse(value: unknown): value is RerankResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as {
    object?: unknown;
    usage?: unknown;
    results?: unknown;
  };
  if (record.object !== "list" || !Array.isArray(record.results)) return false;
  if (!record.results.every(isRerankResult)) return false;
  if (!record.usage || typeof record.usage !== "object") return false;
  const usage = record.usage as {
    prompt_tokens?: unknown;
    total_tokens?: unknown;
  };
  return (
    typeof usage.prompt_tokens === "number" &&
    typeof usage.total_tokens === "number"
  );
}

export class RerankerClient {
  private readonly baseUrl: string;

  constructor(config?: RerankerClientConfig) {
    this.baseUrl = (config?.baseUrl ?? env.rerankerBaseUrl).replace(/\/$/, "");
  }

  async rerank(
    query: string,
    documents: string[],
    model: string = RERANKER_MODEL,
  ): Promise<RerankResponse> {
    if (documents.length === 0) {
      return {
        model,
        object: "list",
        usage: { prompt_tokens: 0, total_tokens: 0 },
        results: [],
      };
    }

    const response = await fetch(`${this.baseUrl}/v1/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, query, documents }),
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    const parsed: unknown = await response.json();
    if (!isRerankResponse(parsed)) {
      throw new Error("Reranker response is missing results");
    }
    return parsed;
  }

  private async createHttpError(response: Response): Promise<Error> {
    const errorBody = await response.text();
    logger.error(
      `Reranker request failed (${response.status}): ${errorBody || response.statusText}`,
      logSource,
      "createHttpError",
    );
    return new Error(
      `Reranker request failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }
}

export const rerankerClient = new RerankerClient();
