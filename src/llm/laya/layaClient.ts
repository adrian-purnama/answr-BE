import { env } from "../../environment/env";
import { logger } from "../../logger/logger";

export type LayaChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type LayaScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};

export type LayaNoulQuestion = {
  type: "noul";
  instructions: string;
};

export type LayaQuestion =
  | LayaChoiceQuestion
  | LayaScoreQuestion
  | LayaNoulQuestion;

export type LayaPredictRequest = {
  state: Record<string, string>;
  questions: Record<string, LayaQuestion>;
};

export type LayaAction = {
  act_probability: number;
};

export type LayaChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  action: LayaAction;
};

export type LayaScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
  action: LayaAction;
};

export type LayaNoulAnswer = {
  type: "noul";
  noul: number;
  confidence: number;
  action: LayaAction;
};

export type LayaAnswer = LayaChoiceAnswer | LayaScoreAnswer | LayaNoulAnswer;

export type LayaRoutingDetection = {
  script: string;
  script_profile: Record<string, number>;
  language: string;
  is_english: boolean;
  language_undecided: boolean;
  diacritic_rate: number;
  non_latin_fraction: number;
};

export type LayaRouting = {
  model: string;
  repo: string;
  reason: string;
  detection: LayaRoutingDetection;
  workflow: string | null;
};

export type LayaPredictResponse = {
  model: string;
  answers: Record<string, LayaAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  routing: LayaRouting;
};

export type LayaClientConfig = {
  baseUrl?: string;
};

const logSource = "llm/laya/layaClient.ts";

function isPredictResponse(value: unknown): value is LayaPredictResponse {
  if (!value || typeof value !== "object") return false;
  const answers = (value as { answers?: unknown }).answers;
  return (
    answers !== null && typeof answers === "object" && !Array.isArray(answers)
  );
}

export class LayaClient {
  private readonly baseUrl: string;

  constructor(config?: LayaClientConfig) {
    this.baseUrl = (config?.baseUrl ?? env.layaBaseUrl).replace(/\/$/, "");
  }

  async predict(body: LayaPredictRequest): Promise<LayaPredictResponse> {
    const response = await fetch(`${this.baseUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    const parsed: unknown = await response.json();
    if (!isPredictResponse(parsed)) {
      throw new Error("Laya response is missing answers");
    }
    return parsed;
  }

  private async createHttpError(response: Response): Promise<Error> {
    const errorBody = await response.text();
    logger.error(
      `Laya request failed (${response.status}): ${errorBody || response.statusText}`,
      logSource,
      "createHttpError",
    );
    return new Error(
      `Laya request failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }
}

export const layaClient = new LayaClient();
